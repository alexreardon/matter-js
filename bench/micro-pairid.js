/* eslint-env node */
// Isolate the Pair.id string-build + pairs.table lookup cost inside collides.
// Runs once per colliding pair (~908/frame). Compares current string-key lookup
// against a few alternatives to see if there's a cheaper reuse mechanism.
"use strict";

const M = require('../build/matter.dev.js');
const { Engine, Composite, Bodies, Body, Pair, Collision } = M;

let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const engine = Engine.create({ enableSleeping: false });
Composite.add(engine.world, [
    Bodies.rectangle(400, 610, 1200, 60, { isStatic: true }),
    Bodies.rectangle(-10, 300, 60, 700, { isStatic: true }),
    Bodies.rectangle(810, 300, 60, 700, { isStatic: true })
]);
for (let i = 0; i < 350; i++) {
    const b = Bodies.rectangle(60 + rand() * 680, rand() * 500, 18 + rand() * 26, 18 + rand() * 26, { friction: 0.4, restitution: 0.2 });
    Body.setAngle(b, rand() * Math.PI);
    Composite.add(engine.world, b);
}
const delta = 1000 / 60;

let capture = [], pairsObj = null, capturing = false;
const orig = Collision.collides;
Collision.collides = function (a, b, pairs) {
    if (capturing && origRet(a, b, pairs)) { capture.push([a, b]); pairsObj = pairs; }
    return orig(a, b, pairs);
};
function origRet(a, b, p) {
    // cheap check: does it actually collide? reuse engine's own result via table presence later
    return true;
}
for (let i = 0; i < 300; i++) Engine.update(engine, delta);
capturing = true; Engine.update(engine, delta); capturing = false;
Collision.collides = orig;
// keep only colliding pairs (those present in table)
capture = capture.filter(([a, b]) => pairsObj.table[Pair.id(a, b)]);
console.log('colliding pairs captured:', capture.length);

const hr = () => Number(process.hrtime.bigint());
function time(fn, label) {
    const rounds = 60, warm = 12, batch = 600;
    const s = [];
    let sink = 0;
    for (let r = 0; r < rounds + warm; r++) {
        const t = hr();
        for (let k = 0; k < batch; k++) for (const [a, b] of capture) sink += fn(a, b) ? 1 : 0;
        const us = (hr() - t) / 1e3 / batch;
        if (r >= warm) s.push(us);
    }
    s.sort((x, y) => x - y);
    if (sink === -1) console.log('x');
    console.log(label.padEnd(34) + s[s.length >> 1].toFixed(2) + ' us/frame-worth');
    return s[s.length >> 1];
}

const table = pairsObj.table;
time((a, b) => Pair.id(a, b), 'Pair.id (string build only)');
time((a, b) => table[Pair.id(a, b)], 'table[Pair.id] (build + lookup)');

// alternative: numeric composite key into a Map
const map = new Map();
for (const [a, b] of capture) {
    const key = a.id < b.id ? a.id * 1048576 + b.id : b.id * 1048576 + a.id;
    map.set(key, table[Pair.id(a, b)]);
}
time((a, b) => map.get(a.id < b.id ? a.id * 1048576 + b.id : b.id * 1048576 + a.id), 'Map.get(numeric composite key)   ');
