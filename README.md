<img alt="Matter.js" src="https://brm.io/matter-js/img/matter-js.svg" width="300">

A performance fork of [`matter-js@0.20.0`](https://github.com/liabru/matter-js) (a 2D rigid body physics engine), tuned for scenes that are mostly static bodies.

Built for [Page Rage](https://page-rage.com), where a web page is shattered into thousands of static tiles with debris moving through them. Upstream is dormant, so the work lives here.

## Rationale

Stock `matter-js` does per-step work that scales with _total_ body count: the sweep broadphase re-sorts every body on every step, and the engine walks the whole world several times per update. On a scene with `5000` static tiles and `50` movers, almost all of that work rediscovers that nothing moved.

This fork makes per-step cost scale with the number of _moving_ bodies instead: `2-7x` faster on Page Rage scenes, with up to `-96%` allocation per step.

## Installation

Install from a release tag (`v0.20.0-perfN`). The built bundle (`build/matter.js`) is committed, so there is no build step.

```bash
npm install https://github.com/alexreardon/matter-js/archive/refs/tags/v0.20.0-perf9.tar.gz
```

## Usage

The classic sweep broadphase stays the default. The biggest win is the opt-in `gridStatic` broadphase:

```js
Matter.Detector._mode = 'gridStatic';

// optional (defaults to 32): tune to roughly your typical static body size
Matter.Detector._cellSize = 32;

// a static body that moves must be tagged, or the grid will not re-index it
Matter.Detector.setGridDynamic(body, true);
```

`gridStatic` buckets static bodies into a grid once and keeps the index up to date as bodies come and go. Each step only movers are re-bucketed, and only movers generate candidate pairs — the static field is never tested against itself. Use it when your scene is mostly static scenery: tile maps, level geometry, destructible terrain. On scenes with few statics there is nothing to skip and the bookkeeping costs `4-13%`, which is why it is opt-in.

## Performance

Time for one `Engine.update` (lower is faster):

| Scenario | Bodies | Upstream `0.20.0` | Fork | Fork (new gridStatic algorithm) |
| --- | --- | --- | --- | --- |
| **General** | | | | |
| Box stack settling | `339` | `297us` | `213us` (`-28%`) | `239us` (`-19%`) |
| Mixed shapes pile | `303` | `1053us` | `881us` (`-16%`) | `932us` (`-11%`) |
| Constraint chains | `315` | `341us` | `278us` (`-18%`) | `290us` (`-15%`) |
| Sleeping enabled | `403` | `375us` | `274us` (`-27%`) | `310us` (`-17%`) |
| Moving static platforms | `319` | `516us` | `394us` (`-24%`) | `428us` (`-17%`) |
| **[Page Rage](https://page-rage.com)** | | | | |
| Page, calm | `5,303` | `2514us` | `1412us` (`-44%`) | `555us` (`-78%`) |
| Page, debris raining | `5,303` | `2466us` | `1382us` (`-44%`) | `530us` (`-78%`) |
| Page, firing | `5,311` | `2563us` | `1459us` (`-43%`) | `594us` (`-77%`) |
| Page, 800-mover storm | `5,803` | `4808us` | `3083us` (`-36%`) | `1811us` (`-62%`) |
| Page, being destroyed | `5,003` | `6073us` | `5087us` (`-16%`) | `2023us` (`-67%`) |
| Page, calm (2000 tiles) | `2,303` | `1033us` | `692us` (`-33%`) | `484us` (`-53%`) |
| Page, calm (8000 tiles) | `8,303` | `4135us` | `2379us` (`-42%`) | `588us` (`-86%`) |

Heap growth per step (less garbage means fewer GC pauses mid-simulation):

| Scenario | Upstream `0.20.0` | Fork | Fork (new gridStatic algorithm) |
| --- | --- | --- | --- |
| Box stack settling | `35.8 KB` | `5.1 KB` (`-86%`) | `2.9 KB` (`-92%`) |
| Mixed shapes pile | `84.6 KB` | `21.5 KB` (`-75%`) | `14.4 KB` (`-83%`) |
| Constraint chains | `193.9 KB` | `167.5 KB` (`-14%`) | `151.1 KB` (`-22%`) |
| Sleeping enabled | `46.4 KB` | `11.7 KB` (`-75%`) | `11.0 KB` (`-76%`) |
| Moving static platforms | `89.1 KB` | `55.0 KB` (`-38%`) | `38.0 KB` (`-57%`) |
| Page, calm | `133.0 KB` | `59.7 KB` (`-55%`) | `5.1 KB` (`-96%`) |
| Page, debris raining | `127.2 KB` | `63.5 KB` (`-50%`) | `10.3 KB` (`-92%`) |
| Page, firing | `135.9 KB` | `71.0 KB` (`-48%`) | `14.8 KB` (`-89%`) |
| Page, 800-mover storm | `288.7 KB` | `116.7 KB` (`-60%`) | `40.4 KB` (`-86%`) |
| Page, being destroyed | `1283.8 KB` | `1216.0 KB` (`-5%`) | `363.7 KB` (`-72%`) |
| Page, calm (2000 tiles) | `87.7 KB` | `30.1 KB` (`-66%`) | `6.4 KB` (`-93%`) |
| Page, calm (8000 tiles) | `160.1 KB` | `91.8 KB` (`-43%`) | `6.7 KB` (`-96%`) |

<details>
<summary>How these are measured</summary>

`npm run bench-suite` runs [`bench/suite.js`](bench/suite.js): this fork against stock `matter-js@0.20.0`, in one process, on identical worlds, in alternating timed blocks. The stock baseline is provisioned automatically as a git worktree of the `0.20.0` tag. Three arms keep the broadphase separable from the rest of the work: upstream, the fork held to upstream's sweep, and the fork with `gridStatic`.

Simulation time is microseconds per `Engine.update`: the mean of the fastest fifth of `24` blocks per arm, best of three separate processes (a single process can run hot), on an Apple M1 Pro under Node 24. Memory is heap growth per step across collection-free windows (`npm run bench-suite -- --alloc`), so short-lived garbage counts too.

The general scenes are typical matter scenes — a few hundred dynamic bodies, no static field — and exist to catch regressions outside the regime this fork targets. The page scenes are that regime.

What the tables say:

- The win grows with the size of the static field: `-53%` at `2000` tiles, `-78%` at `5000`, `-86%` at `8000`.
- `gridStatic` costs `4-13%` on the general scenes (nothing to skip) and is worth a further `1.4x` to `4x` on a page. That is why it is opt-in.
- The narrowest wins are scenes dominated by work the fork did not change: contact solving in the storm, `Body.create` in the destruction scene.

</details>

## What changed

Each change was A/B'd on its own against the previous release tag. Benefit is whole-step `Engine.update` time on the target scene unless stated otherwise.

| Change | Benefit |
| --- | --- |
| **`gridStatic` broadphase** — statics are indexed once; each step only movers are re-bucketed and generate candidate pairs | `-65%` to `-89%` on dense static scenes |
| **Hidden-class hygiene** — every per-body scratch field is declared in `Body.create` instead of added on first use | lazily-added fields split object shapes and made every hot phase `1.3-4.8x` slower |
| **Engine pass scoping** — gravity, integration and solver passes iterate a movers list instead of scanning every body | `-14%` to `-31%` |
| **Flat solver data** — solver iterations run over flat snapshot arrays; grid cell tables are open-addressed flat arrays | `-14%` to `-19%` |
| **No whole-world walk per step** — the last full-body scans are gone (cached mover lists, typed-array bounds) | `-22%` to `-25%`, growing with scene size |
| **Static index maintained, not rebuilt** — membership changes are applied as a difference instead of firing a full rebuild | `-45%` while bodies are added and removed every step |
| **Removed bodies stop being simulated** — a removed body's decaying position impulse is cleared | `-2%` during churn, and a correctness fix |
| **Allocation micro-optimisations** — numeric pair ids, a collision record cache, an unrolled box-vs-box SAT path | `-34%` allocation per update |

## Differences from stock

- `Detector.setGridDynamic(body, true)` is the only supported way to tag a static body that moves. Setting `body._gridDynamic` by hand no longer works.
- Change `body.isStatic` / `body.isSleeping` through `Body.setStatic` / `Sleeping.set` (which is what upstream documents anyway). Direct assignment leaves cached mover lists stale.
- A resting body's `force` / `torque` is only zeroed once it starts moving again. Unchanged when sleeping is enabled.
- `pair.id` is a number rather than a string.
- A body removed from a composite has its `positionImpulse` cleared, so it stops being simulated (this matches what stock effectively did).
- A body belongs to one `gridStatic` detector at a time.

## Correctness

A tiered determinism spec ([`test/Determinism.spec.js`](test/Determinism.spec.js)) pins settle scenes within a tight epsilon and holds chaotic scenes to physical invariants, alongside upstream's example suite. The simulation stays deterministic, but collisions are emitted in a different (still deterministic) order than stock.

## Everything else

Demos, docs, features, plugins and examples: see the [upstream readme](https://github.com/liabru/matter-js#readme).

## License

Matter.js is licensed under [The MIT License (MIT)](https://opensource.org/licenses/MIT)
Copyright (c) Liam Brummitt and contributors.

This license is also supplied with the release and source code.
As stated in the license, absolutely no warranty is provided.
