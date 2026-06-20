/* eslint-env node */
// Clean A/B timer: no per-phase wrapping, just total Engine.update throughput.
// Deterministic scene mirroring a page-destroyer-like workload. Reports median
// us/update over many trials to keep noise low. Usage: node bench/ab.js [buildPath]
"use strict";

const buildPath = process.argv[2] || '../build/matter.js';
const Matter = require(buildPath);
const { Engine, Composite, Bodies, Body } = Matter;

let seed = 12345;
const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

function buildScene() {
    seed = 12345;
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;
    Composite.add(world, [
        Bodies.rectangle(400, 610, 1200, 60, { isStatic: true }),
        Bodies.rectangle(-10, 300, 60, 700, { isStatic: true }),
        Bodies.rectangle(810, 300, 60, 700, { isStatic: true })
    ]);
    for (let i = 0; i < 350; i++) {
        const w = 18 + rand() * 26, h = 18 + rand() * 26;
        const b = Bodies.rectangle(60 + rand() * 680, rand() * 500, w, h, { friction: 0.4, restitution: 0.2 });
        Body.setAngle(b, rand() * Math.PI);
        Composite.add(world, b);
    }
    for (let i = 0; i < 30; i++) {
        const c = Bodies.circle(60 + rand() * 680, rand() * 400, 6 + rand() * 6);
        Body.setVelocity(c, { x: (rand() - 0.5) * 20, y: rand() * 10 });
        Composite.add(world, c);
    }
    return engine;
}

const delta = 1000 / 60;
const warmup = 200;
const trialUpdates = 300;
const trials = 30;

const engine = buildScene();
for (let i = 0; i < warmup; i++) Engine.update(engine, delta);

const samples = [];
for (let t = 0; t < trials; t++) {
    const start = Number(process.hrtime.bigint());
    for (let i = 0; i < trialUpdates; i++) Engine.update(engine, delta);
    const ns = Number(process.hrtime.bigint()) - start;
    samples.push(ns / trialUpdates / 1e3); // us/update
}

samples.sort((a, b) => a - b);
const median = samples[Math.floor(samples.length / 2)];
const best = samples[0];
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

console.log(buildPath);
console.log('  median: ' + median.toFixed(2) + ' us/update');
console.log('  best:   ' + best.toFixed(2) + ' us/update');
console.log('  mean:   ' + mean.toFixed(2) + ' us/update');
