<img alt="Matter.js" src="https://brm.io/matter-js/img/matter-js.svg" width="300">

A performance fork of [`matter-js@0.20.0`](https://github.com/liabru/matter-js) (a 2D rigid body physics engine). Two modes:

1. **Drop-in** (default) — same API, everything is just faster.
2. **`gridStatic`** (opt-in) — faster again for scenes that are mostly static bodies.

Built for [Page Rage](https://page-rage.com), where a web page is shattered into thousands of static tiles with debris moving through them. Upstream is dormant, so the work lives here.

## Rationale

As a drop-in replacement this fork is always faster than upstream: `17-43%` faster per `Engine.update` on every benchmarked scene, with less allocation everywhere.

For scenes that are mostly static bodies, the opt-in `gridStatic` mode goes further. Upstream's per-step work scales with _total_ body count — the sweep broadphase re-sorts every body on every step, and the engine walks the whole world several times per update, so on a scene with `5000` static tiles and `50` movers almost all of that work rediscovers that nothing moved. The opt-in `gridStatic` broadphase makes per-step cost scale with the number of _moving_ bodies instead: `2.3-7x` faster than upstream on [Page Rage](https://page-rage.com) scenes, with up to `-96%` allocation per step.

## Installation

Install from a release tag (`v0.20.0-perfN`). The built bundle (`build/matter.js`) is committed, so there is no build step.

```bash
npm install https://github.com/alexreardon/matter-js/archive/refs/tags/v0.20.0-perf13.tar.gz
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

`gridStatic` buckets static bodies into a grid once and keeps the index up to date as bodies come and go. Each step only movers are re-bucketed, and only movers generate candidate pairs — the static field is never tested against itself. Use it when your scene is mostly static scenery: tile maps, level geometry, destructible terrain. On scenes with few statics there is nothing to skip and the bookkeeping costs `1-8%`, which is why it is opt-in.

## Performance

Measured at [`v0.20.0-perf13`](https://github.com/alexreardon/matter-js/releases/tag/v0.20.0-perf13).

Time for one `Engine.update` (lower is faster):

| Scenario | Bodies | Upstream `0.20.0` | Fork (drop-in) | Fork (`gridStatic`) |
| --- | --- | --- | --- | --- |
| **General** | | | | |
| Box stack settling | `339` | `299us` | `215us` (`-28%`) | `228us` (`-24%`) |
| Mixed shapes pile | `303` | `1043us` | `693us` (`-34%`) | `727us` (`-30%`) |
| Constraint chains | `315` | `337us` | `279us` (`-17%`) | `281us` (`-17%`) |
| Sleeping enabled | `403` | `373us` | `274us` (`-27%`) | `296us` (`-21%`) |
| Moving static platforms | `319` | `508us` | `389us` (`-23%`) | `402us` (`-21%`) |
| **[Page Rage](https://page-rage.com)** | | | | |
| Page, calm | `5,303` | `2652us` | `1503us` (`-43%`) | `522us` (`-80%`) |
| Page, debris raining | `5,303` | `2316us` | `1422us` (`-39%`) | `497us` (`-79%`) |
| Page, firing | `5,311` | `2564us` | `1649us` (`-36%`) | `559us` (`-78%`) |
| Page, 800-mover storm | `5,803` | `4642us` | `3184us` (`-31%`) | `1679us` (`-64%`) |
| Page, being destroyed | `5,003` | `5659us` | `4663us` (`-18%`) | `1661us` (`-71%`) |
| Page, calm (2000 tiles) | `2,303` | `1050us` | `719us` (`-32%`) | `465us` (`-56%`) |
| Page, calm (8000 tiles) | `8,303` | `3927us` | `2553us` (`-35%`) | `559us` (`-86%`) |

Heap growth per step (less garbage means fewer GC pauses mid-simulation):

| Scenario | Upstream `0.20.0` | Fork (drop-in) | Fork (`gridStatic`) |
| --- | --- | --- | --- |
| Box stack settling | `35.8 KB` | `5.0 KB` (`-86%`) | `2.8 KB` (`-92%`) |
| Mixed shapes pile | `86.6 KB` | `21.5 KB` (`-75%`) | `14.4 KB` (`-83%`) |
| Constraint chains | `193.9 KB` | `173.5 KB` (`-11%`) | `157.1 KB` (`-19%`) |
| Sleeping enabled | `46.5 KB` | `13.2 KB` (`-72%`) | `11.3 KB` (`-76%`) |
| Moving static platforms | `89.3 KB` | `55.0 KB` (`-38%`) | `39.7 KB` (`-56%`) |
| Page, calm | `133.0 KB` | `59.7 KB` (`-55%`) | `6.6 KB` (`-95%`) |
| Page, debris raining | `127.2 KB` | `63.3 KB` (`-50%`) | `11.2 KB` (`-91%`) |
| Page, firing | `135.9 KB` | `73.4 KB` (`-46%`) | `15.1 KB` (`-89%`) |
| Page, 800-mover storm | `288.7 KB` | `113.5 KB` (`-61%`) | `40.4 KB` (`-86%`) |
| Page, being destroyed | `1283.8 KB` | `1157.0 KB` (`-10%`) | `264.1 KB` (`-79%`) |
| Page, calm (2000 tiles) | `87.4 KB` | `30.1 KB` (`-66%`) | `6.4 KB` (`-93%`) |
| Page, calm (8000 tiles) | `155.8 KB` | `85.8 KB` (`-45%`) | `6.6 KB` (`-96%`) |

<details>
<summary>How these are measured</summary>

`npm run bench-suite` runs [`bench/suite.js`](bench/suite.js): this fork against upstream `matter-js@0.20.0`, in one process, on identical worlds, in alternating timed blocks. The upstream baseline is provisioned automatically as a git worktree of the `0.20.0` tag. Three arms keep the broadphase separable from the rest of the work: upstream, the fork in drop-in mode (upstream's sweep broadphase), and the fork in `gridStatic` mode.

Simulation time is microseconds per `Engine.update`, on an Apple M1 Pro under Node 24: the mean of the fastest fifth of blocks per arm (`24` blocks for the general scenes, `40` for the page scenes), each arm keeping its best across three processes per scenario, and each published cell then the fastest of three full suite runs. Memory is heap growth per step across collection-free windows (`npm run bench-suite -- --alloc`), so short-lived garbage counts too.

Three full runs rather than one, because the upstream arm is the volatile one: its sweep broadphase insertion-sorts every body every step, so it is memory-bound and takes the brunt of whatever else the machine is doing. One scenario read `24%` apart between two runs of identical code. Keeping the fastest reading per cell (the least-contended sample) is what brings every upstream number back within `7%` of the previous release's, and that agreement is the check that the table is measuring the engine and not a busy laptop. The two fork columns are far steadier, because they touch much less memory. Allocation needs none of this: the upstream figures reproduce to the decimal across runs.

The general scenes are typical matter scenes — a few hundred dynamic bodies, no static field — and exist to catch regressions outside the regime this fork targets. The page scenes are that regime.

What the tables say:

- The win grows with the size of the static field: `-56%` at `2000` tiles, `-80%` at `5000`, `-86%` at `8000`.
- `gridStatic` costs `1-8%` on the general scenes (nothing to skip) and is worth a further `1.6x` to `4.6x` on a page. That is why it is opt-in.
- The narrowest win is the storm, dominated by contact solving, which this fork does not change.
- The destruction scene used to be in that category too, at `-67%` and allocating `364 KB` a step. `perf12` made body creation `61%` cheaper and `perf13` stopped a candidate cache being thrown away every step, together taking it to `-71%` and `264 KB`.
- The general scenes are not static either: the mixed shapes pile went from `-16%` to `-34%` drop-in at `perf13`, because the memoised self-projection it added pays most on bodies with many axes, which is exactly what that scene is full of.

</details>

## Why not Rapier?

[Rapier](https://rapier.rs/) is a 2D physics engine written in Rust and compiled to WASM, and swapping to it looks like a free native-code win. It isn't, because stepping the world is not the whole cost: the renderer lives in JS, so every frame reads every body's position and rotation back across the WASM boundary (`~0.4us` per body), and destruction crosses the boundary again for every body added or removed.

With that readback included, Rapier and this fork are level on a calm or firing page. Rapier stays about `25%` ahead at peak load, but on a calm page it allocates `~29x` more memory per frame than this fork. Allocation matters: the more garbage a frame creates, the more often the garbage collector pauses the game, and those pauses are visible as stutter.

<details>
<summary>The full comparison</summary>

[`bench/vs-rapier.js`](bench/vs-rapier.js) runs the suite scenes on both engines, and gives Rapier every advantage: the SIMD build, `lengthUnit` set for pixel worlds as its docs recommend, cached body references, and poses read into a preallocated `Float64Array`. The worlds are identical workloads (same seeded geometry, matched gravity, damping and combine rules). Sleeping is off in both engines, because [Page Rage](https://page-rage.com) cannot use it.

The tables have two Rapier columns:

- **step only** — `world.step()` by itself. No real game runs at this number.
- **+ readback** — adds the per-frame position readback a JS renderer cannot skip.

Time for one step (lower is faster):

| Scenario | Bodies | Upstream `0.20.0` | Fork (`gridStatic`) | Rapier (step only) | Rapier (+ readback) |
| --- | --- | --- | --- | --- | --- |
| **General** | | | | | |
| Box stack settling | `339` | `300us` | `236us` (`-21%`) | `443us` (`+48%`) | `578us` (`+93%`) |
| Mixed shapes pile | `303` | `1070us` | `744us` (`-30%`) | `378us` (`-65%`) | `502us` (`-53%`) |
| **[Page Rage](https://page-rage.com)** | | | | | |
| Page, calm | `5,303` | `2557us` | `535us` (`-79%`) | `423us` (`-83%`) | `545us` (`-79%`) |
| Page, firing | `5,311` | `2521us` | `563us` (`-78%`) | `449us` (`-82%`) | `561us` (`-78%`) |
| Page, 800-mover storm | `5,803` | `4637us` | `1707us` (`-63%`) | `1015us` (`-78%`) | `1369us` (`-70%`) |
| Page, being destroyed | `5,003` | `5459us` | `1674us` (`-69%`) | `1117us` (`-80%`) | `1321us` (`-76%`) |

Heap growth per step. Rapier's own step barely allocates on the JS heap — nearly all of its readback column is boundary overhead, because every `translation()` call creates a fresh `{x, y}` object:

| Scenario | Upstream `0.20.0` | Fork (`gridStatic`) | Rapier (step only) | Rapier (+ readback) |
| --- | --- | --- | --- | --- |
| Box stack settling | `35.9 KB` | `3.0 KB` | `0.8 KB` | `172.9 KB` |
| Mixed shapes pile | `86.4 KB` | `12.9 KB` | `2.5 KB` | `143.8 KB` |
| Page, calm | `132.8 KB` | `5.1 KB` | `0.9 KB` | `146.2 KB` |
| Page, firing | `137.2 KB` | `15.3 KB` | `3.7 KB` | `149.1 KB` |
| Page, 800-mover storm | `286.4 KB` | `37.5 KB` | `0.8 KB` | `388.4 KB` |
| Page, being destroyed | `1266.6 KB` | `258.2 KB` | `43.2 KB` | `274.1 KB` |

What the tables say:

- Readback cost grows linearly with body count: `~0.4us` per body per frame, which adds `18-35%` to every scene. Rapier has no batched way to read poses, so each body costs one `translation()` and one `rotation()` call.
- On the calm and firing pages, readback more than cancels out Rapier's lead: `545us` vs `535us` calm, `561us` vs `563us` firing. At peak load (storm, destruction) Rapier stays `25-27%` ahead.
- With sleeping off, Rapier does not win every scene on raw physics either: it is slower on the box stack, and much faster on mixed shapes (it has true circle colliders; matter approximates circles with polygons).
- Readback also allocates heavily: `~8.8MB/s` at 60fps on a calm page, about `29x` this fork. Destruction used to be the one scene where Rapier allocated less; `perf13` closed that (`258 KB` against Rapier's `274 KB`) by no longer rebuilding a broadphase cache on every step of a membership change.

<details>
<summary>What about sleeping?</summary>

Rapier's headline numbers rely on sleeping: the settled box stack steps in `17us` instead of `443us`. Readback does not sleep, though — it still visits all `336` sleeping bodies, costing `8x` the physics. With sleeping on in both engines (`ALLOW_SLEEP=1 npm run bench-rapier`):

| Scenario | Fork (`gridStatic`) | Rapier (step only) | Rapier (+ readback) | Asleep (fork vs rapier) |
| --- | --- | --- | --- | --- |
| Page, calm | `398us` | `129us` | `250us` | `300/300` vs `300/300` |
| Page, firing | `475us` | `152us` | `266us` | `293` vs `300` |
| Page, being destroyed | `2408us` | `1116us` | `1307us` | `0` vs `0` — debris lives 40 frames, never sleeps |
| Page, 800-mover storm | `527us` | `993us` | `1328us` | ⚠ `796` vs `7` — not comparable |
| Box stack settling | `253us` | `17us` | `147us` | ⚠ `0` vs `336` — not comparable |
| Mixed shapes pile | `23us` | `366us` | `498us` | ⚠ `300` vs `1` — not comparable |

The engines sleep different scenes: matter cannot sleep a dense stack (solver jitter keeps bodies above the wake threshold), and Rapier will not sleep rolling circles or the storm pile. On the rows where both engines sleep the same bodies, sleeping is worth `1.2x` to `1.3x` to this fork and `3.0x` to `3.3x` to Rapier.

During destruction it is worse than nothing for this fork: `2408us` with sleeping enabled against `1674us` without. Debris lives `40` frames and never sleeps, so none of the bookkeeping pays for itself, and enabling sleeping also brings back the whole-world force pass that `perf10` scoped away (`Sleeping.update` reads a resting body's force to decide whether to wake it, which is the one observable use).

Enabling sleeping also reproduced a real bug: `Body.setVelocity` does not wake a sleeping body, so released tiles hung in mid-air until the bench added `Sleeping.set(body, false)` on release. The scenes where sleeping helps are the scenes the game cannot enable it in.

</details>

<details>
<summary>How these are measured</summary>

Same method as the suite above: four arms in one process on identical worlds, alternating timed blocks, mean of the fastest fifth of `24` blocks, best of three processes, on an Apple M1 Pro under Node 24. Each scenario checks that body counts match, positions stay finite, and stacks settle to the same heights.

Rapier runs its 2D defaults (`numSolverIterations: 4`, a higher-quality solver than matter's — but dropping it to `1` only saves `~4%`, so solver quality does not explain the gap). Gravity, damping and velocities are unit-converted so both engines integrate the same trajectories. One known flaw: `3` of the `800` storm movers escape the bowl in the Rapier arms (`0.4%`, in Rapier's favour).

Rapier is not a devDependency. To reproduce: `npm install --no-save @dimforge/rapier2d-simd-compat`, then `npm run bench-rapier` (add `--alloc` for the memory table).

</details>

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
| **Cheaper body creation** — rectangles build their corners directly instead of concatenating a path string and parsing it back with a regex, and `Body.create` no longer parses a throwaway default vertex set the caller immediately overwrites | `-61%` per `Bodies.rectangle`, `-4%` whole-step during churn |
| **Cache invalidation scoped to what changed** — the per-mover static-candidate cache is invalidated by the CELLS a membership change touched, instead of by a global epoch that any change anywhere bumped. That epoch had driven its hit rate to zero in exactly the regime it exists for | `-14%` while bodies are added and removed every step |
| **Memoised self-projection** — each body's projection onto its own axes is a pair-independent reduction, so it is computed once per move instead of once per pair the body takes part in | `-5%` to `-6%` on a page, `-22%` on the mixed shapes pile |
| **Shorter broadphase chain walks** — a mover starts its cell walk at its own entry rather than the chain head, skipping a prefix it would only reject | `-2%` to `-3%` |
| **Allocation micro-optimisations** — numeric pair ids, a collision record cache, an unrolled box-vs-box SAT path | `-34%` allocation per update |

## Differences from upstream

In both modes:

- Change `body.isStatic` / `body.isSleeping` through `Body.setStatic` / `Sleeping.set` (which is what upstream documents anyway). Direct assignment leaves cached mover lists stale.
- A resting body's `force` / `torque` is only zeroed once it starts moving again. Unchanged when sleeping is enabled.
- `pair.id` is a number rather than a string.
- A body removed from a composite has its `positionImpulse` cleared, so it stops being simulated (this matches what upstream effectively did).
- `Bodies.rectangle` accepts dimensions upstream could not. Upstream builds the body from a path string, and its parser's character class omits `+`, so any dimension `String()` renders in exponent form (`1e+21` and above) silently produced a `NaN` body. Here the corners are built directly, so there is no parse to get wrong.

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
