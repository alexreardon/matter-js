<img alt="Matter.js" src="https://brm.io/matter-js/img/matter-js.svg" width="300">

> *Matter.js* is a JavaScript 2D rigid body physics engine for the web

[brm.io/matter-js](https://brm.io/matter-js/)

## About this fork

A performance fork of `matter-js@0.20.0`, tuned for scenes that are a dense field
of thousands of STATIC bodies with a smaller set of dynamic debris moving through
it (a web page shattered into tiles, for
[Page Rage](https://page-rage.com)). Upstream is dormant, so the work lives
here. Consumed as release-tag tarballs
(`v0.20.0-perfN`); the built `build/matter.js` bundle is committed so installs
need no build step.

### Performance benchmarks

Simulation time

> Time to run one `Engine.update`, so lower is faster

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

Memory usage

> Lower memory usage avoids simulation being interrupted by garbage collector

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
<summary>How these are measured, and what they say</summary>

`npm run bench-suite` runs [`bench/suite.js`](bench/suite.js), which times this
fork against stock `matter-js@0.20.0` on a fixed set of scenes. Both trees run in
one process against identical worlds, in alternating timed blocks, one process
per scenario; the stock baseline is provisioned automatically as a git worktree
of the `0.20.0` tag. There are three arms, so the broadphase stays separable from
the rest of the work: upstream, this fork held to upstream's own sweep
broadphase, and this fork as it ships (`Detector._mode = 'gridStatic'`).

Simulation time is microseconds per `Engine.update`, the mean of the fastest
fifth of `24` timed blocks per arm, best of three separate processes, on an
Apple M1 Pro under `Node 24`. Three processes because interleaving removes
interference landing inside a block but not a whole process that ran hot: one
arm read `35%` above its own reading in neighbouring runs.

Memory usage is heap growth per step measured across collection-free windows,
so short-lived garbage counts rather than only what survives
(`npm run bench-suite -- --alloc`).

The general scenes are a few hundred dynamic bodies with almost no static field,
which is what most matter scenes are; they are in the suite to catch a regression
outside the regime this fork targets. The page scenes are that regime: a dense
static field with debris moving through it, calm, under a storm, and being
actively destroyed. The two trees are deterministic but re-baselined against each
other, so their scenes drift apart over a run; each scenario warms up until it
has settled, otherwise the arms are timed doing genuinely different amounts of
work.

Three things the tables say:

- The win grows with the size of the static field: `-53%` at `2000` tiles, `-78%`
  at `5000`, `-86%` at `8000`. Most of what the fork removed scaled with body
  count.
- `gridStatic` costs `4-13%` on the general scenes, which have no static field
  worth skipping, and is worth a further `1.4x` to `4x` on a page (compare the
  two fork columns). That is why it stays opt-in rather than becoming the
  default.
- The narrowest wins are the scenes dominated by work the fork did not change:
  contact solving in the 800-mover storm, and `Body.create` in the scene that
  builds new bodies every frame.

</details>

### The gridStatic broadphase

Statics are bucketed into a uniform grid once and the index is kept up to date
as bodies come and go. Each step only movers are re-bucketed, and only movers
generate candidate pairs, so the static field is never tested against itself.
Sweep, by contrast, re-sorts every body every step to rediscover that `5000` tiles
have not moved.

It exists because per-step cost then scales with the number of MOVING bodies
rather than with total body count, which is the difference between a shattered
web page being playable and not. It suits any scene that is mostly static
scenery: tile maps, level geometry, destructible terrain. On a scene with few
statics there is nothing to skip and the bookkeeping costs `4-13%`, which is why
it is opt-in rather than the default.

```js
Matter.Detector._mode = 'gridStatic';
// optional, defaults to 32; tune to roughly your typical static body size
Matter.Detector._cellSize = 32;

// a static body that MOVES must be tagged, or the grid will not re-index it
Matter.Detector.setGridDynamic(body, true);
```

### What changed

Benefit is the change in whole-step time (`Engine.update`) on the fork's benches
for the target scene, unless another measure is named. Each change was A/B'd on
its own against the previous release tag.

| Change | Description | Benefit |
| --- | --- | --- |
| **Static-index grid broadphase** | Statics are bucketed into a grid once. Each step only movers are re-bucketed, and only movers generate candidate pairs, so the static field is never tested against itself. Opt in with `Detector._mode = 'gridStatic'`; the classic sweep stays the default. Includes an oversized-body guard and a per-mover static-candidate cache. | `-65%` to `-89%` on dense static scenes (calm `1804us` -> `199us`, 200-mover storm `3013us` -> `1061us`). In-game on an intact page: `-76%` (`0.76ms` -> `0.18ms`). |
| **Hidden-class hygiene** | Every per-body scratch field is declared in `Body.create` instead of being added on first use. | Adding one field lazily split body object shapes and made every hot phase `1.3-4.8x` slower. Declaring them up front avoids that, and was the single biggest win of its release. |
| **Engine pass scoping** | Gravity, integration and velocity passes iterate a movers list instead of scanning every body. Position impulses apply only to bodies the solver touched. Constraint passes are skipped when the world has no constraints. | `-14%` to `-31%` (calm `-31%`, settle `-28%`, 800-mover storm `-14%`). |
| **Flat solver data** | The position and velocity iterations run over flat snapshot arrays built during the pair walk already being done, so the loops do no pointer chasing. The grid cell tables become open-addressed linear-probe tables over flat arrays. | `-14%` to `-19%` across calm, settle, firing and storm scenes. |
| **No whole-world walk per step** | The last full-body scans are gone. The movers list is cached behind `Common._bodyStaticEpoch`, force clearing is scoped to movers when sleeping is off, the mover cell index is a direct-addressed array of chain heads, and candidate bounds live in typed arrays so a body is only dereferenced once it survives its bounds test. | `-22%` to `-25%`, growing with scene size: `-19%` at `2000` statics, `-24%` at `5000`, `-36%` at `8000`. These walks are memory-bound over thousands of fat body objects, so they cost far more than their profile share. |
| **Static index maintained, not rebuilt** | A full index rebuild used to fire on any static membership change, so a scene being actively destroyed rebuilt every step to recompute an answer already correct for `99.8%` of its statics. Changes are now applied as a difference (`Detector._staticIndexInsert` / `_staticIndexRemove`), with a full rebuild only on the first step and on a cell-size change. | `-45%` while bodies are added and removed every step (`bench/profile-churn.js`); neutral on steady scenes, which have no rebuilds to skip. In-game physics thread: `-11%`. |
| **Removed bodies stop being simulated** | A body removed from a composite has its decaying position impulse cleared, so the resolver stops translating its vertices after it has left the world. | `-2%` during churn, and it removes an unbounded cost when a world holds non-finite bodies (their impulse decay never retires). Also a correctness fix. |
| **Allocation and lookup micro-optimisations** | Numeric pair ids instead of string keys, a direct-mapped collision record cache in front of the pairs table, a quad-unrolled SAT path for the common box-vs-box case, fused `Body.setPositionAndAngle`. | `-34%` allocation per update, so less GC churn during bursts. About `1.5%` step throughput, and `-21%` on a narrowphase-heavy bench. |

### Behaviour and API differences from stock

All of them consequences of the table above:

- `Detector.setGridDynamic(body)` is new, and is the only supported way to tag a
  static body that MOVES (the `gridStatic` broadphase must re-index it every
  step). Assigning `body._gridDynamic` by hand no longer suffices, because the
  cached mover lists have to be invalidated.
- `body.isStatic` / `body.isSleeping` must be changed through `Body.setStatic` /
  `Sleeping.set`, which is what upstream documents anyway. A direct assignment
  leaves the cached mover lists stale.
- A resting body's `force` / `torque` buffer is no longer zeroed on every step,
  only from the moment it starts moving again (`Body.setStatic` and
  `Sleeping.set` zero it on both transitions). Engines with sleeping enabled keep
  the whole-world pass, since `Sleeping.update` reads that buffer.
- `pair.id` is a number rather than a string, and `pairs` carries a direct-mapped
  collision record cache alongside its `table`. `Pairs.update` now clears
  `collision.pair` when it drops a pair.
- A body removed from a composite has its `positionImpulse` cleared. Stock's
  all-bodies pass never touched an out-of-world body, so this restores that
  behaviour rather than changing it.
- A body belongs to one `gridStatic` detector at a time: its static-index
  membership lives on the body, as the broadphase stamps and candidate cache
  already did.

### Correctness gates

A tiered determinism spec (`test/Determinism.spec.js`) pins settle scenes within
a tight epsilon and holds chaotic scenes to physical invariants, alongside
upstream's example suite. The simulation is deterministic but intentionally
re-baselined relative to stock: the grid broadphase and later passes emit
collisions in a different, still deterministic, order.

## Upstream

For everything else (demos, gallery, features, plugins, install, usage, examples
and docs) see the [upstream matter-js readme](https://github.com/liabru/matter-js#readme).

## License

Matter.js is licensed under [The MIT License (MIT)](https://opensource.org/licenses/MIT)
Copyright (c) Liam Brummitt and contributors.

This license is also supplied with the release and source code.
As stated in the license, absolutely no warranty is provided.
