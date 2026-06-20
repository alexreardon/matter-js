/* eslint-env node */
// Isolate Body.update cost by comparing the REAL compiled code of two builds
// on identical single-part body pools (the page-destroyer common case).
// Asserts bit-identical integrated state, then times many update calls.
// Usage: node bench/micro-bodyupdate.js [oldBuild] [newBuild]
"use strict";

const oldPath = process.argv[2] || '../build/matter.js';
const newPath = process.argv[3] || '../build/matter.dev.js';
const Mold = require(oldPath);
const Mnew = require(newPath);

function buildPool(M) {
    let s = 90210;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const pool = [];
    for (let i = 0; i < 400; i++) {
        const b = M.Bodies.rectangle(rnd() * 800, rnd() * 600, 18 + rnd() * 24, 18 + rnd() * 24);
        M.Body.setAngle(b, rnd() * Math.PI);
        M.Body.setVelocity(b, { x: (rnd() - 0.5) * 6, y: (rnd() - 0.5) * 6 });
        // a small constant force so the integration path stays lively
        b.force.x = (rnd() - 0.5) * 0.002 * b.mass;
        b.force.y = 0.001 * b.mass;
        pool.push(b);
    }
    return pool;
}

const poolOld = buildPool(Mold);
const poolNew = buildPool(Mnew);
const delta = 1000 / 60;

// run a few updates and assert bit-identical state across the two builds
function step(M, pool) {
    for (let i = 0; i < pool.length; i++) {
        // re-apply a constant force each step (Body.update does not clear it)
        pool[i].force.y = 0.001 * pool[i].mass;
        M.Body.update(pool[i], delta);
    }
}
for (let k = 0; k < 50; k++) { step(Mold, poolOld); step(Mnew, poolNew); }
let mism = 0;
for (let i = 0; i < poolOld.length; i++) {
    const a = poolOld[i], b = poolNew[i];
    if (a.position.x !== b.position.x || a.position.y !== b.position.y || a.angle !== b.angle) mism++;
    for (let v = 0; v < a.vertices.length; v++) {
        if (a.vertices[v].x !== b.vertices[v].x || a.vertices[v].y !== b.vertices[v].y) mism++;
    }
}
console.log('parts.length === 1 for all:', poolOld.every(b => b.parts.length === 1));
console.log('bit-identical state after 50 steps:', mism === 0, mism ? '(' + mism + ' mismatches)' : '');
if (mism !== 0) process.exit(1);

const hr = () => Number(process.hrtime.bigint());
const variants = [
    { name: 'old', M: Mold, pool: poolOld },
    { name: 'new', M: Mnew, pool: poolNew }
];
const rounds = 60, warm = 12, iters = 1500;
const res = { old: [], new: [] };
for (let r = 0; r < rounds + warm; r++) {
    for (const V of variants) {
        const update = V.M.Body.update, pool = V.pool, n = pool.length;
        const t = hr();
        for (let it = 0; it < iters; it++) {
            for (let i = 0; i < n; i++) update(pool[i], delta);
        }
        const ns = (hr() - t) / (iters * n);
        if (r >= warm) res[V.name].push(ns);
    }
}
const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
const mo = med(res.old), mn = med(res.new);
console.log('\nold ' + mo.toFixed(2) + ' ns/update-call');
console.log('new ' + mn.toFixed(2) + ' ns/update-call');
console.log('=> new is ' + ((mo / mn - 1) * 100).toFixed(2) + '% ' + (mn < mo ? 'faster' : 'SLOWER'));
