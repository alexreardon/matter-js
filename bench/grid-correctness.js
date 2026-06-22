/* eslint-env node */
// Correctness gate: the grid broadphase must detect the IDENTICAL SET of
// colliding body pairs as the sweep, every step, across varied evolving scenes
// and cell sizes. Both feed the same narrowphase, so any difference is a grid
// bug (a missed or extra candidate). Emission ORDER may differ (re-baseline);
// only the SET is checked here.
"use strict";

const Matter = require('../src/module/main.js');
const { Engine, Composite, Bodies, Body, Detector, Pairs } = Matter;

let seed = 1234567;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const W = 1280, H = 860;

function walls(world) {
    Composite.add(world, [
        Bodies.rectangle(W / 2, H + 30, W + 200, 60, { isStatic: true }),
        Bodies.rectangle(W / 2, -30, W + 200, 60, { isStatic: true }),
        Bodies.rectangle(-30, H / 2, 60, H + 200, { isStatic: true }),
        Bodies.rectangle(W + 30, H / 2, 60, H + 200, { isStatic: true })
    ]);
}

// dense filled tile field + fast bouncing bullets (wide swept AABBs)
function sceneDenseBullets(world) {
    for (let r = 0; r < 60; r++) {
        for (let c = 0; c < 80; c++) {
            Composite.add(world, Bodies.rectangle(20 + c * 16, 20 + r * 14, 15, 13, { isStatic: true }));
        }
    }
    for (let i = 0; i < 12; i++) {
        const b = Bodies.rectangle(100 + rand() * 1000, 100 + rand() * 600, 10, 6, { friction: 0, frictionAir: 0, restitution: 1, density: 0.01 });
        Body.setVelocity(b, { x: (rand() < 0.5 ? -1 : 1) * 30, y: (rand() - 0.5) * 24 });
        Composite.add(world, b);
    }
}

// varied static sizes including big (oversized overflow) + many falling dynamics
function sceneFallingMixed(world) {
    for (let i = 0; i < 400; i++) {
        const big = rand() < 0.1;
        Composite.add(world, Bodies.rectangle(
            40 + rand() * (W - 80), 40 + rand() * 700,
            big ? 160 + rand() * 120 : 20 + rand() * 120,
            big ? 120 + rand() * 120 : 14 + rand() * 10,
            { isStatic: true }
        ));
    }
    for (let i = 0; i < 150; i++) {
        const b = Bodies.rectangle(40 + rand() * (W - 80), -20 - rand() * 500, 14 + rand() * 26, 14 + rand() * 26, { friction: 0.3, restitution: 0.4 });
        Body.setAngle(b, rand() * Math.PI);
        Composite.add(world, b);
    }
}

// tall stacks to exercise resting contacts and settling
function scenePileStack(world) {
    for (let c = 0; c < 40; c++) {
        for (let r = 0; r < 20; r++) {
            Composite.add(world, Bodies.rectangle(60 + c * 30, H - 40 - r * 22, 26, 20, { isStatic: r === 0 }));
        }
    }
}

// collides() normalizes the record so bodyA.id < bodyB.id
function pairKey(c) { return c.bodyA.id + '-' + c.bodyB.id; }

function setOf(cols) {
    const set = new Set();
    for (let k = 0; k < cols.length; k++) set.add(pairKey(cols[k]));
    return set;
}

function run(name, build, steps, cell, implName, impl, mutate) {
    seed = 1234567;
    Detector._cellSize = cell;
    // advance the reference simulation via the sweep, independent of whatever
    // Detector._mode default is set; the impls are compared by direct call
    Detector._mode = 'sweep';
    const engine = Engine.create({ enableSleeping: false });
    walls(engine.world);
    build(engine.world);
    const delta = 1000 / 60;
    // persistent throwaway detectors (mirrors the real engine: one detector,
    // so the grid's visited-stamp counter increases monotonically and never
    // recycles into stale per-body stamps)
    const sweepDet = { bodies: [], pairs: Pairs.create(), collisions: [] };
    const gridDet = { bodies: [], pairs: Pairs.create(), collisions: [] };
    let maxMiss = 0, maxExtra = 0, firstBadStep = -1, totalChecked = 0;
    const samples = [];
    for (let s = 0; s < steps; s++) {
        if (mutate) mutate(engine.world, s);
        Engine.update(engine, delta);
        const bodies = Composite.allBodies(engine.world);
        sweepDet.bodies = bodies.slice(0);
        gridDet.bodies = bodies.slice(0);
        const sweep = setOf(Detector._collisionsSweep(sweepDet));
        const grid = setOf(impl(gridDet));
        let miss = 0, extra = 0;
        for (const k of sweep) if (!grid.has(k)) { miss++; if (samples.length < 6) samples.push('miss ' + k); }
        for (const k of grid) if (!sweep.has(k)) { extra++; if (samples.length < 6) samples.push('extra ' + k); }
        totalChecked += sweep.size;
        if ((miss || extra) && firstBadStep < 0) firstBadStep = s;
        maxMiss = Math.max(maxMiss, miss);
        maxExtra = Math.max(maxExtra, extra);
    }
    const ok = maxMiss === 0 && maxExtra === 0;
    console.log(
        `${ok ? 'PASS' : 'FAIL'} ${implName.padEnd(10)} ${name.padEnd(13)} cell=${String(cell).padStart(2)} steps=${steps} | ` +
        `checkedPairs~${totalChecked} maxMiss=${maxMiss} maxExtra=${maxExtra}` +
        (firstBadStep >= 0 ? ` firstBadStep=${firstBadStep} [${samples.slice(0, 6).join(', ')}]` : '')
    );
    return ok;
}

