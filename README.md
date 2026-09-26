<img alt="Matter.js" src="https://brm.io/matter-js/img/matter-js.svg" width="300">

A performance fork of [`matter-js@0.20.0`](https://github.com/liabru/matter-js) (a 2D rigid body physics engine), built for [Page Rage](https://page-rage.com), where a web page is shattered into thousands of static tiles with debris moving through them. Upstream is dormant, so the work lives here.

It has two modes:

1. **Drop-in** (default): upstream's API and its sweep broadphase, with the short list of [differences](#differences-from-upstream) below. Faster than upstream on every benchmarked scene.
2. **The `grid` broadphase** (opt-in): much faster again for scenes that are mostly static bodies.

## Who it is for

Upstream's per-step work scales with _total_ body count: the sweep broadphase re-sorts every body on every step, and the engine walks the whole world several times per update. On a scene with `5000` static tiles and `300` movers, almost all of that work finds out again that nothing moved. The `grid` broadphase makes per-step cost scale with the number of _moving_ bodies instead: `2.6-8.4x` faster than upstream on the [Page Rage](https://page-rage.com) scenes, with `88-99%` less allocation per step.

So the fork is for scenes that are mostly static scenery: tile maps, level geometry, destructible terrain. On an ordinary matter scene (a few hundred dynamic bodies and no static field) the drop-in mode is `25-40%` faster than upstream and allocates less, but that is not the regime it is tuned for.

## Installation

Install from a release tag (`v0.20.0-perfN`). The built bundle (`build/matter.js`) is committed, so there is no build step.

```bash
npm install https://github.com/alexreardon/matter-js/archive/refs/tags/v0.20.0-perf19.tar.gz
```

## Usage

### Drop-in mode (default)

Nothing to change. The API and the classic sweep broadphase are upstream's, apart from the [differences](#differences-from-upstream) below.

### The `grid` broadphase (opt-in)

For scenes that are mostly static bodies, give the engine a detector on the grid:

```js
const engine = Matter.Engine.create({
    detector: Matter.Detector.create({
        broadphase: 'grid',
        // optional (defaults to 32): tune to roughly your typical static body size
        cellSize: 32
    })
});
```

The grid buckets static bodies into cells once and keeps that index up to date as bodies come and go. Each step only movers are re-bucketed, and only movers generate candidate pairs, so the static field is never tested against itself. On scenes with few statics there is nothing to skip and the bookkeeping costs `0-10%`, which is why it is opt-in.

A static body that moves needs nothing extra: move it with a `Body` setter (`setPosition`, `setAngle`, `setPositionAndAngle`, `translate`, `rotate`, `scale`, `setVertices`, `Body.set`) and the grid runs it as a moving body from then on. See [only on the `grid` broadphase](#only-on-the-grid-broadphase) for the exact rules.

`broadphase` is `'sweep'` (the default) or `'grid'`; anything else throws, at `Detector.create` and on every step. `cellSize` is a finite number of pixels above `0` whose inverse is finite too, so `0`, `-0` and a denormal such as `1e-310` throw; one given as `undefined` takes the default. Both fields can be changed between updates, and a new `engine.detector.cellSize` rebuilds the index once. A bad value assigned between updates throws at the next `Engine.update` before that update changes anything. Both belong to the detector, so `Engine.create({ broadphase: 'grid' })` and `Engine.create({ cellSize: 32 })` throw rather than being silently ignored. Upstream's back-compatibility `engine.grid` and `engine.broadphase` fields are unrelated stubs that nothing reads.

Through `perf18` the grid was the `gridStatic` mode, set on module globals (`Detector._mode = 'gridStatic'`, `Detector._cellSize`), and a moved static had to be tagged with `Detector.setGridDynamic`. All three are gone.

### Skipping the solved-velocity pass (opt-in)

```js
const engine = Matter.Engine.create({ enableSolvedVelocityAndBounds: false });
```

By default (`true`, upstream's behaviour) each update ends by bringing every moving body's `velocity`, `angularVelocity`, `speed`, `angularSpeed` and `bounds` up to date with the collision solve. The engine itself never reads those on a moving body between updates, so a consumer that does not read them either can skip that work. It is worth about `3-5%` of a step on the Page Rage scenes (see [performance](#against-perf18)). Keep it `true` if anything reads those fields between updates: `Render`'s velocity and bounds views, `Query`, `MouseConstraint`, or your own code. The exact contract is under [differences](#differences-from-upstream).

### Removing many bodies at once

```js
Matter.Composite.removeBodies(world, bodies);
```

Takes every listed body out of the composite in ONE order-preserving pass. A `Composite.remove` per body scans the body array once each.

## Differences from upstream

In both modes:

- `Matter.version` reports the fork tag (`0.20.0-perf19`) rather than `0.20.0`, so a consumer can assert in CI that it resolved the release it pinned. Version RANGES are unaffected (`^0.20.0` and `~0.20.0` still match, since `Plugin.versionSatisfies` compares major/minor/patch and ignores the suffix); only a plugin pinning the exact string `matter-js@0.20.0` would stop matching.
- The broadphase is configured on the detector (`broadphase`, `cellSize`; see [the `grid` broadphase](#the-grid-broadphase-opt-in)). `Detector.collisions` throws on a detector whose `broadphase` is neither `'sweep'` nor `'grid'`, which includes one built by hand as a plain `{ bodies, pairs }` object: build it with `Detector.create`. `Engine.create` throws on a string `broadphase` option, which upstream overwrote with its back-compatibility `engine.broadphase` field, and on any `cellSize` option. `Engine.update` checks the detector's configuration before it changes anything, so an update that throws on it leaves the world as it was.
- `Engine.create({ enableSolvedVelocityAndBounds: false })` is new (default `true`, which keeps upstream behaviour). With it `false`, between updates a moving body's `velocity` and `angularVelocity` hold the values integration set before the solve, its `speed` and `angularSpeed` are not kept, and its `bounds` can lag its last position correction. Bounds recomputed between updates (`Body.setPosition`, `Body.setAngle`) are padded by that velocity. `Body.setStatic` and `Sleeping.set` bring a body's bounds up to date before it stops moving, and an update with a `delta` of `0` brings the bounds and the four velocity fields up to date before it detects and solves, so the detector never reads a stale box. Derive velocity with `Body.updateVelocities`' expression if you need it. Positions are otherwise the same either way, with one known exception: with `enableSleeping` also on, a run that includes updates with a `delta` of `0` can drift from the same run with the option `true` (by about `1e-4` px within a few hundred updates in a measured scene). The option's docs in `src/core/Engine.js` say exactly what stays current.
- `Composite.removeBodies(composite, bodies)` is new: it takes every listed body out of the composite in one order-preserving pass, doing to each exactly what `Composite.removeBody` does. A listed body that is not in the composite is left alone; a body in it twice is removed both times. It does not search child composites or trigger the `beforeRemove` / `afterRemove` events.
- `collision.penetration` no longer exists. Derive it as `normal` scaled by `depth`, which is how the built-in debug renderer now draws it.
- `collision.tangent` no longer exists. Derive it from the normal as `{ x: -normal.y, y: normal.x }`, which is exactly the value it held.
- `pair.id` is a number rather than a string.
- `engine.pairs.collisionActive` and `engine.pairs.collisionEnd` are only filled while their engine event has a listener, and are otherwise left empty. `engine.pairs.collisionStart` is filled on every update. A `collisionActive` or `collisionEnd` listener added part way through an update misses that update.
- For a world with no child composites, `Engine.update` works over `world.bodies` itself rather than a copy, and `engine.detector.bodies` IS that array between updates, so an add or remove made between updates shows in it at once (`Composite.allBodies` still returns a copy). A change a listener makes DURING an update goes to a fresh `world.bodies`, so the update keeps the membership it started with, as upstream did. Code that edits `world.bodies` directly must call `Composite.setModified(world, true, true, false)` afterwards (upstream needed that too, for the `allBodies` cache), and must not do it during an update. To take many bodies out at once, prefer `Composite.removeBodies` to a hand-rolled compaction.
- Change `body.isStatic` / `body.isSleeping` through `Body.setStatic` / `Sleeping.set` (which is what upstream documents anyway). Direct assignment leaves cached mover lists stale.
- Likewise, change a STATIC body's `position`, `positionPrev`, `angle`, `anglePrev` or `inverseInertia` through the `Body` methods (`setPosition`, `setVelocity`, `setAngle`, `setMass`, `Body.set` and so on), never by assigning the field. The velocity solver gives a static that is not moving a constant zero row without reading the body, on the strength of a flag those methods keep (`Common._isRestingStatic`); a direct assignment that gives a static a velocity leaves the flag stale, and the solver then treats that static as still.
- A resting body's `force` / `torque` is only zeroed once it starts moving again. Unchanged when sleeping is enabled.
- A body removed from a composite has its `positionImpulse` cleared, so it stops being simulated (this matches what upstream effectively did).
- A world with no constraints skips the constraint passes entirely. If the LAST constraint is removed while a body's warmed `constraintImpulse` is still non-zero, that residual is frozen rather than applied over a few more decaying steps, until a constraint exists again.
- The position solver derives each body's contact share once per step. Mutating `body.totalContacts` or `Resolver._positionDampen` BETWEEN two `Resolver.solvePosition` calls of the same step is no longer picked up; `Engine.update` does neither.
- `Bodies.rectangle` accepts dimensions upstream could not. Upstream builds the body from a path string, and its parser's character class omits `+`, so any dimension `String()` renders in exponent form (`1e+21` and above) silently produced a `NaN` body. Here the corners are built directly, so there is no parse to get wrong.
- Collisions are emitted in a different (still deterministic) order than upstream. `perf19` is also not bit-identical to `perf18` (see [re-baseline](#re-baseline-in-perf19)).

### Only on the `grid` broadphase

- A resting body (static or asleep) that a `Body` setter moves or reshapes after the grid indexed it becomes a moving body for the grid while that rest lasts, which is exactly as costly as any other mover. A real change of rest (`Body.setStatic` or `Sleeping.set` flipping its flag) ends that: released it is a mover anyway, and resting again it is indexed where it rests. A setter that leaves the body's bounds exactly as they were (`setPosition` to where it is, `translate` by zero, `setAngle` to its angle, `scale(1, 1)`) changes nothing the grid holds, and promotes nothing; nor does a move of a body removed from its world since the grid last stepped, which the grid indexes wherever it is when it comes back. A body released (or woken), moved by a setter and put back to rest before the next step is indexed where it rests. A body frozen while it carries a warmed `positionImpulse` (which `Body.setStatic` does not clear, as upstream does not) goes on being moved by the resolver for about 90 updates; the grid runs it as a mover until that stops, and indexes it where it stops. One moved by assigning `position` or `vertices` directly is NOT noticed, and the grid keeps answering for where it was. A resting body moved before its first grid step is simply indexed where it is.
- A body belongs to one grid detector at a time. It can move between worlds that two grid engines step (remove it from one world, add it to the other): the removal takes it out of the first grid's index. A body indexed by two grids at once (in two stepped worlds together, or seen by a second grid detector run over a world another grid engine steps) is not supported: the last to index it holds it, and the other answers wrongly for it.
- For a world with no child composites, the broadphase and the engine's mover list learn what changed from a body journal the world keeps (`Composite.add`, `Composite.remove`, `Composite.removeBodies`, `Body.setStatic`, `Sleeping.set` and the setter promotion above record into it) rather than by walking every body, while movers are at most a quarter of the world. A direct edit of `world.bodies`, signalled by `Composite.setModified`, is still correct but costs that walk on the next update. So does a new `world.bodies` array: the copy a listener's change makes during an update, and an array a caller puts in the world's place (which the journal cannot have seen). The setter contract above matters more here: a flag assigned directly is picked up only at the next full walk, which may be many updates away.

## Re-baseline in perf19

Most releases of this fork are bit-identical to the one before them. `perf19` is not, on purpose (the `perf8` pass was the last release that re-baselined).

- **Why.** Its box-vs-box separating-axis test is fused: it works from each box's half extents rather than projecting all four vertices of both boxes onto every axis. That is the same test with its arithmetic in a different order, so a box pair's overlap can round differently in the last bits. A scene with box contacts then drifts away from `perf18`'s trajectory the way any floating-point change makes a chaotic scene drift.
- **What stays.** The simulation is as deterministic as ever: the same scene run twice gives the same result. Every other `perf19` change is bit-identical to `perf18` on the sweep broadphase, and `enableSolvedVelocityAndBounds` left at its default changes nothing.
- **What the gates show.** The 46-example similarity gate against `perf18` prints `30` `●` (extrinsics changed), two of which also print `◆` (intrinsics changed: `remove` and `sleeping`), and `16` `·` (no change). The tiered determinism spec ([`test/Determinism.spec.js`](test/Determinism.spec.js)) holds settle scenes within a tight epsilon and chaotic scenes to physical invariants; its ramp scene was re-pinned to the new pose.
- **Two grid fixes change results too, towards the sweep.** On `perf18` the grid kept answering for a stale pose in two cases the resolver or a caller creates: a body frozen while it carries a warmed `positionImpulse` (the resolver goes on moving it), and a body released, moved and frozen again before the grid steps. The grid now finds the contacts the sweep finds there.
- **What to do.** If you keep recorded trajectories (replays, golden files, snapshot tests), re-record them against `perf19`.

## Performance

Measured at `perf19` on an Apple M1 Pro under Node 24, with default engine options (`enableSolvedVelocityAndBounds: true`) unless a table says otherwise. The machine was not idle: its load average sat between `6` and `10` on `10` cores through the runs these tables keep (other apps open; one exception is noted under the `perf18` table). The method is under [how these are measured](#how-these-are-measured), and it changed at `perf19` in a way that moved the upstream column.

### Against upstream `0.20.0`

Time for one `Engine.update` (lower is faster):

| Scenario | Bodies | Upstream `0.20.0` | Fork (drop-in) | Fork (`grid`) |
| --- | --- | --- | --- | --- |
| **General** | | | | |
| Box stack settling | `339` | `287us` | `187us` (`-35%`) | `199us` (`-31%`) |
| Mixed shapes pile | `303` | `1031us` | `615us` (`-40%`) | `659us` (`-36%`) |
| Constraint chains | `315` | `333us` | `251us` (`-25%`) | `248us` (`-26%`) |
| Sleeping enabled | `403` | `365us` | `226us` (`-38%`) | `249us` (`-32%`) |
| Moving static platforms | `319` | `513us` | `325us` (`-37%`) | `325us` (`-37%`) |
| **[Page Rage](https://page-rage.com)** | | | | |
| Page, calm | `5,303` | `1904us` | `1702us` (`-11%`) | `417us` (`-78%`) |
| Page, debris raining | `5,303` | `1859us` | `1401us` (`-25%`) | `398us` (`-79%`) |
| Page, firing | `5,311` | `1972us` | `1501us` (`-24%`) | `443us` (`-78%`) |
| Page, 800-mover storm | `5,803` | `4032us` | `2850us` (`-29%`) | `1290us` (`-68%`) |
| Page, being destroyed | `5,003` | `5543us` | `4787us` (`-14%`) | `1156us` (`-79%`) |
| Page, calm (2000 tiles) | `2,303` | `951us` | `635us` (`-33%`) | `366us` (`-61%`) |
| Page, calm (8000 tiles) | `8,303` | `3667us` | `2675us` (`-27%`) | `437us` (`-88%`) |

Heap growth per step (less garbage means fewer GC pauses mid-simulation):

| Scenario | Upstream `0.20.0` | Fork (drop-in) | Fork (`grid`) |
| --- | --- | --- | --- |
| Box stack settling | `35.8 KB` | `4.4 KB` (`-88%`) | `3.2 KB` (`-91%`) |
| Mixed shapes pile | `86.6 KB` | `19.6 KB` (`-77%`) | `11.6 KB` (`-87%`) |
| Constraint chains | `194.0 KB` | `172.8 KB` (`-11%`) | `156.7 KB` (`-19%`) |
| Sleeping enabled | `46.5 KB` | `10.7 KB` (`-77%`) | `7.2 KB` (`-85%`) |
| Moving static platforms | `86.2 KB` | `50.3 KB` (`-42%`) | `35.3 KB` (`-59%`) |
| Page, calm | `133.0 KB` | `58.2 KB` (`-56%`) | `4.9 KB` (`-96%`) |
| Page, debris raining | `127.4 KB` | `62.4 KB` (`-51%`) | `9.5 KB` (`-93%`) |
| Page, firing | `136.2 KB` | `70.8 KB` (`-48%`) | `11.7 KB` (`-91%`) |
| Page, 800-mover storm | `288.7 KB` | `91.4 KB` (`-68%`) | `21.8 KB` (`-92%`) |
| Page, being destroyed | `1231.7 KB` | `1105.7 KB` (`-10%`) | `145.1 KB` (`-88%`) |
| Page, calm (2000 tiles) | `87.5 KB` | `26.3 KB` (`-70%`) | `4.8 KB` (`-94%`) |
| Page, calm (8000 tiles) | `162.6 KB` | `91.5 KB` (`-44%`) | `2.3 KB` (`-99%`) |

What the tables say:

- The grid's win grows with the size of the static field: `-61%` at `2000` tiles, `-78%` at `5000`, `-88%` at `8000`.
- The grid costs `0-10%` against the drop-in mode on the general scenes (there is nothing to skip) and is worth a further `1.7x` to `6.1x` on a page. That is why it is opt-in.
- The narrowest grid win is the storm, dominated by contact solving, which this fork speeds up but does not do less of.
- The drop-in page rows are narrower than this table used to say (`-11%` to `-33%`, where the `perf14` table read `-17%` to `-38%`). The engine did not get slower; the old upstream column was measured too slow (see [how these are measured](#how-these-are-measured)).

### Against `perf18`

The same suite with `perf18` as the baseline (`BASELINE_REF=9c42889`: `perf18` plus a fix to how its source loads, see [`perf19`](#perf19)), both releases on both broadphases, fastest of two runs:

| Scenario | `perf18` (drop-in) | `perf19` (drop-in) | `perf18` (`grid`) | `perf19` (`grid`) |
| --- | --- | --- | --- | --- |
| **General** | | | | |
| Box stack settling | `201us` | `191us` (`-4.9%`) | `213us` | `203us` (`-4.7%`) |
| Mixed shapes pile | `654us` | `618us` (`-5.5%`) | `688us` | `669us` (`-2.8%`) |
| Constraint chains | `265us` | `253us` (`-4.3%`) | `263us` | `252us` (`-4.3%`) |
| Sleeping enabled | `244us` | `230us` (`-5.6%`) | `263us` | `250us` (`-4.6%`) |
| Moving static platforms | `363us` | `331us` (`-9.0%`) | `374us` | `326us` (`-13.0%`) |
| **[Page Rage](https://page-rage.com)** | | | | |
| Page, calm | `1811us` | `1713us` (`-5.4%`) | `484us` | `425us` (`-12.3%`) |
| Page, debris raining | `1437us` | `1384us` (`-3.7%`) | `455us` | `407us` (`-10.5%`) |
| Page, firing | `1580us` | `1567us` (`-0.8%`) | `515us` | `446us` (`-13.5%`) |
| Page, 800-mover storm | `2954us` | `2940us` (`-0.5%`) | `1512us` | `1307us` (`-13.6%`) |
| Page, being destroyed | `4880us` | `4633us` (`-5.1%`) | `1436us` | `1227us` (`-14.5%`) |
| Page, calm (2000 tiles) | `756us` | `668us` (`-11.7%`) | `440us` | `385us` (`-12.5%`) |
| Page, calm (8000 tiles) | `2669us` | `2913us` (`+9.1%`) | `510us` | `443us` (`-13.2%`) |

The drop-in PAGE rows are the least steady cells in either table: a sweep arm touches every body every step, so build order and the rest of the machine move it most (below). The `8000`-tile drop-in cell is the clearest case: across one run's four processes `perf18` read `2669-4214us` and `perf19` `3307-4580us`, and the second run read the other way round (`3005us` against `2913us`). Read the grid columns and the general rows for the release-to-release change. The second run overlapped another job on the machine (load average up to `29`), which can only slow a cell, so the faster reading was kept.

**The consumer's configuration.** [Page Rage](https://page-rage.com) runs the grid with `enableSolvedVelocityAndBounds: false`, on page scenes whose floor and walls are tiles (the suite's three oversized bounds are a body the game never builds). Calm and firing are [`bench/profile-game.js`](bench/profile-game.js), storm is [`bench/profile-churn.js`](bench/profile-churn.js) and traversal is a scene in the consumer's own harness; each build runs alone in a fresh process, the two builds alternate in ABBA order over `8` rounds, and each cell is the median `us` per update:

| Scene | `perf18` | `perf19`, option `true` | `perf19`, option `false` |
| --- | --- | --- | --- |
| Calm page (`5000` tiles, `300` resting debris) | `486us` / `494us` | `441us` (`-9.2%`) | `421us` (`-14.8%`) |
| Firing (calm plus `8` fast sensor bullets) | `511us` / `515us` | `460us` (`-10.0%`) | `441us` (`-14.4%`) |
| Storm (`2250` tiles, `25` released a frame) | `2758us` / `2725us` | `2397us` (`-13.1%`) | `2290us` (`-16.0%`) |
| Traversal (camera moving through the page; statics added and removed every frame with `Composite.removeBodies`) | `121us` / `121us` | `80us` (`-34.1%`) | `77us` (`-36.2%`) |

Each `perf19` cell is against the `perf18` reading from its own session (the two `perf18` figures, option `true` then `false`, which `perf18` ignores). The option is worth about `3-5%` of a page step on top of the rest; the traversal row is mostly the body journal and `Composite.removeBodies` (`-24%` measured alone).

### How these are measured

<details>
<summary>The method, and why the upstream column moved at <code>perf19</code></summary>

`npm run bench-suite` runs [`bench/suite.js`](bench/suite.js): this fork against a baseline tree (stock `0.20.0` by default, provisioned as a git worktree; `BASELINE_REF` names another), in one process, on identical worlds, in alternating timed blocks. The arms are the baseline on the sweep, the fork in drop-in mode (the same sweep broadphase, so the difference is everything else), and the fork on the `grid`; a fork release as the baseline adds its own grid arm. Every arm's calls into the grid are counted, and a grid arm that did not run the grid on every update, or a sweep arm that ran it once, fails the run.

Simulation time is microseconds per `Engine.update`: the mean of the fastest fifth of blocks per arm (`24` blocks for the general scenes, `40` for the page scenes). Each scenario runs in as many fresh processes as there are arms, the build order rotated by one each time, and each arm keeps its best; each published cell is then the fastest of three full suite runs. Memory is heap growth per step across collection-free windows (`npm run bench-suite -- --alloc`), so short-lived garbage counts too.

**Build order moved the upstream column at `perf19`.** On the page scenes, the arm BUILT first in a process reads `20-50%` slower than the same code built second: three copies of stock `0.20.0` in one process, blocks interleaved, read `2810us` / `1896us` / `2092us` on the calm page, and a `gc()` between builds did not change that. The sweep arms feel it most (they touch every body every step); the grid barely does (`417-441us` on the calm page in any position). Through `perf18` the suite always built the upstream arm first, so every published upstream PAGE cell carried that penalty, and the fork's page percentages were overstated, the drop-in ones most. Since `perf19` the suite rotates the build order across its processes, so every arm is built in every position once and keeps its best.

The self-check was read differently at `perf19` for the same reason. Keeping the fastest reading per cell used to bring every upstream number within `7%` of the previous release's, and that agreement is the check that the table measured the engine and not a busy laptop. At `perf19` the general upstream cells held (`-1%` to `-2%` against `perf14`'s), and each run's process with the OLD build order (upstream first) read the old page cells back at `-4%` to `+18%`, five of the seven within `7%`. The rotated page cells fell `3-23%` at once, and that step is the instrument, not the machine. The upstream arm is the volatile one: its sweep broadphase insertion-sorts every body every step, so it is memory-bound and takes the brunt of whatever else the machine is doing. Allocation needs almost none of this: against the upstream figures published at `perf15`, eight of the twelve reproduce within `1%` and all within `5%`.

**A release whose win is smaller than this table's session noise gets measured build-to-build, not published into these cells.** At `perf15` the machine could not reproduce four upstream cells within `7%` however many samples were taken (`page-8k` read `+20%` over ten), while the fork columns held a `1.4%` spread on the same cell across the same ten samples, so the timing table stayed at `perf14` and `perf15` (`-2%` to `-5%`) and `perf17` (`~-0.5%`) were measured against their predecessors directly. `perf19` is republished because its win is well above that noise, and because the cells had to move for the build-order fix anyway.

The general scenes are typical matter scenes (a few hundred dynamic bodies, no static field) and exist to catch regressions outside the regime this fork targets. The page scenes are that regime. Their floor and two walls are single oversized bodies, which the grid holds on a list every mover rescans every step; the shipped game builds none, which is why the consumer's own numbers above are measured on tiled bounds. The suite keeps the oversized three so its cells stay comparable across releases.

</details>

## What changed

The only public record of what each release bought. Benefit is whole-step `Engine.update` time on the target scene unless stated otherwise.

### `perf19`

The squeeze-10 round: `53` commits on top of `perf18`. Every change but the fused SAT was gated one at a time: bit-identical on the sweep (`test/Determinism.spec.js`, the 46-example gate at `·`), and on the grid against the pairs the sweep finds (`bench/grid-correctness.js`). The round was measured as a whole against `perf18`. Where a group was also measured alone, its number is given; the rest is inside the total.

| Change | Benefit |
| --- | --- |
| **Dead writes dropped** — no stored `collision.tangent`, no solved separation written back to every pair, no `collisionActive` / `collisionEnd` lists or per-update events built for nobody; and, behind the new `enableSolvedVelocityAndBounds: false`, no end-of-update velocity pass and no bounds refresh after a position correction | under `1%` each; the option about `3-5%` more on a page |
| **Closed-form box supports** — a body that is geometrically a rectangle carries a box tag, and a box pair's contact supports come from a closed form instead of a hill-climb over the vertices | inside the total |
| **Fused box-box SAT (RE-BASELINE)** — two tagged boxes are tested on their half extents in one pass instead of projecting four vertices onto each axis; every other shape keeps the memoised self-projection. Not bit-identical: see [re-baseline](#re-baseline-in-perf19) | `-9%` on the consumer's calm, firing and storm scenes, `-5%` on traversal; `-6%` on the mixed shapes pile |
| **Resting-static solver row** — the velocity solver gives a static that is not moving a constant zero row without reading the body | inside the total |
| **The engine iterates `world.bodies`** — a flat world is updated over its own body array, not a copy made every update | inside the total |
| **Per-world body journal, and `Composite.removeBodies`** — the grid and the engine's mover list learn what was added, removed, frozen or released from a journal the world keeps, instead of walking every body; a batch of bodies leaves in one order-preserving pass | `-24%` on the consumer's traversal scene |
| **Detector freebies, and backward-shift pair deletion** — lists cleared by popping and the changed-cell report filled by index, dead per-body grid fields and writes gone, and the pair-record table deleting by backward shift instead of leaving tombstones, which filled the table to half load every ~`54` storm steps and forced a rebuild | time flat to `-1%`; `-18%` and `-4%` of a storm's scavenges |
| **Grid correctness** — a body frozen while carrying a warmed `positionImpulse` runs as a mover until the resolver stops moving it, and a body released, moved and frozen again before the grid steps is indexed where it rests; `perf18` kept answering for the stale pose in both | the grid finds the contacts the sweep finds |
| **Grid API** — the broadphase is configured per detector (`broadphase: 'grid'`, `cellSize`), and a setter that moves an indexed resting body promotes it, so `Detector.setGridDynamic` and the module globals are gone | none measured |
| **Round total** (default options) | `grid`: `-10%` to `-15%` on every page scene, `-3%` to `-13%` on the general ones; drop-in: `-4%` to `-9%` on the general scenes (its page rows are too unsteady to quote, above) |
| **Round total** (the consumer's configuration, option `false`) | calm `-14.8%`, firing `-14.4%`, storm `-16.0%`, traversal `-36.2%` |

One more commit changes nothing a consumer of the bundle runs: loaded from `src` through Node, `Matter.Body` sat in dictionary mode (a circular require during its file's load), which biased every in-process A/B bench. `perf19` fixes the load, and its `perf18` baseline is `perf18` with that one fix (`9c42889`).

### `perf2` to `perf18`

Each change was A/B'd on its own, in almost every case against the previous release tag.

_Naming: these rows were measured when the grid broadphase was the `gridStatic` mode (`Detector._mode = 'gridStatic'`). `gridStatic` in them is `broadphase: 'grid'`._

Three rows were measured differently, because their effect could not be isolated that way: the constraint skip is a build against the same build with the skip forced off; the position solver share divide was resolved by AMPLIFICATION, raising the position iteration count to scale only the work the change removes (`-2.63%` at `8x` over `15` interleaved runs, `t = -2.25`, extrapolating to `~-0.5%` at the shipped six iterations), after a hunt over the whole profiled frontier produced `21` candidates and killed `20` on counted evidence; and the `gridStatic` mover list is an ALLOCATION result with a null timing result, measured in the consumer against a byte-identical null arm.

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
| **`gridStatic` mover list filled by index** — the classification walk writes `movers` in place and trims once, instead of clearing it to zero and re-pushing; clearing drops the backing store, so every rebuild regrew it from empty. The walk rebuilds every step while the body set is changing | `-5.6%` of all allocation per step while bodies are added and removed |

## Why not Rapier?

[Rapier](https://rapier.rs/) is a 2D physics engine written in Rust and compiled to WASM, and swapping to it looks like a free native-code win. It isn't, because stepping the world is not the whole cost: the renderer lives in JS, so every frame reads every body's position and rotation back across the WASM boundary (`~0.4us` per body), and destruction crosses the boundary again for every body added or removed.

At `perf13`, with that readback included, Rapier and this fork were level on a calm or firing page. Rapier stayed about `25%` ahead at peak load, but on a calm page it allocated `~29x` more memory per frame than this fork. Allocation matters: the more garbage a frame creates, the more often the garbage collector pauses the game, and those pauses are visible as stutter.

<details>
<summary>The full comparison</summary>

_The Rapier tables were measured at `v0.20.0-perf13` and have not been re-run since. The fork's `gridStatic` column (`broadphase: 'grid'`) has got faster in every release after it: compare it with the grid column of [the tables above](#against-upstream-0200), measured on the same scenes at `perf19`. Their Upstream column carries a known bias: `bench/vs-rapier.js` builds the upstream arm first in its process, and on the page scenes the arm built first reads `20-50%` slower (see [how these are measured](#how-these-are-measured)). The fork and Rapier columns, which the comparison rests on, are not first._

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

The suite's method as it stood at `perf13` (the upstream arm always built first): four arms in one process on identical worlds, alternating timed blocks, mean of the fastest fifth of `24` blocks, best of three processes, on an Apple M1 Pro under Node 24. Each scenario checks that body counts match, positions stay finite, and stacks settle to the same heights.

Rapier runs its 2D defaults (`numSolverIterations: 4`, a higher-quality solver than matter's — but dropping it to `1` only saves `~4%`, so solver quality does not explain the gap). Gravity, damping and velocities are unit-converted so both engines integrate the same trajectories. One known flaw: `3` of the `800` storm movers escape the bowl in the Rapier arms (`0.4%`, in Rapier's favour).

Rapier is not a devDependency. To reproduce: `npm install --no-save @dimforge/rapier2d-simd-compat`, then `npm run bench-rapier` (add `--alloc` for the memory table).

</details>

</details>

## Everything else

Demos, docs, features, plugins and examples: see the [upstream readme](https://github.com/liabru/matter-js#readme).

## License

[The MIT License (MIT)](https://opensource.org/licenses/MIT)

- Upstream Matter.js: Copyright (c) Liam Brummitt and contributors.
- This fork's changes: Copyright (c) Alexander Reardon.

The license is also supplied with the release and source code.
As stated in the license, absolutely no warranty is provided.
