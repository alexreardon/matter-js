/* eslint-env node */
// In-process A/B of two source trees on the CHURN regime (sustained release,
// removal and re-materialisation), with a per-step equivalence check.
//
// The churn regime is where the fork's caches are invalidated every step, so it
// is both the regime worth optimising and the one where an incremental index
// can silently diverge from a full rebuild. Both arms drive identical scenes
// with identical churn operations, so any difference in body state is a bug in
// whichever arm changed.
//
// Usage:
//   node bench/ab-churn.js <baselineSrcMain> [steps] [workSrcMain]
//   RELEASE=<n>   statics released per step (default 8)
//   STATICS=<n>   static tile count         (default 5000)
//   CHECK=<n>     compare every n steps     (default 25)
//   BASE_OPTIONS / WORK_OPTIONS  engine options per arm, as JSON (see bench/lib/state.js)
"use strict";

const path = require('path');
const { addTiledBound, assertBoundsBucketed } = require('./lib/bounds');
const { readEngineOptions, keepsSolvedState, compareBodies, SOLVED_FIELDS_NOTE } = require('./lib/state');

const BASE_OPTIONS = readEngineOptions('BASE_OPTIONS');
const WORK_OPTIONS = readEngineOptions('WORK_OPTIONS');
const COMPARE_SOLVED = keepsSolvedState(BASE_OPTIONS) && keepsSolvedState(WORK_OPTIONS);

const baselinePath = process.argv[2];
const steps = Number(process.argv[3] || 600);
const workPath = process.argv[4] || path.join(__dirname, '..', 'src', 'module', 'main.js');

if (!baselinePath) {
    console.error('usage: node bench/ab-churn.js <baselineSrcMain> [steps] [workSrcMain]');
    process.exit(1);
}

const STATICS = Number(process.env.STATICS || 5000);
const RELEASE_PER_STEP = Number(process.env.RELEASE || 8);
const DEBRIS_LIFE = Number(process.env.DEBRIS_LIFE || 40);
const CHECK_EVERY = Number(process.env.CHECK || 25);
const WINDOW_PER_STEP = Number(process.env.WINDOW || 4);
const BLOCK = Number(process.env.BLOCK_UPDATES || 8);

const hr = () => Number(process.hrtime.bigint());
const cols = Math.round(Math.sqrt(STATICS * (2000 / 2300)));
const rows = Math.ceil(STATICS / cols);

