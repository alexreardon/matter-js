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
- **Correctness gates.** A tiered determinism spec (`test/Determinism.spec.js`)
  pins settle scenes within a tight epsilon and holds chaotic scenes to physical
  invariants, alongside upstream's example suite. The simulation is
  deterministic but intentionally re-baselined relative to stock: the grid
  broadphase and later passes emit collisions in a different, still
  deterministic, order.

Everything below this point is the upstream readme.

[Demos](#demos) ・ [Gallery](#gallery) ・ [Features](#features) ・ [Plugins](#plugins) ・ [Install](#install) ・ [Usage](#usage) ・ [Examples](#examples) ・ [Docs](#documentation) ・ [Wiki](https://github.com/liabru/matter-js/wiki) ・ [References](#references) ・ [License](#license)

### Demos

<table>
  <tr>
    <td>
      <ul>
        <li><a href="https://brm.io/matter-js/demo/#mixed">Mixed Shapes</a></li>
        <li><a href="https://brm.io/matter-js/demo/#mixedSolid">Solid Shapes</a></li>
        <li><a href="https://brm.io/matter-js/demo/#svg">Concave SVG Paths</a></li>
        <li><a href="https://brm.io/matter-js/demo/#terrain">Concave Terrain</a></li>
        <li><a href="https://brm.io/matter-js/demo/#concave">Concave Bodies</a></li>
        <li><a href="https://brm.io/matter-js/demo/#compound">Compound Bodies</a></li>
        <li><a href="https://brm.io/matter-js/demo/#newtonsCradle">Newton's Cradle</a></li>
        <li><a href="https://brm.io/matter-js/demo/#wreckingBall">Wrecking Ball</a></li>
        <li><a href="https://brm.io/matter-js/demo/#slingshot">Slingshot Game</a></li>
        <li><a href="https://brm.io/matter-js/demo/#rounded">Rounded Corners</a></li>
        <li><a href="https://brm.io/matter-js/demo/#views">Views</a></li>
        <li><a href="https://brm.io/matter-js/demo/#timescale">Time Scaling</a></li>
        <li><a href="https://brm.io/matter-js/demo/#manipulation">Body Manipulation</a></li>
        <li><a href="https://brm.io/matter-js/demo/#compositeManipulation">Composite Manipulation</a></li>
      </ul>
    </td>
    <td>
      <ul>
        <li><a href="https://brm.io/matter-js/demo/#raycasting">Raycasting</a></li>
        <li><a href="https://brm.io/matter-js/demo/#sprites">Sprites</a></li>
        <li><a href="https://brm.io/matter-js/demo/#pyramid">Pyramid</a></li>
        <li><a href="https://brm.io/matter-js/demo/#car">Car</a></li>
        <li><a href="https://brm.io/matter-js/demo/#catapult">Catapult</a></li>
        <li><a href="https://brm.io/matter-js/demo/#gravity">Reverse Gravity</a></li>
        <li><a href="https://brm.io/matter-js/demo/#bridge">Bridge</a></li>
        <li><a href="https://brm.io/matter-js/demo/#avalanche">Avalanche</a></li>
        <li><a href="https://brm.io/matter-js/demo/#softBody">Basic Soft Bodies</a></li>
        <li><a href="https://brm.io/matter-js/demo/#cloth">Cloth</a></li>
        <li><a href="https://brm.io/matter-js/demo/#events">Events</a></li>
        <li><a href="https://brm.io/matter-js/demo/#collisionFiltering">Collision Filtering</a></li>
        <li><a href="https://brm.io/matter-js/demo/#chains">Chains</a></li>
        <li><a href="https://brm.io/matter-js/demo/#ballPool">Ball Pool</a></li>
      </ul>
    </td>
    <td>
      <ul>
        <li><a href="https://brm.io/matter-js/demo/#stack">Stack</a></li>
        <li><a href="https://brm.io/matter-js/demo/#circleStack">Circle Stack</a></li>
        <li><a href="https://brm.io/matter-js/demo/#compoundStack">Compound Stack</a></li>
        <li><a href="https://brm.io/matter-js/demo/#restitution">Restitution</a></li>
        <li><a href="https://brm.io/matter-js/demo/#friction">Friction</a></li>
        <li><a href="https://brm.io/matter-js/demo/#airFriction">Air Friction</a></li>
        <li><a href="https://brm.io/matter-js/demo/#staticFriction">Static Friction</a></li>
        <li><a href="https://brm.io/matter-js/demo/#sleeping">Sleeping</a></li>
        <li><a href="https://brm.io/matter-js/demo/#beachBalls">Beach Balls</a></li>
        <li><a href="https://brm.io/matter-js/demo/#stress">Stress 1</a></li>
        <li><a href="https://brm.io/matter-js/demo/#stress2">Stress 2</a></li>
        <li><a href="https://brm.io/matter-js/demo/#sensors">Sensors</a></li>
      </ul>
      <br>
    </td>
  </tr>
</table>

### Gallery

See how others are using matter.js physics

- [Patrick Heng](https://patrickheng.com/) by Patrick Heng
- [USELESS](https://useless.london/) by Nice and Serious
- [Secret 7](https://secret-7.com/) by Goodness
- [New Company](https://www.new.company/) by New Company
- [Game of The Year](https://gameoftheyear.withgoogle.com/) by Google
- [Pablo The Flamingo](https://pablotheflamingo.com/) by Nathan Gordon
- [Les métamorphoses de Mr. Kalia](https://lab212.org/oeuvres/2:art/18/Les-metamorphoses-de-Mr-Kalia) by Lab212
- [Phaser](https://phaser.io/) by Photon Storm
- [Sorry I Have No Filter](https://sorryihavenofilter.com/pages/about/) by Jessica Walsh
- [Fuse](https://fuse.blog/) by Fuse
- [Glyphfinder](https://www.glyphfinder.com/) by überdosis
- [Isolation](https://isolation.is/postcards/my-week) by sabato studio
- [more...](https://github.com/liabru/matter-js/wiki/Gallery)

### Features

- Rigid bodies
- Compound bodies
- Composite bodies
- Concave and convex hulls
- Physical properties (mass, area, density etc.)
- Restitution (elastic and inelastic collisions)
- Collisions (broad-phase, mid-phase and narrow-phase)
- Stable stacking and resting
- Conservation of momentum
- Friction and resistance
- Events
- Constraints
- Gravity
- Sleeping and static bodies
- Plugins
- Rounded corners (chamfering)
- Views (translate, zoom)
- Collision queries (raycasting, region tests)
- Time scaling (slow-mo, speed-up)
- Canvas renderer (supports vectors and textures)
- [MatterTools](https://github.com/liabru/matter-tools) for creating, testing and debugging worlds
- World state serialisation (requires [resurrect.js](https://github.com/skeeto/resurrect-js))
- Cross-browser and Node.js support (Chrome, Firefox, Safari, IE8+)
- Mobile-compatible (touch, responsive)
- An original JavaScript physics implementation (not a port)

### Install

You can install using package managers [npm](https://www.npmjs.org/package/matter-js) and [Yarn](https://yarnpkg.com/) using:

    npm install matter-js

Alternatively you can download a [stable release](https://github.com/liabru/matter-js/tags) or try the latest experimental [alpha build](https://github.com/liabru/matter-js/tree/master/build) (master) and include the script in your web page:

    <script src="matter.js" type="text/javascript"></script>

### Performance with other tools (e.g. Webpack, Vue etc.)

Bundlers and frameworks may reduce real-time performance when using their default configs, especially in development modes.

When using [Webpack](https://webpack.js.org/), the default sourcemap config can have a large impact, for a solution see [issue](https://github.com/liabru/matter-js/issues/1001).

When using [Vue.js](https://vuejs.org/), watchers can have a large impact, for a solution see [issue](https://github.com/liabru/matter-js/issues/1001#issuecomment-998911435). 

### Usage

Visit the [Getting started](https://github.com/liabru/matter-js/wiki/Getting-started) wiki page for a minimal usage example which should work in both browsers and Node.js.  
Also see the [Running](https://github.com/liabru/matter-js/wiki/Running) and [Rendering](https://github.com/liabru/matter-js/wiki/Rendering) wiki pages, which show how to use your own game and rendering loops.

### Tutorials

See the list of [tutorials](https://github.com/liabru/matter-js/wiki/Tutorials).

### Examples

See the [examples](https://github.com/liabru/matter-js/tree/master/examples) directory which contains the source for all [demos](#demos).  
There are even more examples on [codepen](https://codepen.io/collection/Fuagy/).

### Plugins

The engine can be extended through plugins, see these resources:

- [Using plugins](https://github.com/liabru/matter-js/wiki/Using-plugins)
- [Creating plugins](https://github.com/liabru/matter-js/wiki/Creating-plugins)
- [List of plugins](https://github.com/liabru/matter-js/wiki/List-of-plugins)
- [matter-plugin-boilerplate](https://github.com/liabru/matter-plugin-boilerplate)

### Documentation

See the [API Documentation](https://brm.io/matter-js/docs/) and the [wiki](https://github.com/liabru/matter-js/wiki)

### Building and Contributing

To build you must first install [node.js](https://nodejs.org/), then run

	npm install

This will install the required build dependencies, then run

	npm run dev

to spawn a development server. For information on contributing see [CONTRIBUTING.md](https://github.com/liabru/matter-js/blob/master/CONTRIBUTING.md).

### Changelog

To see what's new or changed in the latest version, see the [changelog](https://github.com/liabru/matter-js/blob/master/CHANGELOG.md).

### References

See the wiki page on [References](https://github.com/liabru/matter-js/wiki/References).

### License

Matter.js is licensed under [The MIT License (MIT)](https://opensource.org/licenses/MIT)  
Copyright (c) 2014 Liam Brummitt

This license is also supplied with the release and source code.  
As stated in the license, absolutely no warranty is provided.
