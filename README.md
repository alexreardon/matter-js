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

What changed, and the rough benefit:

- **Static-index grid broadphase** (`Detector._mode = 'gridStatic'`, opt-in; the
  classic sweep remains the default). Statics are bucketed once and only movers
  generate candidate pairs, so calm dense scenes stop paying for the static field
  every step. Several times faster whole-step on static-dominated scenes
  (roughly 3-9x standalone, 2.6-4.4x in-game), with an oversized-body guard and
  a per-mover static-candidate cache on top.
- **Engine pass scoping.** Per-step all-body scans are gone where they did no
  work: gravity / integration / velocity passes iterate a movers list, position
  impulses apply only to solver-touched bodies, and constraint passes are
  skipped when the world has no constraints. Tens of percent off whole-step cost
  on the target workload (-14% to -31% across the perf8 regimes).
- **No per-step whole-world walk at all.** The movers list itself was still
  rebuilt every step by both `Engine.update` and the broadphase, and force
  buffers were still cleared for every body. Those walks are memory-bound over
  thousands of fat body objects and cost far more than their own profile share,
  since they evict the cache the rest of the step needs. The lists are now
  cached behind `Common._bodyStaticEpoch` (bumped by `Body.setStatic`,
  `Sleeping.set` and `Detector.setGridDynamic`) and force clearing is scoped to
  movers when sleeping is disabled. Another -24% whole-step on the 5000-static
  game regime, and the win grows with page size (-19% at 2000 statics, -36% at
  8000) because what was removed scaled with body count.
- **The static index is maintained, not rebuilt.** A full rebuild fired on ANY
  static membership change: one tile released, one body windowed in or out. On a
  scene being actively destroyed that is every step, recomputing an answer that
  was already correct for 99.8% of the statics it walked. Changes are now applied
  as a difference (`Detector._staticIndexInsert` / `_staticIndexRemove`), with a
  full rebuild only on the first step and on a cell-size change. Bucket contents
  stay in world order, so candidate emission order is unchanged and the
  simulation is bit-identical. **-45% whole-step** on a sustained
  release-and-remove workload (`bench/profile-churn.js`), neutral on steady
  scenes, which had no rebuilds to skip.
- **Flat data in the hot loops.** The mover cell index is a direct-addressed
  array of chain heads rather than a hash table (it is rebuilt every step, so
  per-insert cost dominates), candidate bounds and dedup stamps live in typed
  arrays so a candidate is only dereferenced once it survives its bounds test,
  and a direct-mapped cache in front of the pairs table replaces the numeric
  `Map` lookup `Collision.collides` did per overlapping candidate.
- **Hidden-class hygiene.** All per-body scratch fields are pre-declared in
  `Body.create`; lazily added properties were splitting body object shapes and
  slowing every hot property access engine-wide (measured up to several times
  slower). New scratch fields must be declared there too.
- **Allocation and narrowphase micro-optimisations.** Numeric pair ids instead
  of string keys, a quad-unrolled SAT fast path for the box-vs-box common case,
  resting-body skips, fused `Body.setPositionAndAngle`. Less per-frame garbage
  (about a third less allocation per update) and a few percent step time.
- **Behaviour and API differences from stock**, all of them consequences of the
  above:
  - `Detector.setGridDynamic(body)` is new, and is the only supported way to
    tag a static body that MOVES (the `gridStatic` broadphase must re-index it
    every step). Assigning `body._gridDynamic` by hand no longer suffices,
    because it has to invalidate the cached mover lists.
  - `body.isStatic` / `body.isSleeping` must be changed through
    `Body.setStatic` / `Sleeping.set`, which is what upstream documents anyway.
    A direct assignment leaves the cached mover lists stale.
  - A resting body's `force` / `torque` buffer is no longer zeroed on every
    step, only from the moment it starts moving again (`Body.setStatic` and
    `Sleeping.set` zero it on both transitions). Engines with sleeping enabled
    keep the whole-world pass, since `Sleeping.update` reads that buffer.
  - `pair.id` is a number rather than a string, and `pairs` carries a
    direct-mapped collision record cache alongside its `table`. `Pairs.update`
    now clears `collision.pair` when it drops a pair.
  - A body removed from a composite has its `positionImpulse` cleared. The
    resolver keeps a carry list of bodies whose warmed impulse is still
    decaying, and nothing otherwise told it when a body left the world, so a
    removed body went on having its vertices translated for dozens of steps.
    Stock's all-bodies pass never touched an out-of-world body, so this restores
    that behaviour rather than changing it.
  - A body belongs to one `gridStatic` detector at a time: its static-index
    membership lives on the body, as the broadphase stamps and candidate cache
    already did.
- **Correctness gates.** A tiered determinism spec (`test/Determinism.spec.js`)
  pins settle scenes within a tight epsilon and holds chaotic scenes to physical
  invariants, alongside upstream's example suite. The simulation is
  deterministic but intentionally re-baselined relative to stock: the grid
  broadphase and later passes emit collisions in a different, still
  deterministic, order.

## Upstream

For everything else (demos, gallery, features, plugins, install, usage, examples
and docs) see the [upstream matter-js readme](https://github.com/liabru/matter-js#readme).

## License

Matter.js is licensed under [The MIT License (MIT)](https://opensource.org/licenses/MIT)  
Copyright (c) Liam Brummitt and contributors.

This license is also supplied with the release and source code.  
As stated in the license, absolutely no warranty is provided.
