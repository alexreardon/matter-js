/* eslint-env node */
// In-process interleaved A/B of two source trees.
//
// Why this exists: `bench/ab-min.js` spawns a fresh process per measurement, so
// each sample carries process startup, a cold JIT and whatever else the machine
// was doing for that whole second. On a loaded machine that noise is larger than
// the deltas being hunted. Here both builds live in one process, each driving
// its own copy of the identical scene, and the two are timed in ALTERNATING
// short blocks. Interference then has to land inside a ~30ms window to bias one
// arm, and best-of-N over the blocks removes what does.
//
// It doubles as a determinism check: the two engines see identical scenes and
// identical inputs, so any divergence in final body state means the change under
// test is NOT bit-identical.
//
// Usage:
//   node bench/ab-inline.js <baselineSrcMain> [scene] [blocks] [workSrcMain]
//   MODE / STATICS / MOVERS / BULLETS as bench/profile-game.js
"use strict";

const path = require('path');

const baselinePath = process.argv[2];
const scene = process.argv[3] || 'calm';
const blocks = Number(process.argv[4] || 40);
const workPath = process.argv[5] || path.join(__dirname, '..', 'src', 'module', 'main.js');

if (!baselinePath) {
    console.error('usage: node bench/ab-inline.js <baselineSrcMain> [scene] [blocks] [workSrcMain]');
    process.exit(1);
}

const MODE = process.env.MODE || 'gridStatic';
const STATICS = Number(process.env.STATICS || 5000);
const MOVERS = Number(process.env.MOVERS || 300);
const BULLETS = Number(process.env.BULLETS || 8);
const BLOCK_UPDATES = Number(process.env.BLOCK_UPDATES || 40);

const hr = () => Number(process.hrtime.bigint());

// The gridStatic oversize predicate: a static spanning more than `maxCells` (24)
// cells of the broadphase grid is not bucketed at all. It goes on `sOver`, an
// unindexed list EVERY mover rescans every step, so three big bodies cost
// movers x 3 bounds tests a step forever.
//
// The real game holds ZERO oversized statics, so a floor and two walls built as
// single bodies put work in this harness that the shipped workload never pays.
// It is worse here than in a profiler: that cost scales with MOVERS, which is
// FIXED, so it dilutes a per-body delta more at low STATICS than at high, which
// manufactures a growing trend in a population sweep. Build the bounds as tiles,
// matching bench/profile-game.js.
const BOUND_CELL_SIZE = 32;
const BOUND_MAX_CELLS = 24;

function addBound(Matter, world, centreX, centreY, width, height) {
    const { Composite, Bodies } = Matter;
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
}

function buildScene(Matter) {
    const { Engine, Composite, Bodies, Body, Detector } = Matter;
    Detector._mode = MODE;

    // The piece size is baked against BOUND_CELL_SIZE so the scene stays
    // byte-stable across engine changes. If the engine's cell size moves, the
    // bake is wrong and the bounds go oversized again SILENTLY.
    if ((Detector._cellSize || 32) !== BOUND_CELL_SIZE) {
        throw new Error('bench bound tiling is baked for cellSize ' + BOUND_CELL_SIZE
            + ' but Detector._cellSize is ' + Detector._cellSize);
    }

    let seed = 24681;
    const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };

    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;

    // floor + walls so debris piles instead of escaping, TILED (see addBound)
    addBound(Matter, world, 1000, 2400, 2200, 60);
    addBound(Matter, world, -40, 1200, 60, 2600);
    addBound(Matter, world, 2040, 1200, 60, 2600);

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

    for (let i = 0; i < MOVERS; i++) {
        const w = 12 + rand() * 20;
        const h = 12 + rand() * 20;
        const spawnY = scene === 'settle' ? -40 - rand() * 900 : 2340 - (i % 8) * 26;
        const body = Bodies.rectangle(60 + rand() * 1880, spawnY, w, h, {
            friction: 0.4,
            restitution: 0.2
        });
        Body.setAngle(body, rand() * Math.PI);
        Composite.add(world, body);
    }

    const bullets = [];
    if (scene === 'firing') {
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

    return { Matter, engine, bullets };
}

