/* eslint-env node */
"use strict";
const { bench } = require('./micro');
const Matter = require('../build/matter.js');
const { Bodies, Body } = Matter;

// build a pool of real bodies (rectangles + a polygon + circle) at varied angles
const pool = [];
let s = 4242;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
for (let i = 0; i < 128; i++) {
    const b = Bodies.rectangle(0, 0, 20 + rnd() * 30, 20 + rnd() * 30);
    Body.setAngle(b, rnd() * Math.PI);
    pool.push(b);
}
// a few polygons and circles for shape variety
for (let i = 0; i < 16; i++) { const b = Bodies.polygon(0, 0, 5, 20); Body.setAngle(b, rnd()); pool.push(b); }
for (let i = 0; i < 16; i++) pool.push(Bodies.circle(0, 0, 12));

// pairs of (verticesA, verticesB, axesA) sampled from the pool
const cases = [];
for (let i = 0; i < 512; i++) {
    const a = pool[(rnd() * pool.length) | 0];
    const b = pool[(rnd() * pool.length) | 0];
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

// variant: cache vertex object in inner loops (avoid double index)
function newOverlap(result, verticesA, verticesB, axes) {
    var verticesALength = verticesA.length, verticesBLength = verticesB.length,
        vertexA0 = verticesA[0], vertexB0 = verticesB[0],
        verticesAX = vertexA0.x, verticesAY = vertexA0.y,
        verticesBX = vertexB0.x, verticesBY = vertexB0.y,
        axesLength = axes.length, overlapMin = Number.MAX_VALUE, overlapAxisNumber = 0,
        overlap, overlapAB, overlapBA, dot, v, i, j;
    for (i = 0; i < axesLength; i++) {
        var axis = axes[i], axisX = axis.x, axisY = axis.y,
            minA = verticesAX * axisX + verticesAY * axisY,
            minB = verticesBX * axisX + verticesBY * axisY, maxA = minA, maxB = minB;
        for (j = 1; j < verticesALength; j += 1) {
            v = verticesA[j];
            dot = v.x * axisX + v.y * axisY;
            if (dot > maxA) { maxA = dot; } else if (dot < minA) { minA = dot; }
        }
        for (j = 1; j < verticesBLength; j += 1) {
            v = verticesB[j];
            dot = v.x * axisX + v.y * axisY;
            if (dot > maxB) { maxB = dot; } else if (dot < minB) { minB = dot; }
        }
        overlapAB = maxA - minB; overlapBA = maxB - minA;
        overlap = overlapAB < overlapBA ? overlapAB : overlapBA;
        if (overlap < overlapMin) { overlapMin = overlap; overlapAxisNumber = i; if (overlap <= 0) break; }
    }
    result.axis = axes[overlapAxisNumber]; result.overlap = overlapMin;
}

// correctness
for (const [va, vb, ax] of cases) {
    oldOverlap(resOld, va, vb, ax); newOverlap(resNew, va, vb, ax);
    if (resOld.overlap !== resNew.overlap || resOld.axis !== resNew.axis) {
        console.error('MISMATCH', resOld, resNew); process.exit(1);
    }
}
console.log('correctness: OK');

bench('Collision._overlapAxes', {
    old: (ctx, i) => { const c = cases[i & 511]; oldOverlap(resOld, c[0], c[1], c[2]); },
    new: (ctx, i) => { const c = cases[i & 511]; newOverlap(resNew, c[0], c[1], c[2]); },
}, 25, 2_000_000, () => null);
