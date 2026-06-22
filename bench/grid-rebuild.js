/* eslint-env node */
// Isolates the static-index REBUILD cost. A v2 frame where static membership
// changes (a release) rebuilds the static index; this measures that frame's
// broadphase cost vs a cached v2 frame and vs the sweep, on a dense field with
// no physics churn (positions frozen).
"use strict";

const Matter = require('../src/module/main.js');
const { Engine, Composite, Bodies, Detector, Pairs } = Matter;
const hr = () => Number(process.hrtime.bigint());

const engine = Engine.create({ enableSleeping: false });
const world = engine.world;
const tiles = [];
for (let r = 0; r < 70; r++) {
    for (let c = 0; c < 80; c++) {
        const b = Bodies.rectangle(20 + c * 16, 20 + r * 16, 15, 15, { isStatic: true });
        Composite.add(world, b);
        tiles.push(b);
    }
}
const CELL = process.env.CELL != null ? Number(process.env.CELL) : 48;
Detector._cellSize = CELL;
const det = { bodies: Composite.allBodies(world).slice(0), pairs: Pairs.create(), collisions: [] };

function timeCall() { const t = hr(); Detector.collisions(det); return (hr() - t) / 1e3; }
function median(a) { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

// cached v2 (static index built once, no transitions)
Detector._mode = 'gridStatic';
for (let i = 0; i < 30; i++) timeCall();
const cached = [];
for (let i = 0; i < 80; i++) cached.push(timeCall());

// rebuild-every-call v2: flip one body's static flag each call to force the
// staticDirty path (then restore, untimed)
const rebuild = [];
for (let i = 0; i < 80; i++) {
    const b = tiles[i % tiles.length];
    b.isStatic = false;
    rebuild.push(timeCall());
    b.isStatic = true;
    timeCall();
}

// sweep baseline
Detector._mode = 'sweep';
for (let i = 0; i < 30; i++) timeCall();
const sweep = [];
for (let i = 0; i < 80; i++) sweep.push(timeCall());

const c = median(cached), r = median(rebuild), s = median(sweep);
console.log(`dense ${tiles.length} static tiles, cell=${CELL} (broadphase us/call):`);
console.log(`  v2 cached (no membership change): ${c.toFixed(1)} us   (${(s / c).toFixed(1)}x vs sweep)`);
console.log(`  v2 rebuild (membership changed):  ${r.toFixed(1)} us   (${(s / r).toFixed(2)}x vs sweep)`);
console.log(`  sweep:                            ${s.toFixed(1)} us`);
console.log(`  => a rebuild frame is ${(r / c).toFixed(0)}x a cached frame; rebuild ${r < s ? 'still BEATS' : 'is SLOWER than'} sweep`);