function makeArm(buildPath) {
    // eslint-disable-next-line global-require
    const Matter = require(buildPath);
    const arm = buildScene(Matter);
    arm.step = function() {
        Matter.Engine.update(arm.engine, 1000 / 60);
        for (let i = 0; i < arm.bullets.length; i++) {
            const bullet = arm.bullets[i];
            if (bullet.position.x > 2100) {
                Matter.Body.setPosition(bullet, { x: -60, y: 120 + (i % 6) * 320 });
                Matter.Body.setVelocity(bullet, { x: 30, y: 0 });
            }
        }
    };
    return arm;
}

const base = makeArm(path.resolve(baselinePath));
const work = makeArm(path.resolve(workPath));

const warmup = scene === 'settle' ? 240 : 600;
for (let i = 0; i < warmup; i++) {
    base.step();
    work.step();
}

const baseBlocks = [];
const workBlocks = [];

function timeBlock(arm) {
    const start = hr();
    for (let i = 0; i < BLOCK_UPDATES; i++) {
        arm.step();
    }
    return (hr() - start) / BLOCK_UPDATES / 1e3;
}

for (let block = 0; block < blocks; block++) {
    // alternate the leading arm so neither one always pays for a cold cache
    if (block % 2 === 0) {
        baseBlocks.push(timeBlock(base));
        workBlocks.push(timeBlock(work));
    } else {
        workBlocks.push(timeBlock(work));
        baseBlocks.push(timeBlock(base));
    }
}

const min = values => values.reduce((a, b) => (b < a ? b : a));
const median = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};
const meanOfBest = (values, take) => {
    const sorted = values.slice().sort((a, b) => a - b).slice(0, take);
    return sorted.reduce((a, b) => a + b, 0) / sorted.length;
};

// determinism: identical scenes driven by identical inputs must end identical
const baseBodies = base.Matter.Composite.allBodies(base.engine.world);
const workBodies = work.Matter.Composite.allBodies(work.engine.world);
let divergent = 0;
let maxDelta = 0;
for (let i = 0; i < baseBodies.length; i++) {
    const a = baseBodies[i];
    const b = workBodies[i];
    const dx = Math.abs(a.position.x - b.position.x);
    const dy = Math.abs(a.position.y - b.position.y);
    const da = Math.abs(a.angle - b.angle);
    const delta = Math.max(dx, dy, da);
    if (delta !== 0) {
        divergent++;
        if (delta > maxDelta) {
            maxDelta = delta;
        }
    }
}

const takeBest = Math.max(3, Math.round(blocks * 0.2));
const baseBest = meanOfBest(baseBlocks, takeBest);
const workBest = meanOfBest(workBlocks, takeBest);

console.log(`scene=${scene} mode=${MODE} bodies=${baseBodies.length} blocks=${blocks}x${BLOCK_UPDATES} updates`);
console.log(`  best      : base ${min(baseBlocks).toFixed(1)}us  work ${min(workBlocks).toFixed(1)}us  delta ${(100 * (min(workBlocks) - min(baseBlocks)) / min(baseBlocks)).toFixed(2)}%`);
console.log(`  best-${String(takeBest).padEnd(3)}: base ${baseBest.toFixed(1)}us  work ${workBest.toFixed(1)}us  delta ${(100 * (workBest - baseBest) / baseBest).toFixed(2)}%`);
console.log(`  median    : base ${median(baseBlocks).toFixed(1)}us  work ${median(workBlocks).toFixed(1)}us  delta ${(100 * (median(workBlocks) - median(baseBlocks)) / median(baseBlocks)).toFixed(2)}%`);
console.log(`  determinism: ${divergent === 0 ? 'IDENTICAL' : 'DIVERGED on ' + divergent + '/' + baseBodies.length + ' bodies, max ' + maxDelta.toExponential(3)}`);
