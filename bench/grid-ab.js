/* eslint-env node */
// Pure broadphase A/B: sweep vs grid timed on IDENTICAL steady-state positions
// (the only variable is the algorithm), across page shapes and grid cell sizes.
// Reports median us per Detector.collisions call. Run after grid-correctness.js
// has proven the two agree.
//
//   SCENE=sparse|medium|dense|towers   (default: run all)
//   MOVERS=n BULLETS=1                  movers added to the scene
"use strict";

const Matter = require('../src/module/main.js');
const { Engine, Composite, Bodies, Body, Detector, Pairs } = Matter;

const W = 1280;
let seed = 98765;
const reseed = (s) => { seed = s; };
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const hr = () => Number(process.hrtime.bigint());

function walls(world, h) {
    Composite.add(world, [
        Bodies.rectangle(W / 2, h + 30, W + 200, 60, { isStatic: true }),
        Bodies.rectangle(W / 2, -30, W + 200, 60, { isStatic: true }),
        Bodies.rectangle(-30, h / 2, 60, h + 200, { isStatic: true }),
        Bodies.rectangle(W + 30, h / 2, 60, h + 200, { isStatic: true })
    ]);
}

function buildStatics(world, scene) {
    let n = 0;
    if (scene === 'sparse') {
        for (let i = 0; i < 250; i++) {
            const img = rand() < 0.15;
            Composite.add(world, Bodies.rectangle(40 + rand() * (W - 120), 30 + rand() * 1500,
                img ? 110 + rand() * 80 : 30 + rand() * 190, img ? 80 + rand() * 70 : 13 + rand() * 7, { isStatic: true }));
            n++;
        }
    } else if (scene === 'medium') {
        for (let r = 0; r < 50; r++) for (let c = 0; c < 30; c++) {
            Composite.add(world, Bodies.rectangle(40 + c * 41, 40 + r * 30, 34, 14, { isStatic: true })); n++;
        }
    } else if (scene === 'dense') {
        for (let r = 0; r < 70; r++) for (let c = 0; c < 80; c++) {
            Composite.add(world, Bodies.rectangle(20 + c * 16, 20 + r * 16, 15, 15, { isStatic: true })); n++;
        }
    } else if (scene === 'towers') {
        // few wide columns, each very tall: clustered min.x + tall = sweep worst
        // case, models /site buildings
        const cols = 12;
        for (let t = 0; t < cols; t++) {
            const baseX = 50 + t * 100;
            for (let w = 0; w < 4; w++) for (let r = 0; r < 120; r++) {
                Composite.add(world, Bodies.rectangle(baseX + w * 16, 30 + r * 16, 15, 15, { isStatic: true })); n++;
            }
        }
    }
    return n;
}

function addMovers(world, movers, bullets) {
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
}

function sceneHeight(scene) {
    return scene === 'sparse' ? 1600 : scene === 'medium' ? 1560 : scene === 'towers' ? 1960 : 1180;
}

function median(arr) { const s = arr.slice().sort((a, b) => a - b); return s[s.length >> 1]; }

function timeImpl(det) {
    // warm, then median us/call over rounds
    for (let i = 0; i < 30; i++) Detector.collisions(det);
    const rounds = 60, calls = 40, samples = [];
    for (let r = 0; r < rounds; r++) {
        const t = hr();
        for (let k = 0; k < calls; k++) Detector.collisions(det);
        samples.push((hr() - t) / calls / 1e3);
    }
    return median(samples);
}

function runScene(scene, movers, bullets) {
    reseed(98765);
    const engine = Engine.create({ enableSleeping: false });
    walls(engine.world, sceneHeight(scene));
    const staticCount = buildStatics(engine.world, scene);
    addMovers(engine.world, movers, bullets);

    // evolve to steady state under the sweep
    Detector._mode = 'sweep';
    const delta = 1000 / 60;
    for (let i = 0; i < 220; i++) Engine.update(engine, delta);

    const bodies = Composite.allBodies(engine.world);

    // sweep timing
    Detector._mode = 'sweep';
    const sweepDet = { bodies: bodies.slice(0), pairs: Pairs.create(), collisions: [] };
    const sweepUs = timeImpl(sweepDet);

    const cells = [16, 24, 32, 48, 64];

    // grid v1 (per-frame rebuild) timing per cell size
    Detector._mode = 'grid';
    const gridResults = cells.map((cell) => {
        Detector._cellSize = cell;
        const det = { bodies: bodies.slice(0), pairs: Pairs.create(), collisions: [] };
        return { cell, us: timeImpl(det) };
    });

    // grid v2 (static index) timing per cell size
    Detector._mode = 'gridStatic';
    const gridStaticResults = cells.map((cell) => {
        Detector._cellSize = cell;
        const det = { bodies: bodies.slice(0), pairs: Pairs.create(), collisions: [] };
        return { cell, us: timeImpl(det) };
    });
    Detector._mode = 'sweep';

    const best1 = gridResults.reduce((a, b) => (b.us < a.us ? b : a));
    const best2 = gridStaticResults.reduce((a, b) => (b.us < a.us ? b : a));
    console.log(`\n== ${scene}${bullets ? '+bullets' : ''} movers=${movers} | bodies=${bodies.length} ==`);
    console.log(`  sweep:               ${sweepUs.toFixed(2)} us/call`);
    for (let i = 0; i < cells.length; i++) {
        const g1 = gridResults[i], g2 = gridStaticResults[i];
        const m1 = g1 === best1 ? ' <' : '  ';
        const m2 = g2 === best2 ? ' <' : '  ';
        console.log(
            `  cell=${String(g1.cell).padStart(2)}  v1 ${g1.us.toFixed(1).padStart(7)} (${(sweepUs / g1.us).toFixed(2)}x)${m1}` +
            `   v2 ${g2.us.toFixed(1).padStart(6)} (${(sweepUs / g2.us).toFixed(2)}x)${m2}`
        );
    }
    console.log(`  => v1 best ${(sweepUs / best1.us).toFixed(2)}x @cell${best1.cell} | v2 best ${(sweepUs / best2.us).toFixed(2)}x @cell${best2.cell}`);
    return { scene, bodies: bodies.length, sweepUs, best1, best2 };
}

const only = process.env.SCENE;
const movers = process.env.MOVERS != null ? Number(process.env.MOVERS) : 0;
const bullets = process.env.BULLETS === '1';

const scenes = only ? [only] : ['sparse', 'medium', 'dense', 'towers'];
const summary = [];
for (const s of scenes) {
    // calm (statics only) plus an active variant for the dense/towers cases
    summary.push(runScene(s, movers, bullets));
}

console.log('\n===== SUMMARY (broadphase us/call; >1x = faster than sweep) =====');
for (const r of summary) {
    console.log(
        `  ${r.scene.padEnd(8)} bodies=${String(r.bodies).padStart(5)}  sweep ${r.sweepUs.toFixed(1).padStart(7)}` +
        `  | v1 ${r.best1.us.toFixed(1).padStart(7)} (${(r.sweepUs / r.best1.us).toFixed(2)}x)` +
        `  | v2 ${r.best2.us.toFixed(1).padStart(6)} (${(r.sweepUs / r.best2.us).toFixed(2)}x @cell${r.best2.cell})`
    );
}
