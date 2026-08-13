/* eslint-env node */
// Game-regime profiler: the page-destroyer workload (dense STATIC page + dynamic
// debris) run under the SAME broadphase the game ships (gridStatic), with
// per-phase timers that cover the whole Engine.update pipeline including the
// O(n) all-body passes that the grid win exposed as the next cost centre.
//
// Usage:
//   node bench/profile-game.js [buildPath]            (default ../src/module/main.js)
//   MODE=sweep|gridStatic   broadphase mode           (default gridStatic)
//   STATICS=<n>             approximate static count  (default 5000, grid layout)
//   MOVERS=<n>              dynamic debris count      (default 300)
//   PHASES=1                per-phase timers
//   SCENE=settle|calm|firing  settle = debris rains and piles (storm regime)
//                             calm   = debris pre-settled, mostly resting (traversal regime)
//                             firing = calm plus BULLETS fast sensor bodies streaking
//                                      through the static field (the shoot regime)
//   BULLETS=<n>             sensor bullet count for SCENE=firing (default 8)
"use strict";

const buildPath = process.argv[2] || '../src/module/main.js';
const Matter = require(buildPath);
const { Engine, Composite, Bodies, Body, Detector, Pairs, Resolver, Collision } = Matter;

const MODE = process.env.MODE || 'gridStatic';
const STATICS = Number(process.env.STATICS || 5000);
const MOVERS = Number(process.env.MOVERS || 300);
const SCENE = process.env.SCENE || 'settle';
const UPDATES = Number(process.env.UPDATES || 1500);
const BULLETS = Number(process.env.BULLETS || 8);

Detector._mode = MODE;

const hr = () => Number(process.hrtime.bigint());

const timers = {};
const counts = {};
function wrap(obj, name, key) {
    const orig = obj[name];
    timers[key] = 0;
    counts[key] = 0;
    obj[name] = function() {
        const t = hr();
        const r = orig.apply(this, arguments);
        timers[key] += hr() - t;
        counts[key]++;
        return r;
    };
}
if (process.env.PHASES) {
    wrap(Detector, 'collisions', 'Detector.collisions');
    wrap(Pairs, 'update', 'Pairs.update');
    wrap(Resolver, 'preSolvePosition', 'Resolver.preSolvePosition');
    wrap(Resolver, 'solvePosition', 'Resolver.solvePosition');
    wrap(Resolver, 'postSolvePosition', 'Resolver.postSolvePosition');
    wrap(Resolver, 'preSolveVelocity', 'Resolver.preSolveVelocity');
    wrap(Resolver, 'solveVelocity', 'Resolver.solveVelocity');
    wrap(Collision, 'collides', 'Collision.collides');
    wrap(Body, 'update', 'Body.update');
    wrap(Body, 'updateVelocities', 'Body.updateVelocities');
    wrap(Composite, 'allBodies', 'Composite.allBodies');
    wrap(Engine, '_bodiesApplyGravity', 'Engine.applyGravity');
    wrap(Engine, '_bodiesUpdate', 'Engine.bodiesUpdate');
    wrap(Engine, '_bodiesUpdateVelocities', 'Engine.updateVelocities');
    wrap(Engine, '_bodiesClearForces', 'Engine.clearForces');
}

let seed = 24681;
const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

// The gridStatic oversize predicate: a static spanning more than `maxCells` (24)
// cells of the broadphase grid is not bucketed at all. It goes on `sOver`, an
// unindexed list EVERY mover rescans every step, so three big bodies cost
// movers x 3 bounds tests a step forever.
//
// The real game holds ZERO oversized statics on all six fixtures (worldgen
// subdivides a panel into tiles before it reaches the physics world), so a floor
// and two walls built as single bodies put work in this profile that the shipped
// workload never pays: 900.00 sOver tests per calm step, 1476.00 per churn step,
// rejecting 91.6% / 99.87% of the time. Build the bounds as tiles instead: same
// geometry, same piling behaviour, no oversized static.
const BOUND_CELL_SIZE = 32;
const BOUND_MAX_CELLS = 24;

// The piece size is baked against BOUND_CELL_SIZE so the scene stays byte-stable
// across engine changes. If the engine's cell size moves, the bake is wrong and
// the bounds go oversized again SILENTLY, which is the exact bug this replaces.
// Fail loudly instead, and re-bake the constant deliberately.
if ((Detector._cellSize || 32) !== BOUND_CELL_SIZE) {
    throw new Error('bench bound tiling is baked for cellSize ' + BOUND_CELL_SIZE
        + ' but Detector._cellSize is ' + Detector._cellSize);
}

