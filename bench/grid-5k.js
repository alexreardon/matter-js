/* eslint-env node */
// Focused 5000-body A/B: sweep vs the shipped static-index grid (gridStatic),
// at the game's default cell size. Two clean measurements:
//   1. whole-step Engine.update on the CALM field (no movers -> both modes see
//      identical positions -> directly comparable, no re-baseline divergence).
//   2. broadphase-only, timed on IDENTICAL frozen positions for calm / bullets /
//      storm (evolve under the sweep, freeze, time both impls on that state).
"use strict";

const Matter = require('../src/module/main.js');
const { Engine, Composite, Bodies, Body, Detector, Pairs } = Matter;
const hr = () => Number(process.hrtime.bigint());
const CELL = process.env.CELL != null ? Number(process.env.CELL) : 32;

let seed = 13579;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const W = 1280;

// exactly 5000 static tiles (100 x 50), viewport-sized so windowing would keep
// them all, plus 4 walls so movers stay in the field
function buildScene({ movers, bullets }) {
    seed = 13579;
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;
    let staticCount = 0;
    for (let r = 0; r < 50; r++) {
        for (let c = 0; c < 100; c++) {
            Composite.add(world, Bodies.rectangle(20 + c * 12, 20 + r * 16, 11, 15, { isStatic: true }));
            staticCount++;
        }
    }
    Composite.add(world, [
        Bodies.rectangle(W / 2, 860, W + 200, 60, { isStatic: true }),
        Bodies.rectangle(W / 2, -30, W + 200, 60, { isStatic: true }),
        Bodies.rectangle(-30, 430, 60, 960, { isStatic: true }),
        Bodies.rectangle(W + 30, 430, 60, 960, { isStatic: true })
    ]);
    for (let i = 0; i < movers; i++) {
        if (bullets) {
            const b = Bodies.rectangle(100 + rand() * (W - 200), 100 + rand() * 600, 10, 6, { friction: 0, frictionAir: 0, restitution: 1, density: 0.01 });
            Body.setVelocity(b, { x: (rand() < 0.5 ? -1 : 1) * 28, y: (rand() - 0.5) * 20 });
            Composite.add(world, b);
        } else {
            const s = 16 + rand() * 22;
            const b = Bodies.rectangle(60 + rand() * (W - 120), -40 - rand() * 500, s, s, { friction: 0.4, restitution: 0.2 });
            Body.setAngle(b, rand() * Math.PI);
            Composite.add(world, b);
        }
    }
    return { engine, staticCount };
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

// 1) whole-step Engine.update on the calm field
function wholeStepCalm(mode) {
    Detector._mode = mode;
    Detector._cellSize = CELL;
    const { engine } = buildScene({ movers: 0, bullets: false });
    const delta = 1000 / 60;
    for (let i = 0; i < 200; i++) Engine.update(engine, delta);
    const samples = [];
    for (let r = 0; r < 30; r++) {
        const t = hr();
        for (let k = 0; k < 40; k++) Engine.update(engine, delta);
        samples.push((hr() - t) / 40 / 1e3);
    }
    return median(samples);
}

// 2) broadphase-only on identical frozen positions
function broadphaseAB({ movers, bullets, label }) {
    const { engine } = buildScene({ movers, bullets });
    Detector._mode = 'sweep';
    Detector._cellSize = CELL;
    const delta = 1000 / 60;
    for (let i = 0; i < 220; i++) Engine.update(engine, delta);
    const frozen = Composite.allBodies(engine.world).slice(0);

    const time = (mode) => {
        Detector._mode = mode;
        const det = { bodies: frozen.slice(0), pairs: Pairs.create(), collisions: [] };
        for (let i = 0; i < 30; i++) Detector.collisions(det);
        const samples = [];
        for (let r = 0; r < 60; r++) {
            const t = hr();
            for (let k = 0; k < 40; k++) Detector.collisions(det);
            samples.push((hr() - t) / 40 / 1e3);
        }
        return median(samples);
    };
    const sweep = time('sweep');
    const grid = time('gridStatic');
    Detector._mode = 'sweep';
    console.log(`  ${label.padEnd(16)} sweep ${sweep.toFixed(1).padStart(7)}us  grid ${grid.toFixed(1).padStart(6)}us  => ${(sweep / grid).toFixed(2)}x`);
}

const built = buildScene({ movers: 0, bullets: false });
console.log(`5000-body A/B (static ${built.staticCount} + 4 walls, cell=${CELL})\n`);

const sweepStep = wholeStepCalm('sweep');
const gridStep = wholeStepCalm('gridStatic');
console.log('whole-step Engine.update (calm, identical positions):');
console.log(`  sweep ${sweepStep.toFixed(1)}us/update   grid ${gridStep.toFixed(1)}us/update   => ${(sweepStep / gridStep).toFixed(2)}x\n`);

console.log('broadphase only (identical frozen positions):');
broadphaseAB({ movers: 0, bullets: false, label: 'calm' });
broadphaseAB({ movers: 6, bullets: true, label: '+6 bullets' });
broadphaseAB({ movers: 200, bullets: false, label: '+200 storm' });
