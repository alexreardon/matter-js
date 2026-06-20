/* eslint-env node */
"use strict";
const { bench } = require('./micro');

// ---- Pair.id ----
function oldId(a, b) {
    return a.id < b.id ? a.id.toString(36) + ':' + b.id.toString(36)
        : b.id.toString(36) + ':' + a.id.toString(36);
}
function newId(a, b) { // base-10 concat, no toString(36)
    return a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
}
const bodiesA = [], bodiesB = [];
let s = 13;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
for (let i = 0; i < 512; i++) { bodiesA.push({ id: (rnd() * 5000) | 0 }); bodiesB.push({ id: (rnd() * 5000) | 0 }); }
// uniqueness sanity (format differs but both must be 1:1 with the unordered pair)
console.log('Pair.id sample old=', oldId(bodiesA[0], bodiesB[0]), ' new=', newId(bodiesA[0], bodiesB[0]));
bench('Pair.id', {
    old: (c, i) => oldId(bodiesA[i & 511], bodiesB[i & 511]),
    new: (c, i) => newId(bodiesA[i & 511], bodiesB[i & 511]),
}, 25, 1_000_000, () => null);

// ---- Vertices.translate ----
function makeVerts(n) { const v = []; for (let i = 0; i < n; i++) v.push({ x: i * 1.7, y: i * 2.3 }); return v; }
function oldTranslate(vertices, vector, scalar) {
    scalar = typeof scalar !== 'undefined' ? scalar : 1;
    var verticesLength = vertices.length, translateX = vector.x * scalar, translateY = vector.y * scalar, i;
    for (i = 0; i < verticesLength; i++) { vertices[i].x += translateX; vertices[i].y += translateY; }
    return vertices;
}
function newTranslate(vertices, vector, scalar) {
    var translateX = vector.x, translateY = vector.y;
    if (scalar !== undefined) { translateX *= scalar; translateY *= scalar; }
    var verticesLength = vertices.length, vertex, i;
    for (i = 0; i < verticesLength; i++) { vertex = vertices[i]; vertex.x += translateX; vertex.y += translateY; }
    return vertices;
}
const tv = { x: 0.37, y: -0.21 };
const vsets = []; for (let i = 0; i < 256; i++) vsets.push(makeVerts(4));
// correctness
{
    const a = makeVerts(5), b = a.map(p => ({ x: p.x, y: p.y }));
    oldTranslate(a, tv); newTranslate(b, tv);
    for (let i = 0; i < a.length; i++) if (a[i].x !== b[i].x || a[i].y !== b[i].y) { console.error('translate MISMATCH'); process.exit(1); }
    console.log('Vertices.translate correctness: OK');
}
bench('Vertices.translate (rect)', {
    old: (c, i) => oldTranslate(vsets[i & 255], tv),
    new: (c, i) => newTranslate(vsets[i & 255], tv),
}, 25, 2_000_000, () => null);
