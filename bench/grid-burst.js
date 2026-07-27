/* eslint-env node */
// Burst regime: a dense static field where bodies RELEASE (static -> dynamic)
// over time, like a destruction burst, with eviction of off-field debris (as
// the game does). This exercises v2's static-index REBUILD cost on
// membership-change frames, which the steady-state A/B never triggers.
//
//   MODE=sweep|gridStatic   (default gridStatic)   CELL=48
// Run each mode in its own process for a clean A/B.
"use strict";

const Matter = require('../src/module/main.js');
const { Engine, Composite, Bodies, Body, Detector } = Matter;
const hr = () => Number(process.hrtime.bigint());

const MODE = process.env.MODE || 'gridStatic';
const CELL = process.env.CELL != null ? Number(process.env.CELL) : 48;
const BURST_FRAMES = 40;
const PER_FRAME_RELEASE = 30;
const TOTAL_FRAMES = 150;
const EVICT_BELOW_Y = 1400;

function build() {
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;
    const tiles = [];
    for (let r = 0; r < 70; r++) {
        for (let c = 0; c < 80; c++) {
            // built DYNAMIC and then made static, NOT born static. Body.setStatic
            // only captures the mass and inertia it has to restore (`_original`)
            // on the dynamic -> static transition, so releasing a born-static
            // body leaves mass at Infinity, the solver divides by a zero inverse
            // mass, and every released tile goes NaN within a few steps. This
            // bench did exactly that until 2026-07-27: all 1200 released bodies
            // were NaN, they were bucketed into no cells (a NaN cell span
            // iterates zero times) so they generated no candidates, and the
            // eviction below never fired because NaN fails every comparison.
            const b = Bodies.rectangle(20 + c * 16, 20 + r * 16, 15, 15);
            Body.setStatic(b, true);
            Composite.add(world, b);
            tiles.push(b);
        }
    }
    return { engine, tiles };
}

function shuffledIndices(length) {
    let seed = 42;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const a = Array.from({ length }, (_, i) => i);
    for (let i = length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

const { engine, tiles } = build();
const world = engine.world;
Detector._mode = MODE;
Detector._cellSize = CELL;
const order = shuffledIndices(tiles.length);
const delta = 1000 / 60;
for (let i = 0; i < 60; i++) Engine.update(engine, delta);

const perFrame = [];
let released = 0;
let maxBodies = 0;
for (let f = 0; f < TOTAL_FRAMES; f++) {
    if (f < BURST_FRAMES) {
        for (let k = 0; k < PER_FRAME_RELEASE && released < order.length; k++) {
            const b = tiles[order[released++]];
            Matter.Body.setStatic(b, false);
            Body.setVelocity(b, { x: 0, y: 6 });
        }
    }
    // evict debris that has fallen below the field (mimics the game's off-doc pass)
    const all = Composite.allBodies(world);
    for (let i = 0; i < all.length; i++) {
        if (!all[i].isStatic && all[i].position.y > EVICT_BELOW_Y) {
            Composite.remove(world, all[i]);
        }
    }
    maxBodies = Math.max(maxBodies, Composite.allBodies(world).length);
    const t = hr();
    Engine.update(engine, delta);
    perFrame.push((hr() - t) / 1e3);
}

// Guard, because this bench shipped for months measuring a scene whose every
// released body was NaN, and nothing in its output said so. A non-finite body
// is bucketed into no cells and collides with nothing, so the numbers look
// plausible while measuring almost none of the intended work.
let nonFinite = 0;
let liveMovers = 0;
const finalBodies = Composite.allBodies(world);
for (let i = 0; i < finalBodies.length; i++) {
    const body = finalBodies[i];
    if (body.isStatic) {
        continue;
    }
    liveMovers++;
    if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y)) {
        nonFinite++;
    }
}
if (nonFinite > 0) {
    console.error(`FAIL: ${nonFinite}/${liveMovers} movers are non-finite; these timings are meaningless`);
    process.exitCode = 1;
}

function stats(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    const sum = arr.reduce((a, b) => a + b, 0);
    return { avg: sum / arr.length, max: s[s.length - 1] };
}

function phase(lo, hi) { return stats(perFrame.slice(lo, hi)); }
const burst = phase(0, BURST_FRAMES);
const settle = phase(BURST_FRAMES, TOTAL_FRAMES);
const overall = phase(0, TOTAL_FRAMES);
console.log(
    `mode=${MODE} cell=${CELL} released=${released} maxBodies=${maxBodies} liveMovers=${liveMovers} nonFinite=${nonFinite}\n` +
    `  burst  (0-${BURST_FRAMES})   avg ${burst.avg.toFixed(0).padStart(4)} us  max ${burst.max.toFixed(0).padStart(4)} us\n` +
    `  settle (${BURST_FRAMES}-${TOTAL_FRAMES}) avg ${settle.avg.toFixed(0).padStart(4)} us  max ${settle.max.toFixed(0).padStart(4)} us\n` +
    `  overall          avg ${overall.avg.toFixed(0).padStart(4)} us  max ${overall.max.toFixed(0).padStart(4)} us`
);
