/* eslint-env node */
// Static-heavy workload profiler, mirroring page-destroyer: a large grid of
// STATIC bodies (the intact page) plus a smaller set of dynamic debris that
// falls and settles into resting piles. This is the regime where the
// resting-body step-pass skips pay off, which the dynamic-heavy stress
// examples and bench/profile.js do not exercise.
// Usage: node bench/profile-static.js [buildPath]
"use strict";

const buildPath = process.argv[2] || '../build/matter.js';
const Matter = require(buildPath);
const { Engine, Composite, Bodies, Body, Detector, Pairs, Resolver, Collision } = Matter;

const hr = () => Number(process.hrtime.bigint());

// opt-in cumulative phase timers (PHASES=1), mirroring bench/profile.js
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
    wrap(Resolver, 'solvePosition', 'Resolver.solvePosition');
    wrap(Resolver, 'solveVelocity', 'Resolver.solveVelocity');
    wrap(Resolver, 'preSolveVelocity', 'Resolver.preSolveVelocity');
    wrap(Collision, 'collides', 'Collision.collides');
    wrap(Body, 'update', 'Body.update');
}

// count how often the per-body velocity recompute actually runs (opt-in, as
// the wrapper itself adds per-call overhead that would skew the timing)
let updateVelocitiesCalls = -1;
if (process.env.COUNT) {
    updateVelocitiesCalls = 0;
    const origUpdateVelocities = Body.updateVelocities;
    Body.updateVelocities = function() {
        updateVelocitiesCalls++;
        return origUpdateVelocities.apply(this, arguments);
    };
}

let seed = 24681;
const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

function buildScene() {
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;

    // floor
    Composite.add(world, Bodies.rectangle(600, 910, 1300, 60, { isStatic: true }));

    // the "page": a dense grid of STATIC tiles, like intact destructibles
    var staticCount = 0;
    for (var row = 0; row < 18; row++) {
        for (var col = 0; col < 30; col++) {
            Composite.add(world, Bodies.rectangle(
                40 + col * 40, 40 + row * 32, 36, 28,
                { isStatic: true }
            ));
            staticCount++;
        }
    }

    // dynamic debris raining down onto the static page + each other
    var dynamicCount = 0;
    for (var i = 0; i < 320; i++) {
        var w = 16 + rand() * 22;
        var h = 16 + rand() * 22;
        var b = Bodies.rectangle(60 + rand() * 1080, -40 - rand() * 600, w, h, {
            friction: 0.4,
            restitution: 0.2
        });
        Body.setAngle(b, rand() * Math.PI);
        Composite.add(world, b);
        dynamicCount++;
    }

    return { engine: engine, staticCount: staticCount, dynamicCount: dynamicCount };
}

const built = buildScene();
const engine = built.engine;
const delta = 1000 / 60;
const warmup = 240;
const updates = 1500;

for (let i = 0; i < warmup; i++) Engine.update(engine, delta);
if (process.env.COUNT) updateVelocitiesCalls = 0;

const tStart = hr();
for (let i = 0; i < updates; i++) {
    Engine.update(engine, delta);
}
const tTotal = hr() - tStart;

const total = Composite.allBodies(engine.world).length;
console.log('build:', buildPath);
console.log('bodies:', total, '(static', built.staticCount + 1, '+ dynamic', built.dynamicCount + ')',
    '| updates:', updates);
console.log('total update time: ' + (tTotal / 1e6).toFixed(1) + ' ms  (' +
    (tTotal / updates / 1e3).toFixed(2) + ' us/update)');
if (updateVelocitiesCalls >= 0) {
    console.log('Body.updateVelocities calls: ' + updateVelocitiesCalls +
        '  (' + (updateVelocitiesCalls / updates).toFixed(0) + '/update of ' + total + ' bodies)');
}

if (process.env.PHASES) {
    const rows = Object.keys(timers).map(k => ({
        name: k, ms: timers[k] / 1e6, pct: 100 * timers[k] / tTotal, calls: counts[k]
    }));
    rows.sort((a, b) => b.ms - a.ms);
    console.log('');
    for (const r of rows) {
        console.log(r.name.padEnd(26) + r.ms.toFixed(1).padStart(8) + ' ms' +
            (r.pct.toFixed(1) + '%').padStart(8) + ('calls=' + r.calls).padStart(16));
    }
}