function makeArm(buildPath, engineOptions) {
    // eslint-disable-next-line global-require
    const Matter = require(buildPath);
    const { Engine, Composite, Bodies, Body, Detector } = Matter;
    Detector._mode = process.env.MODE || 'gridStatic';

    const engine = Engine.create(Object.assign({ enableSleeping: false }, engineOptions));
    const world = engine.world;

    // floor + walls so debris piles instead of escaping, TILED so none of them
    // is an oversized static (see bench/lib/bounds.js for why that matters here)
    const bounds = [
        ...addTiledBound({ Matter, world, centreX: 1000, centreY: 2600, width: 2200, height: 60 }),
        ...addTiledBound({ Matter, world, centreX: -40, centreY: 1200, width: 60, height: 2600 }),
        ...addTiledBound({ Matter, world, centreX: 2040, centreY: 1200, width: 60, height: 2600 })
    ];

    const tiles = [];
    let staticCount = 0;
    for (let row = 0; row < rows && staticCount < STATICS; row++) {
        for (let col = 0; col < cols && staticCount < STATICS; col++) {
            // built dynamic then made static, so `_original` exists and a later
            // release restores a real mass and inertia (see bench/profile-churn.js)
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

    return { Matter, engine, world, bounds, tiles, live: [], parked: [], released: 0, frame: 0 };
}

// one shared deterministic stream, consumed identically by both arms
let seed = 24681;
const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

const base = makeArm(path.resolve(baselinePath), BASE_OPTIONS);
const work = makeArm(path.resolve(workPath), WORK_OPTIONS);

const order = base.tiles.map((_, index) => index);
for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
}

// churn decisions are drawn once and replayed into both arms, so the two worlds
// receive byte-identical instructions
function churnBoth() {
    const arms = [base, work];
    const releases = [];
    for (let k = 0; k < RELEASE_PER_STEP && base.released + k < order.length; k++) {
        releases.push({ index: order[base.released + k], vx: (rand() - 0.5) * 6, vy: 4 + rand() * 4 });
    }

    for (const arm of arms) {
        arm.frame++;
        for (const release of releases) {
            const tile = arm.tiles[release.index];
            arm.Matter.Body.setStatic(tile, false);
            arm.Matter.Body.setVelocity(tile, { x: release.vx, y: release.vy });
            arm.live.push({ body: tile, bornFrame: arm.frame });
        }
        arm.released += releases.length;
    }

    let evicted = 0;
    while (base.live.length > 0 && base.frame - base.live[0].bornFrame > DEBRIS_LIFE) {
        for (const arm of arms) {
            arm.Matter.Composite.remove(arm.world, arm.live.shift().body);
        }
        evicted++;
    }

    for (let k = 0; k < evicted; k++) {
        const x = 60 + rand() * 1880;
        const y = 40 + rand() * 2100;
        for (const arm of arms) {
            const replacement = arm.Matter.Bodies.rectangle(
                x, y, Math.max(10, 1960 / cols - 6), Math.max(8, 2200 / rows - 6)
            );
            arm.Matter.Body.setStatic(replacement, true);
            arm.Matter.Composite.add(arm.world, replacement);
            arm.tiles.push(replacement);
        }
        order.push(base.tiles.length - 1);
    }

    // windowing: take intact STATICS out of the world and put them back later.
    // This is the path a release cannot exercise, because a departed body is
    // invisible to any per-body flag, and the re-add case below lands a body
    // back in the world at a new place in the body array within a single step
    for (let k = 0; k < WINDOW_PER_STEP; k++) {
        const pick = Math.floor(rand() * base.tiles.length);
        const roundTrip = rand() < 0.5;

        for (const arm of arms) {
            const tile = arm.tiles[pick];
            if (!tile.isStatic) {
                continue;
            }
            arm.Matter.Composite.remove(arm.world, tile);
            if (roundTrip) {
                arm.Matter.Composite.add(arm.world, tile);
            } else {
                arm.parked.push(tile);
            }
        }
    }

    // re-materialise something parked earlier
    for (let k = 0; k < WINDOW_PER_STEP && base.parked.length > 0; k++) {
        const pick = Math.floor(rand() * base.parked.length);
        for (const arm of arms) {
            const tile = arm.parked[pick];
            arm.parked.splice(pick, 1);
            arm.Matter.Composite.add(arm.world, tile);
        }
    }
}

// every body field, NaN matching NaN (see bench/lib/state.js)
function compare(step) {
    const result = compareBodies({
        baseBodies: base.Matter.Composite.allBodies(base.world),
        workBodies: work.Matter.Composite.allBodies(work.world),
        compareSolved: COMPARE_SOLVED
    });

    return result.divergent === 0 ? null : `step ${step}: ${result.first}`;
}

const delta = 1000 / 60;
let divergence = null;

for (let i = 0; i < 120; i++) {
    churnBoth();
    base.Matter.Engine.update(base.engine, delta);
    work.Matter.Engine.update(work.engine, delta);
}

const baseBlocks = [];
const workBlocks = [];
let blockBase = 0;
let blockWork = 0;
let blockSteps = 0;

// one step ahead of the loop below, so the static index exists to be asserted
// against. Both arms, because the two builds can disagree about what is
// oversized and that is exactly the disagreement this would otherwise time
churnBoth();
base.Matter.Engine.update(base.engine, delta);
work.Matter.Engine.update(work.engine, delta);
assertBoundsBucketed({ Matter: base.Matter, engine: base.engine, bounds: base.bounds, label: 'ab-churn base' });
assertBoundsBucketed({ Matter: work.Matter, engine: work.engine, bounds: work.bounds, label: 'ab-churn work' });

for (let step = 0; step < steps; step++) {
    churnBoth();

    let t = hr();
    base.Matter.Engine.update(base.engine, delta);
    blockBase += hr() - t;

    t = hr();
    work.Matter.Engine.update(work.engine, delta);
    blockWork += hr() - t;

    if (++blockSteps === BLOCK) {
        baseBlocks.push(blockBase / BLOCK / 1e3);
        workBlocks.push(blockWork / BLOCK / 1e3);
        blockBase = 0;
        blockWork = 0;
        blockSteps = 0;
    }

    if (divergence === null && step % CHECK_EVERY === 0) {
        divergence = compare(step);
    }
}

if (divergence === null) {
    divergence = compare(steps);
}

const meanOfBest = (values, take) => {
    const sorted = values.slice().sort((a, b) => a - b).slice(0, take);
    return sorted.reduce((a, b) => a + b, 0) / sorted.length;
};

const takeBest = Math.max(3, Math.round(baseBlocks.length * 0.2));
const baseBest = meanOfBest(baseBlocks, takeBest);
const workBest = meanOfBest(workBlocks, takeBest);

console.log(`churn: ${STATICS} statics, ${RELEASE_PER_STEP} released/step, ${steps} steps`);
console.log(`  best-${takeBest}: base ${baseBest.toFixed(1)}us  work ${workBest.toFixed(1)}us  delta ${(100 * (workBest - baseBest) / baseBest).toFixed(2)}%`);
console.log(`  equivalence: ${divergence === null ? 'IDENTICAL' : 'DIVERGED -> ' + divergence}${COMPARE_SOLVED ? '' : ' (not compared: ' + SOLVED_FIELDS_NOTE + ')'}`);
