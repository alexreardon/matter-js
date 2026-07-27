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
"use strict";

const path = require('path');

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

function makeArm(buildPath) {
    // eslint-disable-next-line global-require
    const Matter = require(buildPath);
    const { Engine, Composite, Bodies, Body, Detector } = Matter;
    Detector._mode = process.env.MODE || 'gridStatic';

    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;

    Composite.add(world, Bodies.rectangle(1000, 2600, 2200, 60, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(-40, 1200, 60, 2600, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(2040, 1200, 60, 2600, { isStatic: true }));

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

    return { Matter, engine, world, tiles, live: [], parked: [], released: 0, frame: 0 };
}

// one shared deterministic stream, consumed identically by both arms
let seed = 24681;
const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

const base = makeArm(path.resolve(baselinePath));
const work = makeArm(path.resolve(workPath));

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

// bit equality, but NaN matching NaN counts as equal: a tile released flush
// against its neighbours can blow up in this synthetic scene, and what is being
// tested is whether the two arms agree, not whether the scene is well behaved
const same = (x, y) => x === y || (x !== x && y !== y);

function compare(step) {
    const baseBodies = base.Matter.Composite.allBodies(base.world);
    const workBodies = work.Matter.Composite.allBodies(work.world);

    if (baseBodies.length !== workBodies.length) {
        return `step ${step}: body count ${baseBodies.length} vs ${workBodies.length}`;
    }

    for (let i = 0; i < baseBodies.length; i++) {
        const a = baseBodies[i];
        const b = workBodies[i];
        if (!same(a.position.x, b.position.x) || !same(a.position.y, b.position.y) || !same(a.angle, b.angle)) {
            return `step ${step}: body ${i} (id ${a.id}/${b.id}) `
                + `pos ${a.position.x},${a.position.y} vs ${b.position.x},${b.position.y} `
                + `angle ${a.angle} vs ${b.angle}`;
        }
    }

    return null;
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
console.log(`  equivalence: ${divergence === null ? 'IDENTICAL' : 'DIVERGED -> ' + divergence}`);