function addBound(world, centreX, centreY, width, height) {
    const cellSpan = (size) => Math.floor(size / BOUND_CELL_SIZE) + 2;
    const horizontal = width >= height;
    const longSide = horizontal ? width : height;
    const shortCells = cellSpan(horizontal ? height : width);
    const maxLongPx = (Math.floor(BOUND_MAX_CELLS / shortCells) - 2) * BOUND_CELL_SIZE;
    const pieces = Math.ceil(longSide / maxLongPx);
    const pieceLength = longSide / pieces;

    for (let piece = 0; piece < pieces; piece++) {
        const offset = -longSide / 2 + pieceLength * (piece + 0.5);
        Composite.add(world, Bodies.rectangle(
            horizontal ? centreX + offset : centreX,
            horizontal ? centreY : centreY + offset,
            horizontal ? pieceLength : width,
            horizontal ? height : pieceLength,
            { isStatic: true }
        ));
    }

    return pieces;
}

function buildScene() {
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;

    // floor + walls so debris piles instead of escaping, TILED (see addBound)
    let boundCount = 0;
    boundCount += addBound(world, 1000, 2400, 2200, 60);
    boundCount += addBound(world, -40, 1200, 60, 2600);
    boundCount += addBound(world, 2040, 1200, 60, 2600);

    // the "page": dense grid of static tiles (~15-40px like shattered text/tiles)
    const cols = Math.round(Math.sqrt(STATICS * (2000 / 2300)));
    const rows = Math.ceil(STATICS / cols);
    let staticCount = 0;
    for (let row = 0; row < rows && staticCount < STATICS; row++) {
        for (let col = 0; col < cols && staticCount < STATICS; col++) {
            Composite.add(world, Bodies.rectangle(
                30 + col * (1960 / cols), 30 + row * (2200 / rows),
                Math.max(10, 1960 / cols - 6), Math.max(8, 2200 / rows - 6),
                { isStatic: true }
            ));
            staticCount++;
        }
    }

    // dynamic debris
    let dynamicCount = 0;
    for (let i = 0; i < MOVERS; i++) {
        const w = 12 + rand() * 20;
        const h = 12 + rand() * 20;
        const spawnY = SCENE === 'settle'
            ? -40 - rand() * 900
            : 2340 - (i % 8) * 26;
        const b = Bodies.rectangle(60 + rand() * 1880, spawnY, w, h, {
            friction: 0.4,
            restitution: 0.2
        });
        Body.setAngle(b, rand() * Math.PI);
        Composite.add(world, b);
        dynamicCount++;
    }

    // fast sensor bullets that streak horizontally through the static field,
    // wrapped back to the left edge on exit (mirrors the game's projectiles:
    // sensors with zero gravity scale and a high straight-line velocity)
    const bullets = [];
    if (SCENE === 'firing') {
        for (let i = 0; i < BULLETS; i++) {
            const bullet = Bodies.rectangle(-60 - i * 260, 120 + (i % 6) * 320, 14, 6, {
                isSensor: true,
                frictionAir: 0
            });
            Body.setVelocity(bullet, { x: 30, y: 0 });
            Composite.add(world, bullet);
            bullets.push(bullet);
        }
    }

    return { engine, staticCount: staticCount + boundCount, dynamicCount, bullets };
}

const built = buildScene();
const engine = built.engine;
const bullets = built.bullets;
const delta = 1000 / 60;
const warmup = SCENE === 'settle' ? 240 : 600;

// wrap exited bullets back to the left edge on their original row, mirroring
// the game's continuous fire (deterministic: row derived from index)
function driveBullets() {
    for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex++) {
        const bullet = bullets[bulletIndex];
        if (bullet.position.x > 2100) {
            Body.setPosition(bullet, { x: -60, y: 120 + (bulletIndex % 6) * 320 });
            Body.setVelocity(bullet, { x: 30, y: 0 });
        }
    }
}

for (let i = 0; i < warmup; i++) {
    Engine.update(engine, delta);
    driveBullets();
}

// zero the timers accumulated during warmup so the report is steady-state only
for (const k of Object.keys(timers)) { timers[k] = 0; counts[k] = 0; }

const tStart = hr();
for (let i = 0; i < UPDATES; i++) {
    Engine.update(engine, delta);
    driveBullets();
}
const tTotal = hr() - tStart;

const total = Composite.allBodies(engine.world).length;
console.log('build:', buildPath, '| mode:', MODE, '| scene:', SCENE);
console.log('bodies:', total, '(static', built.staticCount, '+ dynamic', built.dynamicCount + ')',
    '| updates:', UPDATES);
console.log('total update time: ' + (tTotal / 1e6).toFixed(1) + ' ms  (' +
    (tTotal / UPDATES / 1e3).toFixed(2) + ' us/update)');

if (process.env.PHASES) {
    const rows = Object.keys(timers).map(k => ({
        name: k, ms: timers[k] / 1e6, pct: 100 * timers[k] / tTotal, calls: counts[k]
    }));
    rows.sort((a, b) => b.ms - a.ms);
    console.log('');
    for (const r of rows) {
        console.log(r.name.padEnd(28) + r.ms.toFixed(1).padStart(8) + ' ms' +
            (r.pct.toFixed(1) + '%').padStart(8) + ('calls=' + r.calls).padStart(16));
    }
}
