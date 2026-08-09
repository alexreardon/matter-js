<img alt="Matter.js" src="https://brm.io/matter-js/img/matter-js.svg" width="300">

A performance fork of [`matter-js@0.20.0`](https://github.com/liabru/matter-js) (a 2D rigid body physics engine). Two modes:

1. **Drop-in** (default) — same API, everything is just faster.
2. **`gridStatic`** (opt-in) — faster again for scenes that are mostly static bodies.

Built for [Page Rage](https://page-rage.com), where a web page is shattered into thousands of static tiles with debris moving through them. Upstream is dormant, so the work lives here.

## Rationale

As a drop-in replacement this fork is always faster than upstream: `17-38%` faster per `Engine.update` on every benchmarked scene, with less allocation everywhere.

For scenes that are mostly static bodies, the opt-in `gridStatic` mode goes further. Upstream's per-step work scales with _total_ body count — the sweep broadphase re-sorts every body on every step, and the engine walks the whole world several times per update, so on a scene with `5000` static tiles and `50` movers almost all of that work rediscovers that nothing moved. The opt-in `gridStatic` broadphase makes per-step cost scale with the number of _moving_ bodies instead: `2.4-7.3x` faster than upstream on [Page Rage](https://page-rage.com) scenes, with up to `-98%` allocation per step.

## Installation

Install from a release tag (`v0.20.0-perfN`). The built bundle (`build/matter.js`) is committed, so there is no build step.

```bash
npm install https://github.com/alexreardon/matter-js/archive/refs/tags/v0.20.0-perf17.tar.gz
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

Timing measured at [`v0.20.0-perf14`](https://github.com/alexreardon/matter-js/releases/tag/v0.20.0-perf14); allocation re-measured at [`v0.20.0-perf15`](https://github.com/alexreardon/matter-js/releases/tag/v0.20.0-perf15).

`perf15` is worth a further `2-5%` per `Engine.update`. That is measured against `perf14` directly rather than through this table: the two builds run in one process on identical worlds in alternating blocks, which reads `-2%` to `-5%` on the general scenes and `-3%` to `-5%` on a calm page. A fork-vs-upstream table cannot resolve a change that size, since the upstream arm alone swings further than that between sessions (see below), so the timing numbers here are still `perf14`'s.

`perf17` is worth a further `~0.5%` on a calm page, and is the point at which this fork ran out of resolvable leaf-level wins. It could not be measured directly at all: a hunt over the whole profiled frontier produced `21` candidates of which `20` were killed on counted evidence, and the survivor sits an order of magnitude below the noise floor. It was resolved by AMPLIFICATION instead, raising the position iteration count to scale only the work the change removes, where it reads `-2.63%` at `8x` over `15` interleaved runs (`t = -2.25`) and extrapolates back to `~-0.5%` at the shipped six iterations. Numbers this small belong in the change table, not in the cells below.

Time for one `Engine.update` (lower is faster):

| Scenario | Bodies | Upstream `0.20.0` | Fork (drop-in) | Fork (`gridStatic`) |
| --- | --- | --- | --- | --- |
| **General** | | | | |
| Box stack settling | `339` | `292us` | `216us` (`-26%`) | `227us` (`-22%`) |
| Mixed shapes pile | `303` | `1047us` | `664us` (`-37%`) | `691us` (`-34%`) |
| Constraint chains | `315` | `340us` | `269us` (`-21%`) | `267us` (`-21%`) |
| Sleeping enabled | `403` | `368us` | `262us` (`-29%`) | `280us` (`-24%`) |
| Moving static platforms | `319` | `523us` | `376us` (`-28%`) | `384us` (`-27%`) |
| **[Page Rage](https://page-rage.com)** | | | | |
| Page, calm | `5,303` | `2469us` | `1538us` (`-38%`) | `491us` (`-80%`) |
| Page, debris raining | `5,303` | `2389us` | `1471us` (`-38%`) | `467us` (`-80%`) |
| Page, firing | `5,311` | `2445us` | `1647us` (`-33%`) | `526us` (`-78%`) |
| Page, 800-mover storm | `5,803` | `4859us` | `3185us` (`-34%`) | `1514us` (`-69%`) |
| Page, being destroyed | `5,003` | `5819us` | `4817us` (`-17%`) | `1419us` (`-76%`) |
| Page, calm (2000 tiles) | `2,303` | `1036us` | `701us` (`-32%`) | `435us` (`-58%`) |
| Page, calm (8000 tiles) | `8,303` | `3794us` | `2819us` (`-26%`) | `521us` (`-86%`) |

Heap growth per step (less garbage means fewer GC pauses mid-simulation):

| Scenario | Upstream `0.20.0` | Fork (drop-in) | Fork (`gridStatic`) |
| --- | --- | --- | --- |
| Box stack settling | `35.8 KB` | `4.6 KB` (`-87%`) | `1.7 KB` (`-95%`) |
| Mixed shapes pile | `86.6 KB` | `19.5 KB` (`-77%`) | `12.5 KB` (`-86%`) |
| Constraint chains | `193.7 KB` | `173.1 KB` (`-11%`) | `156.9 KB` (`-19%`) |
| Sleeping enabled | `45.6 KB` | `10.9 KB` (`-76%`) | `9.1 KB` (`-80%`) |
| Moving static platforms | `89.3 KB` | `45.8 KB` (`-49%`) | `36.1 KB` (`-60%`) |
| Page, calm | `127.6 KB` | `59.9 KB` (`-53%`) | `5.1 KB` (`-96%`) |
| Page, debris raining | `127.2 KB` | `62.5 KB` (`-51%`) | `9.6 KB` (`-92%`) |
| Page, firing | `136.0 KB` | `64.5 KB` (`-53%`) | `11.4 KB` (`-92%`) |
| Page, 800-mover storm | `288.7 KB` | `99.0 KB` (`-66%`) | `26.6 KB` (`-91%`) |
| Page, being destroyed | `1283.8 KB` | `1146.4 KB` (`-11%`) | `207.4 KB` (`-84%`) |
| Page, calm (2000 tiles) | `87.5 KB` | `27.7 KB` (`-68%`) | `5.0 KB` (`-94%`) |
| Page, calm (8000 tiles) | `161.9 KB` | `90.6 KB` (`-44%`) | `3.7 KB` (`-98%`) |

<details>
<summary>How these are measured</summary>

`npm run bench-suite` runs [`bench/suite.js`](bench/suite.js): this fork against upstream `matter-js@0.20.0`, in one process, on identical worlds, in alternating timed blocks. The upstream baseline is provisioned automatically as a git worktree of the `0.20.0` tag. Three arms keep the broadphase separable from the rest of the work: upstream, the fork in drop-in mode (upstream's sweep broadphase), and the fork in `gridStatic` mode.

Simulation time is microseconds per `Engine.update`, on an Apple M1 Pro under Node 24: the mean of the fastest fifth of blocks per arm (`24` blocks for the general scenes, `40` for the page scenes), each arm keeping its best across three processes per scenario, and each published cell then the fastest of three full suite runs. Memory is heap growth per step across collection-free windows (`npm run bench-suite -- --alloc`), so short-lived garbage counts too.

Three full runs rather than one, because the upstream arm is the volatile one: its sweep broadphase insertion-sorts every body every step, so it is memory-bound and takes the brunt of whatever else the machine is doing. One scenario read `24%` apart between two runs of identical code. Keeping the fastest reading per cell (the least-contended sample) is what brings every upstream number back within `7%` of the previous release's, and that agreement is the check that the table is measuring the engine and not a busy laptop. The two fork columns are far steadier, because they touch much less memory. Allocation needs almost none of this: the upstream figures reproduce within `1%` across runs, and most to the decimal.

That check is also what decides when NOT to republish. At `perf15` the machine could not reproduce four upstream cells within `7%` however many samples were taken (`page-8k` read `+20%` over ten), while the fork columns held a `1.4%` spread on the same cell across the same ten samples. Republishing would have moved the published percentages for environmental reasons rather than engine ones, in both directions at once, so the timing table was left at `perf14` and `perf15` was measured against `perf14` directly instead. **A release whose win is smaller than this table's session noise gets measured build-to-build, not published into these cells.**

The general scenes are typical matter scenes — a few hundred dynamic bodies, no static field — and exist to catch regressions outside the regime this fork targets. The page scenes are that regime.

What the tables say:

- The win grows with the size of the static field: `-58%` at `2000` tiles, `-80%` at `5000`, `-86%` at `8000`.
- `gridStatic` costs `0-7%` on the general scenes (nothing to skip) and is worth a further `1.6x` to `5.4x` on a page. That is why it is opt-in.
- The narrowest win is the storm, dominated by contact solving, which this fork speeds up but does not do less of.
- The destruction scene used to be the narrow one, at `-67%` and allocating `364 KB` a step at `perf11`. `perf12` made body creation `61%` cheaper, `perf13` stopped a candidate cache being thrown away every step, and `perf14` stopped the detector copying the whole body array on every membership change, together taking it to `-76%` and `207 KB`.
- The general scenes are not static either: the mixed shapes pile went from `-16%` to `-34%` drop-in at `perf13` (the memoised self-projection pays most on bodies with many axes), and to `-37%` at `perf14` (the solver's per-contact constants are computed once per step instead of once per iteration).
- `perf15` is not in these cells (above): it is a further `-2%` to `-5%`, from deleting four solver arrays that carried no information and walking a body's edges once per support pair instead of twice. Nor is `perf17`, at a further `~0.5%`.

</details>

## Why not Rapier?

[Rapier](https://rapier.rs/) is a 2D physics engine written in Rust and compiled to WASM, and swapping to it looks like a free native-code win. It isn't, because stepping the world is not the whole cost: the renderer lives in JS, so every frame reads every body's position and rotation back across the WASM boundary (`~0.4us` per body), and destruction crosses the boundary again for every body added or removed.

With that readback included, Rapier and this fork are level on a calm or firing page. Rapier stays about `25%` ahead at peak load, but on a calm page it allocates `~29x` more memory per frame than this fork. Allocation matters: the more garbage a frame creates, the more often the garbage collector pauses the game, and those pauses are visible as stutter.

<details>
<summary>The full comparison</summary>

_The Rapier tables were measured at `v0.20.0-perf13`; the fork's `gridStatic` column is a further `6-15%` faster (and allocates `~20%` less during destruction) at `v0.20.0-perf14`, per the suite tables above, `2-5%` faster again at `v0.20.0-perf15`, and `~0.5%` again at `v0.20.0-perf17`._

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

Each change was A/B'd on its own, in almost every case against the previous release tag. Benefit is whole-step `Engine.update` time on the target scene unless stated otherwise. Two rows were measured differently, because their effect could not be isolated that way: the constraint skip is this build against this build with the skip forced off, and the position solver share divide was resolved by amplification (above).

| Change | Benefit |
| --- | --- |
| **`gridStatic` broadphase (the opt-in mode)** — statics are indexed once; each step only movers are re-bucketed and generate candidate pairs | `-65%` to `-89%` on dense static scenes |
| **Hidden-class hygiene** — every per-body scratch field is declared in `Body.create` instead of added on first use | lazily-added fields split object shapes and made every hot phase `1.3-4.8x` slower |
| **Engine pass scoping** — gravity, integration and solver passes iterate a movers list instead of scanning every body | `-14%` to `-31%` |
| **Constraint passes skipped when there are none** — with no constraints in the world every body's `constraintImpulse` is zero, so the two full-body pre/post scans and the solve loop are all no-ops and are skipped outright | `-15%` on a calm `5303`-body page, growing with body count |
| **Flat solver data** — solver iterations run over flat snapshot arrays; grid cell tables are open-addressed flat arrays | `-14%` to `-19%` |
| **No whole-world walk per step** — the last full-body scans are gone (cached mover lists, typed-array bounds) | `-22%` to `-25%`, growing with scene size |
| **Static index maintained, not rebuilt** — membership changes are applied as a difference instead of firing a full rebuild | `-45%` while bodies are added and removed every step |
| **Removed bodies stop being simulated** — a removed body's decaying position impulse is cleared | `-2%` during churn, and a correctness fix |
| **Cheaper body creation** — rectangles build their corners directly instead of concatenating a path string and parsing it back with a regex, and `Body.create` no longer parses a throwaway default vertex set the caller immediately overwrites | `-61%` per `Bodies.rectangle`, `-4%` whole-step during churn |
| **Cache invalidation scoped to what changed** — the per-mover static-candidate cache is invalidated by the CELLS a membership change touched, instead of by a global epoch that any change anywhere bumped. That epoch had driven its hit rate to zero in exactly the regime it exists for | `-14%` while bodies are added and removed every step |
| **Memoised self-projection** — each body's projection onto its own axes is a pair-independent reduction, so it is computed once per move instead of once per pair the body takes part in | `-5%` to `-6%` on a page, `-22%` on the mixed shapes pile |
| **One pair-record table** — the pairs `Map` and the direct-mapped cache in front of it became a single open-addressing table probed by the narrowphase, maintained at pair start/end | `-2%` to `-3%` |
| **Velocity solver constants hoisted** — the velocity pre-solve builds over the position solve's snapshot instead of re-walking every pair, and per-contact offsets and the `share` divide move out of the four iterations (`4` divides per contact per step down to `1`) | `-3%` to `-4%` |
| **Provable no-op write-backs skipped** — the position-impulse and velocity write-backs skip bodies the solver could not move, and the position post-solve never calls into a body with no accumulated impulse (on a dense page most solver bodies are statics) | `-1.3%` while bodies are added and removed every step |
| **The detector stops copying the body array** — the copy existed only so the sweep could sort in place; grid modes reference the caller's array, and the sweep copies lazily on first use | `-9%` while bodies are added and removed every step |
| **Shorter broadphase chain walks** — a mover starts its cell walk at its own entry rather than the chain head, skipping a prefix it would only reject | `-2%` to `-3%` |
| **Dead work dropped** — the unread `collision.penetration` write is gone (the debug renderer derives it from `normal` and `depth`), the `gridStatic` candidate pass reuses the cell spans the insert pass already computed, and collision event payloads are only built when a listener exists | `-0.5%` to `-0.8%` while bodies are added and removed every step |
| **Dead solver arrays deleted** — four of the velocity snapshot's twelve pair-parallel arrays carried no information (one was written and never read, one held an exact negation of another, one a running index the consumer can carry, one a copy of an array it can alias), and every iteration re-streamed all twelve | `-2%` to `-3%` |
| **One vertex walk per support pair** — the two containment tests against a body's vertices share every edge's loads and its two point-independent deltas, so they run as one walk returning both answers | `-1%` to `-2.5%` |
| **Position solver share divide hoisted** — each body's contact share is constant across the six position iterations, so it is computed once per movable body per step rather than once per pair side per iteration (`5856` divides per calm step down to `300`) | `~-0.5%` |
| **Unrolled box-vs-box SAT** — the separating-axis test is quad-unrolled for the four-vertex case, which is what a page of rectangular tiles is made of | `-21%` on the narrowphase squeeze bench |
| **Allocation micro-optimisations** — numeric pair ids, a collision record cache, a pairs table that is a `Map` rather than a string-keyed object | `-34%` allocation per update |

## Differences from upstream

In both modes:

- Change `body.isStatic` / `body.isSleeping` through `Body.setStatic` / `Sleeping.set` (which is what upstream documents anyway). Direct assignment leaves cached mover lists stale.
- A resting body's `force` / `torque` is only zeroed once it starts moving again. Unchanged when sleeping is enabled.
- `Matter.version` reports the fork tag (`0.20.0-perf17`) rather than `0.20.0`, so a consumer can assert in CI that it resolved the release it pinned. Version RANGES are unaffected (`^0.20.0` and `~0.20.0` still match, since `Plugin.versionSatisfies` compares major/minor/patch and ignores the suffix); only a plugin pinning the exact string `matter-js@0.20.0` would stop matching.
- `pair.id` is a number rather than a string.
- `collision.penetration` no longer exists. Derive it as `normal` scaled by `depth`, which is how the built-in debug renderer now draws it.
- A body removed from a composite has its `positionImpulse` cleared, so it stops being simulated (this matches what upstream effectively did).
- A world with no constraints skips the constraint passes entirely. If the LAST constraint is removed while a body's warmed `constraintImpulse` is still non-zero, that residual is frozen rather than applied over a few more decaying steps, until a constraint exists again.
- The position solver derives each body's contact share once per step. Mutating `body.totalContacts` or `Resolver._positionDampen` BETWEEN two `Resolver.solvePosition` calls of the same step is no longer picked up; `Engine.update` does neither.
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
