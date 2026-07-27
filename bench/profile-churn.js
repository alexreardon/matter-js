/* eslint-env node */
// Churn-regime profiler: the page-destroyer workload with SUSTAINED membership
// change, which `bench/profile-game.js` deliberately does not have.
//
// Why it matters: every cache in the fork (Composite's allBodies array, the
// detector's body slice, its mover classification, its persistent static index,
// each mover's static-candidate list) is keyed on "the body set did not change".
// A calm or settling page holds all of them. A page being DESTROYED does not: it
// releases statics into debris and removes debris that left the field, every
// frame, for as long as the player keeps firing. That is the regime the game
// actually spends its expensive frames in, so it is the one to profile before
// concluding the fork is at its limit.
//
// Usage:
//   node bench/profile-churn.js [buildPath]
//   PHASES=1        per-phase timers
//   RELEASE=<n>     statics released per frame  (default 12)
//   STATICS=<n>     static tile count           (default 5000)
//   UPDATES=<n>     measured frames            (default 900)
"use strict";

const buildPath = process.argv[2] || '../src/module/main.js';
const Matter = require(buildPath);
const { Engine, Composite, Bodies, Body, Detector, Pairs, Resolver, Collision } = Matter;

const MODE = process.env.MODE || 'gridStatic';
const STATICS = Number(process.env.STATICS || 5000);
const RELEASE_PER_FRAME = Number(process.env.RELEASE || 12);
const UPDATES = Number(process.env.UPDATES || 900);
const DEBRIS_LIFE = Number(process.env.DEBRIS_LIFE || 40);

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
    wrap(Detector, 'setBodies', 'Detector.setBodies');
    wrap(Pairs, 'update', 'Pairs.update');
    wrap(Resolver, 'preSolvePosition', 'Resolver.preSolvePosition');
    wrap(Resolver, 'solvePosition', 'Resolver.solvePosition');
    wrap(Resolver, 'postSolvePosition', 'Resolver.postSolvePosition');
    wrap(Resolver, 'preSolveVelocity', 'Resolver.preSolveVelocity');
    wrap(Resolver, 'solveVelocity', 'Resolver.solveVelocity');
    wrap(Collision, 'collides', 'Collision.collides');
    wrap(Composite, 'allBodies', 'Composite.allBodies');
    wrap(Engine, '_bodiesUpdate', 'Engine.bodiesUpdate');
}

let seed = 24681;
const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

const engine = Engine.create({ enableSleeping: false });
const world = engine.world;

Composite.add(world, Bodies.rectangle(1000, 2600, 2200, 60, { isStatic: true }));
Composite.add(world, Bodies.rectangle(-40, 1200, 60, 2600, { isStatic: true }));
Composite.add(world, Bodies.rectangle(2040, 1200, 60, 2600, { isStatic: true }));

const tiles = [];
const cols = Math.round(Math.sqrt(STATICS * (2000 / 2300)));
const rows = Math.ceil(STATICS / cols);
let staticCount = 0;
for (let row = 0; row < rows && staticCount < STATICS; row++) {
    for (let col = 0; col < cols && staticCount < STATICS; col++) {
        // built DYNAMIC and then made static, not born static. `Body.setStatic`
        // only captures the mass/inertia it has to restore (`_original`) on the
        // dynamic -> static transition, so a body born static releases into a
        // body with infinite mass and NaN inertia, and the whole scene silently
        // degenerates. A destructible page tile is a body that can be released,
        // so this is also the truthful model of one.
        const tile = Bodies.rectangle(
            30 + col * (1960 / cols), 30 + row * (2200 / rows),
            Math.max(10, 1960 / cols - 6), Math.max(8, 2200 / rows - 6)
        );
        Body.setStatic(tile, true);
        Composite.add(world, tile);
        tiles.push(tile);
        staticCount++;
    }
}

// deterministic release order
const order = tiles.map((_, index) => index);
for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
}

let releasedIndex = 0;
let frame = 0;
const live = [];

// one frame of the game's destruction loop, and the whole point of this bench:
// release a few statics into debris, remove the debris that has left the field,
// and materialise replacement statics. Together those are the three signals
// that invalidate the fork's caches (static epoch, composite membership), so
// every frame here pays the rebuild costs a calm frame never pays.
function churn() {
    frame++;

    for (let k = 0; k < RELEASE_PER_FRAME && releasedIndex < order.length; k++) {
        const tile = tiles[order[releasedIndex++]];
        Body.setStatic(tile, false);
        Body.setVelocity(tile, { x: (rand() - 0.5) * 6, y: 4 + rand() * 4 });
        live.push({ body: tile, bornFrame: frame });
    }

    // evict by age, not by position: a released tile in a dense page usually
    // comes to rest on the tiles below it rather than falling off the field, so
    // a height cut-off never fires and the mover population runs away. The game
    // bounds its debris the same way (furthest-first eviction under load), and
    // an age rule gives a steady population of RELEASE_PER_FRAME * DEBRIS_LIFE
    let evicted = 0;
    while (live.length > 0 && frame - live[0].bornFrame > DEBRIS_LIFE) {
        Composite.remove(world, live.shift().body);
        evicted++;
    }

    // top the page back up, the way viewport windowing materialises new statics
    // as the camera moves. Keeps the static field (and so the static index) at a
    // steady size instead of draining away over the run
    for (let k = 0; k < evicted; k++) {
        const replacement = Bodies.rectangle(
            60 + rand() * 1880, 40 + rand() * 2100,
            Math.max(10, 1960 / cols - 6), Math.max(8, 2200 / rows - 6)
        );
        Body.setStatic(replacement, true);
        Composite.add(world, replacement);
        tiles.push(replacement);
        order.push(tiles.length - 1);
    }
}

const delta = 1000 / 60;

for (let i = 0; i < 120; i++) {
    churn();
    Engine.update(engine, delta);
}

for (const key of Object.keys(timers)) {
    timers[key] = 0;
    counts[key] = 0;
}

let totalEngine = 0;
const start = hr();
for (let i = 0; i < UPDATES; i++) {
    churn();
    const t = hr();
    Engine.update(engine, delta);
    totalEngine += hr() - t;
}
const wall = hr() - start;

const bodies = Composite.allBodies(world);
let movers = 0;
for (let i = 0; i < bodies.length; i++) {
    if (!bodies[i].isStatic) {
        movers++;
    }
}

console.log('build:', buildPath, '| mode:', MODE, '| scene: churn | release/frame:', RELEASE_PER_FRAME);
console.log('bodies:', bodies.length, '(movers', movers + ')', '| released:', releasedIndex, '| updates:', UPDATES);
console.log('total update time: ' + (totalEngine / 1e6).toFixed(1) + ' ms  (' +
    (totalEngine / UPDATES / 1e3).toFixed(2) + ' us/update)');
console.log('wall incl. churn: ' + (wall / 1e6).toFixed(1) + ' ms');

if (process.env.PHASES) {
    const rows2 = Object.keys(timers).map(key => ({
        name: key, ms: timers[key] / 1e6, pct: 100 * timers[key] / totalEngine, calls: counts[key]
    }));
    rows2.sort((a, b) => b.ms - a.ms);
    console.log('');
    for (const row of rows2) {
        console.log(row.name.padEnd(28) + row.ms.toFixed(1).padStart(8) + ' ms' +
            (row.pct.toFixed(1) + '%').padStart(8) + ('calls=' + row.calls).padStart(16));
    }
}
