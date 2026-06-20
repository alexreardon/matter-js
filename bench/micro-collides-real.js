/* eslint-env node */
// Compare the REAL compiled Collision.collides of two builds on identical
// colliding body pairs captured from a settled scene. Asserts bit-identical
// collision records (depth, normal, supports), then times many collides calls.
// Exercises _overlapAxes + _findSupports + Vertices.contains end-to-end.
// Usage: node bench/micro-collides-real.js [oldBuild] [newBuild]
"use strict";

const oldPath = process.argv[2] || '../build/matter.js';
const newPath = process.argv[3] || '../build/matter.dev.js';
const Mold = require(oldPath);
const Mnew = require(newPath);

// capture colliding (i,j) index pairs from a settled scene built in Mold, then
// rebuild the SAME scene in both modules so body objects line up by index.
function buildScene(M) {
    const engine = M.Engine.create({ enableSleeping: false });
    const world = engine.world;
    let s = 777;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    M.Composite.add(world, M.Bodies.rectangle(400, 610, 1200, 60, { isStatic: true }));
    for (let i = 0; i < 350; i++) {
        const b = M.Bodies.rectangle(60 + rnd() * 680, rnd() * 500, 18 + rnd() * 26, 18 + rnd() * 26);
        M.Body.setAngle(b, rnd() * Math.PI);
        M.Composite.add(world, b);
    }
    const delta = 1000 / 60;
    for (let i = 0; i < 200; i++) M.Engine.update(engine, delta);
    return M.Composite.allBodies(world);
}

const bodiesOld = buildScene(Mold);
const bodiesNew = buildScene(Mnew);

// find AABB-overlapping pairs that actually collide (in the old build)
const pairs = [];
for (let i = 0; i < bodiesOld.length; i++) {
    for (let j = i + 1; j < bodiesOld.length; j++) {
        const a = bodiesOld[i], b = bodiesOld[j];
        if (Mold.Bounds.overlaps(a.bounds, b.bounds)) {
            if (Mold.Collision.collides(a, b, null)) pairs.push([i, j]);
        }
    }
}
console.log('colliding pairs captured:', pairs.length);

// correctness: collides output bit-identical between builds
let mism = 0;
for (const [i, j] of pairs) {
    const co = Mold.Collision.collides(bodiesOld[i], bodiesOld[j], null);
    const cn = Mnew.Collision.collides(bodiesNew[i], bodiesNew[j], null);
    if (!co || !cn) { mism++; continue; }
    if (co.depth !== cn.depth || co.normal.x !== cn.normal.x || co.normal.y !== cn.normal.y
        || co.supportCount !== cn.supportCount) { mism++; continue; }
    for (let k = 0; k < co.supportCount; k++) {
        if (co.supports[k].x !== cn.supports[k].x || co.supports[k].y !== cn.supports[k].y) mism++;
    }
}
console.log('bit-identical collides output:', mism === 0, mism ? '(' + mism + ' mismatches)' : '');
if (mism !== 0) process.exit(1);

const hr = () => Number(process.hrtime.bigint());
const variants = [
    { name: 'old', M: Mold, bodies: bodiesOld },
    { name: 'new', M: Mnew, bodies: bodiesNew }
];
const rounds = 60, warm = 12, iters = 400;
const res = { old: [], new: [] };
for (let r = 0; r < rounds + warm; r++) {
    for (const V of variants) {
        const collides = V.M.Collision.collides, bodies = V.bodies, P = pairs, n = P.length;
        const t = hr();
        for (let it = 0; it < iters; it++) {
            for (let p = 0; p < n; p++) collides(bodies[P[p][0]], bodies[P[p][1]], null);
        }
        const ns = (hr() - t) / (iters * n);
        if (r >= warm) res[V.name].push(ns);
    }
}
const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
const mo = med(res.old), mn = med(res.new);
console.log('\nold ' + mo.toFixed(2) + ' ns/collides');
console.log('new ' + mn.toFixed(2) + ' ns/collides');
console.log('=> new is ' + ((mo / mn - 1) * 100).toFixed(2) + '% ' + (mn < mo ? 'faster' : 'SLOWER'));