// static REMOVAL case (mimics windowing dropping off-screen statics): a static
// field that shrinks during the run, plus movers colliding against it. Without
// the static-count guard gridStatic would hold stale index entries for removed
// bodies; with it, it must still match the sweep.
function makeRemovalCase() {
    const statics = [];
    let removed = 0;
    const build = (world) => {
        for (let r = 0; r < 40; r++) {
            for (let c = 0; c < 40; c++) {
                const b = Bodies.rectangle(40 + c * 18, 40 + r * 16, 15, 14, { isStatic: true });
                Composite.add(world, b);
                statics.push(b);
            }
        }
        for (let i = 0; i < 20; i++) {
            const b = Bodies.rectangle(100 + rand() * 600, 100 + rand() * 400, 12, 8, { friction: 0, frictionAir: 0, restitution: 1 });
            Body.setVelocity(b, { x: (rand() < 0.5 ? -1 : 1) * 26, y: (rand() - 0.5) * 20 });
            Composite.add(world, b);
        }
    };
    const mutate = (world) => {
        for (let k = 0; k < 3 && removed < statics.length; k++) {
            Composite.remove(world, statics[removed++]);
        }
    };
    return { build, mutate };
}

// moving-static (inner-scroll) case: a body that is isStatic but MOVES each
// frame (like a destructible inside a scrolling container repositioned by
// syncScrollSurfaces). Tagged `_gridDynamic` so v2 treats it as a mover and it
// never goes stale in the static index. It sweeps through the fixed page (must
// skip static-static) and the falling debris (must detect).
function makeMovingStaticCase() {
    let bar = null;
    let t = 0;
    const build = (world) => {
        for (let r = 0; r < 25; r++) {
            for (let c = 0; c < 40; c++) {
                Composite.add(world, Bodies.rectangle(40 + c * 18, 40 + r * 16, 15, 14, { isStatic: true }));
            }
        }
        bar = Bodies.rectangle(400, 560, 280, 18, { isStatic: true });
        bar._gridDynamic = true;
        Composite.add(world, bar);
        for (let i = 0; i < 40; i++) {
            Composite.add(world, Bodies.rectangle(280 + rand() * 360, 350 + rand() * 150, 13, 13, { friction: 0.3, restitution: 0.2 }));
        }
    };
    const mutate = () => {
        t++;
        Body.setPosition(bar, { x: 400 + Math.sin(t * 0.12) * 180, y: 560 + Math.cos(t * 0.1) * 60 });
    };
    return { build, mutate };
}

const impls = [
    ['grid', Detector._collisionsGrid],
    ['gridStatic', Detector._collisionsGridStatic]
];
let allOk = true;
for (const [implName, impl] of impls) {
    for (const cell of [16, 24, 32, 48, 64]) {
        allOk = run('denseBullets', sceneDenseBullets, 400, cell, implName, impl) && allOk;
        allOk = run('fallingMixed', sceneFallingMixed, 500, cell, implName, impl) && allOk;
        allOk = run('pileStack', scenePileStack, 400, cell, implName, impl) && allOk;
        const removal = makeRemovalCase();
        allOk = run('removeStatics', removal.build, 300, cell, implName, impl, removal.mutate) && allOk;
        const moving = makeMovingStaticCase();
        allOk = run('movingStatic', moving.build, 300, cell, implName, impl, moving.mutate) && allOk;
    }
}
console.log(allOk ? '\nALL SCENES IDENTICAL ✓' : '\nDIVERGENCE DETECTED ✗');
process.exit(allOk ? 0 : 1);
