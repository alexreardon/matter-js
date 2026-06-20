/* eslint-env node */
// Phase-breakdown profiler for Engine.update, mirroring a page-destroyer-like
// workload: many rectangles + some circles under gravity, no sleeping, no
// constraints. Wraps hot functions with cumulative timers to show where time
// goes. Usage: node bench/profile.js [buildPath]
"use strict";

const buildPath = process.argv[2] || '../build/matter.js';
const Matter = require(buildPath);
const { Engine, Composite, Bodies, Body, Detector, Pairs, Resolver, Collision } = Matter;

const hr = () => Number(process.hrtime.bigint());

// cumulative nanosecond timers
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

wrap(Detector, 'collisions', 'Detector.collisions');
wrap(Pairs, 'update', 'Pairs.update');
wrap(Resolver, 'solvePosition', 'Resolver.solvePosition');
wrap(Resolver, 'solveVelocity', 'Resolver.solveVelocity');
wrap(Resolver, 'preSolvePosition', 'Resolver.preSolvePosition');
wrap(Resolver, 'postSolvePosition', 'Resolver.postSolvePosition');
wrap(Resolver, 'preSolveVelocity', 'Resolver.preSolveVelocity');
wrap(Collision, 'collides', 'Collision.collides');
wrap(Body, 'update', 'Body.update');

// deterministic PRNG so runs are comparable
let seed = 12345;
const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

function buildScene() {
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;

    // ground + walls (static rectangles)
    Composite.add(world, [
        Bodies.rectangle(400, 610, 1200, 60, { isStatic: true }),
        Bodies.rectangle(-10, 300, 60, 700, { isStatic: true }),
        Bodies.rectangle(810, 300, 60, 700, { isStatic: true })
    ]);

    // a big pile of dynamic rectangles (destructibles)
    for (let i = 0; i < 350; i++) {
        const w = 18 + rand() * 26;
        const h = 18 + rand() * 26;
        const x = 60 + rand() * 680;
        const y = rand() * 500;
        const b = Bodies.rectangle(x, y, w, h, { friction: 0.4, restitution: 0.2 });
        Body.setAngle(b, rand() * Math.PI);
        Composite.add(world, b);
    }

    // some fast circles (projectiles)
    for (let i = 0; i < 30; i++) {
        const c = Bodies.circle(60 + rand() * 680, rand() * 400, 6 + rand() * 6);
        Body.setVelocity(c, { x: (rand() - 0.5) * 20, y: rand() * 10 });
        Composite.add(world, c);
    }

    return engine;
}

const engine = buildScene();
const delta = 1000 / 60;
const warmup = 120;
const updates = 1500;

for (let i = 0; i < warmup; i++) Engine.update(engine, delta);
for (const k in timers) { timers[k] = 0; counts[k] = 0; }

const tStart = hr();
for (let i = 0; i < updates; i++) {
    Engine.update(engine, delta);
}
const tTotal = hr() - tStart;

console.log('build:', buildPath);
console.log('bodies:', Composite.allBodies(engine.world).length, '| updates:', updates);
console.log('total update time: ' + (tTotal / 1e6).toFixed(1) + ' ms  (' + (tTotal / updates / 1e3).toFixed(1) + ' us/update)\n');

const rows = Object.keys(timers).map(k => ({
    name: k,
    ms: timers[k] / 1e6,
    pct: 100 * timers[k] / tTotal,
    calls: counts[k],
    usPerCall: timers[k] / 1e3 / (counts[k] || 1)
}));
rows.sort((a, b) => b.ms - a.ms);
for (const r of rows) {
    console.log(
        r.name.padEnd(28) +
        r.ms.toFixed(1).padStart(8) + ' ms' +
        (r.pct.toFixed(1) + '%').padStart(8) +
        ('calls=' + r.calls).padStart(16) +
        (r.usPerCall.toFixed(3) + ' us/call').padStart(20)
    );
}
