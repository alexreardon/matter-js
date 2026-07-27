<img alt="Matter.js" src="https://brm.io/matter-js/img/matter-js.svg" width="300">

> *Matter.js* is a JavaScript 2D rigid body physics engine for the web

[brm.io/matter-js](https://brm.io/matter-js/)

## About this fork

A performance fork of `matter-js@0.20.0`, tuned for scenes that are a dense field
of thousands of STATIC bodies with a smaller set of dynamic debris moving through
it (a web page shattered into tiles, for the page destroyer game). Upstream is
dormant, so the work lives here. Consumed as release-tag tarballs
(`v0.20.0-perfN`); the built `build/matter.js` bundle is committed so installs
need no build step.

### What changed

Benefit is the change in whole-step time (`Engine.update`) on the fork's benches
for the target scene, unless another measure is named. Each change was A/B'd on
its own against the previous release tag.

| Change | Description | Benefit |
| --- | --- | --- |
| **Static-index grid broadphase** | Statics are bucketed into a grid once. Each step only movers are re-bucketed, and only movers generate candidate pairs, so the static field is never tested against itself. Opt in with `Detector._mode = 'gridStatic'`; the classic sweep stays the default. Includes an oversized-body guard and a per-mover static-candidate cache. | **-65% to -89%** on dense static scenes (calm 1804us -> 199us, 200-mover storm 3013us -> 1061us). In-game on an intact page: **-76%** (0.76ms -> 0.18ms). |
| **Hidden-class hygiene** | Every per-body scratch field is declared in `Body.create` instead of being added on first use. | Adding one field lazily split body object shapes and made every hot phase **1.3-4.8x slower**. Declaring them up front avoids that, and was the single biggest win of its release. |
| **Engine pass scoping** | Gravity, integration and velocity passes iterate a movers list instead of scanning every body. Position impulses apply only to bodies the solver touched. Constraint passes are skipped when the world has no constraints. | **-14% to -31%** (calm -31%, settle -28%, 800-mover storm -14%). |
| **Flat solver data** | The position and velocity iterations run over flat snapshot arrays built during the pair walk already being done, so the loops do no pointer chasing. The grid cell tables become open-addressed linear-probe tables over flat arrays. | **-14% to -19%** across calm, settle, firing and storm scenes. |
| **No whole-world walk per step** | The last full-body scans are gone. The movers list is cached behind `Common._bodyStaticEpoch`, force clearing is scoped to movers when sleeping is off, the mover cell index is a direct-addressed array of chain heads, and candidate bounds live in typed arrays so a body is only dereferenced once it survives its bounds test. | **-22% to -25%**, growing with scene size: **-19%** at 2000 statics, **-24%** at 5000, **-36%** at 8000. These walks are memory-bound over thousands of fat body objects, so they cost far more than their profile share. |
| **Static index maintained, not rebuilt** | A full index rebuild used to fire on any static membership change, so a scene being actively destroyed rebuilt every step to recompute an answer already correct for 99.8% of its statics. Changes are now applied as a difference (`Detector._staticIndexInsert` / `_staticIndexRemove`), with a full rebuild only on the first step and on a cell-size change. | **-45%** while bodies are added and removed every step (`bench/profile-churn.js`); neutral on steady scenes, which have no rebuilds to skip. In-game physics thread: **-11%**. |
| **Removed bodies stop being simulated** | A body removed from a composite has its decaying position impulse cleared, so the resolver stops translating its vertices after it has left the world. | **-2%** during churn, and it removes an unbounded cost when a world holds non-finite bodies (their impulse decay never retires). Also a correctness fix. |
| **Allocation and lookup micro-optimisations** | Numeric pair ids instead of string keys, a direct-mapped collision record cache in front of the pairs table, a quad-unrolled SAT path for the common box-vs-box case, fused `Body.setPositionAndAngle`. | **-34% allocation** per update, so less GC churn during bursts. About 1.5% step throughput, and **-21%** on a narrowphase-heavy bench. |

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
