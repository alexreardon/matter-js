/* eslint-env node */
// Second-round _overlapAxes experiments, box-heavy (page-destroyer). Tries an
// unrolled 4-vertex projection vs the current loop. min/max of a set is
// order-independent, so the unroll is bit-identical for 4-gon boxes. Asserts
// identical (overlap, axis) before timing.
"use strict";
const { bench } = require('./micro');
const Matter = require('../build/matter.js');
const { Bodies, Body } = Matter;

const pool = [];
let s = 4242;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
for (let i = 0; i < 200; i++) {
    const b = Bodies.rectangle(0, 0, 20 + rnd() * 30, 20 + rnd() * 30);
    Body.setAngle(b, rnd() * Math.PI);
    pool.push(b);
}
const cases = [];
for (let i = 0; i < 512; i++) {
    const a = pool[(rnd() * pool.length) | 0], b = pool[(rnd() * pool.length) | 0];
    cases.push([a.vertices, b.vertices, a.axes]);
}

const resOld = { overlap: 0, axis: null };
const resNew = { overlap: 0, axis: null };

function oldOverlap(result, verticesA, verticesB, axes) {
    var verticesALength = verticesA.length, verticesBLength = verticesB.length,
        verticesAX = verticesA[0].x, verticesAY = verticesA[0].y,
        verticesBX = verticesB[0].x, verticesBY = verticesB[0].y,
        axesLength = axes.length, overlapMin = Number.MAX_VALUE, overlapAxisNumber = 0,
        overlap, overlapAB, overlapBA, dot, i, j;
    for (i = 0; i < axesLength; i++) {
        var axis = axes[i], axisX = axis.x, axisY = axis.y,
            minA = verticesAX * axisX + verticesAY * axisY,
            minB = verticesBX * axisX + verticesBY * axisY, maxA = minA, maxB = minB;
        for (j = 1; j < verticesALength; j += 1) {
            dot = verticesA[j].x * axisX + verticesA[j].y * axisY;
            if (dot > maxA) { maxA = dot; } else if (dot < minA) { minA = dot; }
        }
        for (j = 1; j < verticesBLength; j += 1) {
            dot = verticesB[j].x * axisX + verticesB[j].y * axisY;
            if (dot > maxB) { maxB = dot; } else if (dot < minB) { minB = dot; }
        }
        overlapAB = maxA - minB; overlapBA = maxB - minA;
        overlap = overlapAB < overlapBA ? overlapAB : overlapBA;
        if (overlap < overlapMin) { overlapMin = overlap; overlapAxisNumber = i; if (overlap <= 0) break; }
    }
    result.axis = axes[overlapAxisNumber]; result.overlap = overlapMin;
}

// unrolled projection when BOTH bodies are quads (the box-vs-box common case)
function newOverlap(result, verticesA, verticesB, axes) {
    var verticesALength = verticesA.length, verticesBLength = verticesB.length;
    if (verticesALength !== 4 || verticesBLength !== 4) { return oldOverlap(result, verticesA, verticesB, axes); }
    var a0 = verticesA[0], a1 = verticesA[1], a2 = verticesA[2], a3 = verticesA[3],
        b0 = verticesB[0], b1 = verticesB[1], b2 = verticesB[2], b3 = verticesB[3],
        a0x = a0.x, a0y = a0.y, a1x = a1.x, a1y = a1.y, a2x = a2.x, a2y = a2.y, a3x = a3.x, a3y = a3.y,
        b0x = b0.x, b0y = b0.y, b1x = b1.x, b1y = b1.y, b2x = b2.x, b2y = b2.y, b3x = b3.x, b3y = b3.y,
        axesLength = axes.length, overlapMin = Number.MAX_VALUE, overlapAxisNumber = 0, overlap, overlapAB, overlapBA, i;
    for (i = 0; i < axesLength; i++) {
        var axis = axes[i], axisX = axis.x, axisY = axis.y,
            pa0 = a0x * axisX + a0y * axisY, pa1 = a1x * axisX + a1y * axisY,
            pa2 = a2x * axisX + a2y * axisY, pa3 = a3x * axisX + a3y * axisY,
            minA = pa0, maxA = pa0,
            pb0 = b0x * axisX + b0y * axisY, pb1 = b1x * axisX + b1y * axisY,
            pb2 = b2x * axisX + b2y * axisY, pb3 = b3x * axisX + b3y * axisY,
            minB = pb0, maxB = pb0;
        if (pa1 > maxA) { maxA = pa1; } else if (pa1 < minA) { minA = pa1; }
        if (pa2 > maxA) { maxA = pa2; } else if (pa2 < minA) { minA = pa2; }
        if (pa3 > maxA) { maxA = pa3; } else if (pa3 < minA) { minA = pa3; }
        if (pb1 > maxB) { maxB = pb1; } else if (pb1 < minB) { minB = pb1; }
        if (pb2 > maxB) { maxB = pb2; } else if (pb2 < minB) { minB = pb2; }
        if (pb3 > maxB) { maxB = pb3; } else if (pb3 < minB) { minB = pb3; }
        overlapAB = maxA - minB; overlapBA = maxB - minA;
        overlap = overlapAB < overlapBA ? overlapAB : overlapBA;
        if (overlap < overlapMin) { overlapMin = overlap; overlapAxisNumber = i; if (overlap <= 0) break; }
    }
    result.axis = axes[overlapAxisNumber]; result.overlap = overlapMin;
}

for (const [va, vb, ax] of cases) {
    oldOverlap(resOld, va, vb, ax); newOverlap(resNew, va, vb, ax);
    if (resOld.overlap !== resNew.overlap || resOld.axis !== resNew.axis) {
        console.error('MISMATCH', resOld, resNew); process.exit(1);
    }
}
console.log('correctness: OK (unrolled-4 identical to loop)');

bench('Collision._overlapAxes box-heavy', {
    old: (ctx, i) => { const c = cases[i & 511]; oldOverlap(resOld, c[0], c[1], c[2]); },
    new: (ctx, i) => { const c = cases[i & 511]; newOverlap(resNew, c[0], c[1], c[2]); },
}, 30, 2_000_000, () => null);
