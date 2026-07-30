<img alt="Matter.js" src="https://brm.io/matter-js/img/matter-js.svg" width="300">

A performance fork of [`matter-js@0.20.0`](https://github.com/liabru/matter-js) (a 2D rigid body physics engine). Two modes:

1. **Drop-in** (default) — same API, everything is just faster.
2. **`gridStatic`** (opt-in) — faster again for scenes that are mostly static bodies.

Built for [Page Rage](https://page-rage.com), where a web page is shattered into thousands of static tiles with debris moving through them. Upstream is dormant, so the work lives here.

## Rationale

As a drop-in replacement this fork is always faster than upstream: `16-44%` faster per `Engine.update` on every benchmarked scene, with less allocation everywhere.

For scenes that are mostly static bodies, the opt-in `gridStatic` mode goes further. Upstream's per-step work scales with _total_ body count — the sweep broadphase re-sorts every body on every step, and the engine walks the whole world several times per update, so on a scene with `5000` static tiles and `50` movers almost all of that work rediscovers that nothing moved. The opt-in `gridStatic` broadphase makes per-step cost scale with the number of _moving_ bodies instead: `2-7x` faster than upstream on [Page Rage](https://page-rage.com) scenes, with up to `-96%` allocation per step.

## Installation

Install from a release tag (`v0.20.0-perfN`). The built bundle (`build/matter.js`) is committed, so there is no build step.

```bash
npm install https://github.com/alexreardon/matter-js/archive/refs/tags/v0.20.0-perf9.tar.gz
```

## Usage

### Drop-in mode (default)

Nothing to change: the API and the classic sweep broadphase are the same as upstream, and every scene runs faster.

### `gridStatic` mode (opt-in)

For scenes that are mostly static bodies:

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

| Scenario | Bodies | Upstream `0.20.0` | Fork (drop-in) | Fork (`gridStatic`) |
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

| Scenario | Upstream `0.20.0` | Fork (drop-in) | Fork (`gridStatic`) |
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

`npm run bench-suite` runs [`bench/suite.js`](bench/suite.js): this fork against upstream `matter-js@0.20.0`, in one process, on identical worlds, in alternating timed blocks. The upstream baseline is provisioned automatically as a git worktree of the `0.20.0` tag. Three arms keep the broadphase separable from the rest of the work: upstream, the fork in drop-in mode (upstream's sweep broadphase), and the fork in `gridStatic` mode.

Simulation time is microseconds per `Engine.update`: the mean of the fastest fifth of `24` blocks per arm, best of three separate processes (a single process can run hot), on an Apple M1 Pro under Node 24. Memory is heap growth per step across collection-free windows (`npm run bench-suite -- --alloc`), so short-lived garbage counts too.

The general scenes are typical matter scenes — a few hundred dynamic bodies, no static field — and exist to catch regressions outside the regime this fork targets. The page scenes are that regime.

What the tables say:

- The win grows with the size of the static field: `-53%` at `2000` tiles, `-78%` at `5000`, `-86%` at `8000`.
- `gridStatic` costs `4-13%` on the general scenes (nothing to skip) and is worth a further `1.4x` to `4x` on a page. That is why it is opt-in.
- The narrowest wins are scenes dominated by work the fork did not change: contact solving in the storm, `Body.create` in the destruction scene.

</details>

## Compared to Rapier (Rust via WASM)

Why not swap the engine for [Rapier](https://rapier.rs/) and take the native-code win? Because step time is not the number a game pays. The renderer lives in JS, so every frame pulls every body's position and rotation back across the WASM boundary — and destruction gameplay crosses it again for every body added or removed.

[`bench/vs-rapier.js`](bench/vs-rapier.js) runs the suite scenes on both engines. Rapier gets its best case: the SIMD build, `lengthUnit` per its pixel-world docs, cached body refs, poses read into a preallocated `Float64Array`. Worlds are workload-identical (same seeded geometry, matched gravity, damping and combine rules) and sleeping is off everywhere, because [Page Rage](https://page-rage.com) cannot use it. **Step only** is `world.step()` alone — a ceiling no real game can run at. **+ readback** adds the per-frame readback a JS renderer cannot skip.

Time for one step (lower is faster):

| Scenario | Bodies | Upstream `0.20.0` | Fork (`gridStatic`) | Rapier (step only) | Rapier (+ readback) |
| --- | --- | --- | --- | --- | --- |
| **General** | | | | | |
| Box stack settling | `339` | `311us` | `256us` (`-18%`) | `462us` (`+49%`) | `599us` (`+93%`) |
| Mixed shapes pile | `303` | `1060us` | `943us` (`-11%`) | `379us` (`-64%`) | `499us` (`-53%`) |
| **[Page Rage](https://page-rage.com)** | | | | | |
| Page, calm | `5,303` | `2379us` | `567us` (`-76%`) | `421us` (`-82%`) | `531us` (`-78%`) |
| Page, firing | `5,311` | `2474us` | `600us` (`-76%`) | `450us` (`-82%`) | `561us` (`-77%`) |
| Page, 800-mover storm | `5,803` | `4656us` | `1851us` (`-60%`) | `1050us` (`-77%`) | `1385us` (`-70%`) |
| Page, being destroyed | `5,003` | `5799us` | `2103us` (`-64%`) | `1082us` (`-81%`) | `1303us` (`-78%`) |

Heap growth per step. Rapier's step barely touches the JS heap, so its readback column is pure bridge garbage — every `translation()` call materialises a fresh `{x, y}`:

| Scenario | Upstream `0.20.0` | Fork (`gridStatic`) | Rapier (step only) | Rapier (+ readback) |
| --- | --- | --- | --- | --- |
| Box stack settling | `34.2 KB` | `0.9 KB` | `0.9 KB` | `138.4 KB` |
| Mixed shapes pile | `82.3 KB` | `9.9 KB` | `1.0 KB` | `125.5 KB` |
| Page, calm | `125.2 KB` | `2.1 KB` | `1.0 KB` | `125.8 KB` |
| Page, firing | `132.7 KB` | `12.3 KB` | `3.8 KB` | `129.7 KB` |
| Page, 800-mover storm | `275.3 KB` | `29.4 KB` | `1.0 KB` | `301.3 KB` |
| Page, being destroyed | `1302.6 KB` | `379.3 KB` | `42.0 KB` | `230.2 KB` |

What the tables say:

- The bridge tax is linear: `~0.4us` per body per frame, `+20-32%` on every scene. Rapier has no batched pose API, so it is paid one `translation()` + `rotation()` call per body.
- On the calm and firing pages the bridge erases Rapier's edge over the fork: `531us` vs `567us` is a wash. Rapier keeps `25-38%` at peak load (storm, destruction).
- With sleeping off, Rapier does not uniformly win the physics either: it loses the box stack outright and wins mixed shapes big (true circle colliders; matter's are polygons).
- Readback garbage is the hidden cost: `~7.5MB/s` at 60fps on a calm page, `~60x` the fork. Destruction is the one scene where Rapier allocates less — bodies are built inside WASM.

<details>
<summary>What about sleeping?</summary>

Sleeping is where Rapier's headline numbers come from: the settled stack steps in `18us` instead of `462us` — and readback then costs `7x` the physics, still visiting 336 sleeping bodies. With sleeping on in both engines (`ALLOW_SLEEP=1 npm run bench-rapier`):

| Scenario | Fork (`gridStatic`) | Rapier (step only) | Rapier (+ readback) | Asleep (fork vs rapier) |
| --- | --- | --- | --- | --- |
| Page, calm | `314us` | `128us` | `241us` | `300/300` vs `300/300` |
| Page, firing | `380us` | `151us` | `269us` | `293` vs `300` |
| Page, being destroyed | `2770us` | `1094us` | `1313us` | `0` vs `0` — debris lives 40 frames, never sleeps |
| Page, 800-mover storm | `461us` | `1032us` | `1371us` | ⚠ `796` vs `7` — not comparable |
| Box stack settling | `268us` | `18us` | `149us` | ⚠ `0` vs `336` — not comparable |
| Mixed shapes pile | `24us` | `368us` | `492us` | ⚠ `300` vs `1` — not comparable |

Each engine sleeps different scenes: matter cannot sleep a dense stack (solver jitter stays above its threshold), Rapier will not sleep rolling circles or the storm pile. On the clean rows sleeping is worth `1.8x` to the fork and `3.3x` to Rapier — and nothing to either during destruction, where debris never lives long enough.

It also reproduced the mid-air-hang bug on first contact: `Body.setVelocity` does not wake a sleeping body, so released tiles froze in place until the bench added `Sleeping.set(body, false)` on release. The scenes where sleeping pays are the scenes the game cannot run it in.

</details>

<details>
<summary>How these are measured</summary>

Same method as the suite above: four arms in one process on identical worlds, alternating timed blocks, mean of the fastest fifth of `24` blocks, best of three processes, Apple M1 Pro under Node 22. Per-scenario sanity: equal body counts, no non-finite positions, matching settle heights.

Rapier runs its 2D defaults (`numSolverIterations: 4`, a higher-quality solver than matter's — dropping it to `1` saves only `~4%`, so the gap is not a quality knob). Gravity, damping and velocities are unit-converted so both engines integrate the same trajectories. Known impurity: 3 of 800 storm movers escape the bowl in the Rapier arms (`0.4%`, slightly flattering Rapier).

Rapier is not a devDependency. To reproduce: `npm install --no-save @dimforge/rapier2d-simd-compat`, then `npm run bench-rapier` (`--alloc` for the memory table).

</details>

## What changed

Each change was A/B'd on its own against the previous release tag. Benefit is whole-step `Engine.update` time on the target scene unless stated otherwise.

| Change | Benefit |
| --- | --- |
| **`gridStatic` broadphase (the opt-in mode)** — statics are indexed once; each step only movers are re-bucketed and generate candidate pairs | `-65%` to `-89%` on dense static scenes |
| **Hidden-class hygiene** — every per-body scratch field is declared in `Body.create` instead of added on first use | lazily-added fields split object shapes and made every hot phase `1.3-4.8x` slower |
| **Engine pass scoping** — gravity, integration and solver passes iterate a movers list instead of scanning every body | `-14%` to `-31%` |
| **Flat solver data** — solver iterations run over flat snapshot arrays; grid cell tables are open-addressed flat arrays | `-14%` to `-19%` |
| **No whole-world walk per step** — the last full-body scans are gone (cached mover lists, typed-array bounds) | `-22%` to `-25%`, growing with scene size |
| **Static index maintained, not rebuilt** — membership changes are applied as a difference instead of firing a full rebuild | `-45%` while bodies are added and removed every step |
| **Removed bodies stop being simulated** — a removed body's decaying position impulse is cleared | `-2%` during churn, and a correctness fix |
| **Allocation micro-optimisations** — numeric pair ids, a collision record cache, an unrolled box-vs-box SAT path | `-34%` allocation per update |

## Differences from upstream

In both modes:

- Change `body.isStatic` / `body.isSleeping` through `Body.setStatic` / `Sleeping.set` (which is what upstream documents anyway). Direct assignment leaves cached mover lists stale.
- A resting body's `force` / `torque` is only zeroed once it starts moving again. Unchanged when sleeping is enabled.
- `pair.id` is a number rather than a string.
- A body removed from a composite has its `positionImpulse` cleared, so it stops being simulated (this matches what upstream effectively did).

Only in `gridStatic` mode:

- `Detector.setGridDynamic(body, true)` is the only supported way to tag a static body that moves. Setting `body._gridDynamic` by hand no longer works.
- A body belongs to one `gridStatic` detector at a time.

## Correctness

A tiered determinism spec ([`test/Determinism.spec.js`](test/Determinism.spec.js)) pins settle scenes within a tight epsilon and holds chaotic scenes to physical invariants, alongside upstream's example suite. The simulation stays deterministic, but collisions are emitted in a different (still deterministic) order than upstream.

## Everything else

Demos, docs, features, plugins and examples: see the [upstream readme](https://github.com/liabru/matter-js#readme).

## License

[The MIT License (MIT)](https://opensource.org/licenses/MIT)

- Upstream Matter.js: Copyright (c) Liam Brummitt and contributors.
- This fork's changes: Copyright (c) Alexander Reardon.

The license is also supplied with the release and source code.
As stated in the license, absolutely no warranty is provided.
