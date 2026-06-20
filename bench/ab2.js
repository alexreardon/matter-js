/* eslint-env node */
// Gold-standard whole-update A/B: load BOTH builds in one process and
// interleave their timing round-by-round so machine noise hits both equally.
// Reports median us/update for each + the delta. Identical deterministic scene.
"use strict";

const A = { name: 'release  build/matter.js', M: require('../build/matter.js') };
const B = { name: 'optimized build/matter.dev.js', M: require('../build/matter.dev.js') };

function buildScene(M) {
    const { Engine, Composite, Bodies, Body } = M;
    let seed = 12345;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;
    Composite.add(world, [
        Bodies.rectangle(400, 610, 1200, 60, { isStatic: true }),
        Bodies.rectangle(-10, 300, 60, 700, { isStatic: true }),
        Bodies.rectangle(810, 300, 60, 700, { isStatic: true })
    ]);
    for (let i = 0; i < 350; i++) {
        const b = Bodies.rectangle(60 + rand() * 680, rand() * 500, 18 + rand() * 26, 18 + rand() * 26, { friction: 0.4, restitution: 0.2 });
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
const warmup = 200, trialUpdates = 300, rounds = 40;

for (const S of [A, B]) {
    S.engine = buildScene(S.M);
    for (let i = 0; i < warmup; i++) S.M.Engine.update(S.engine, delta);
    S.samples = [];
}

for (let r = 0; r < rounds; r++) {
    for (const S of [A, B]) {
        const update = S.M.Engine.update;
        const eng = S.engine;
        const t = Number(process.hrtime.bigint());
        for (let i = 0; i < trialUpdates; i++) update(eng, delta);
        S.samples.push((Number(process.hrtime.bigint()) - t) / trialUpdates / 1e3);
    }
}

function stats(s) { s = s.slice().sort((a, b) => a - b); return { median: s[s.length >> 1], best: s[0] }; }
const sa = stats(A.samples), sb = stats(B.samples);
console.log(A.name + ':  median ' + sa.median.toFixed(2) + '  best ' + sa.best.toFixed(2) + ' us/update');
console.log(B.name + ':  median ' + sb.median.toFixed(2) + '  best ' + sb.best.toFixed(2) + ' us/update');
console.log('\nthroughput delta (median): ' + ((sa.median / sb.median - 1) * 100).toFixed(2) + '% '
    + (sb.median < sa.median ? 'faster' : 'SLOWER'));
console.log('throughput delta (best):   ' + ((sa.best / sb.best - 1) * 100).toFixed(2) + '% '
    + (sb.best < sa.best ? 'faster' : 'SLOWER'));
