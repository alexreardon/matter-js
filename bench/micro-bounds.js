/* eslint-env node */
"use strict";
const { bench } = require('./micro');

// representative vertex sets: rectangles (4), and a few polygons
function makeBounds() { return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }; }
function makeVerts(n, spread) {
    const v = [];
    let s = 99173 + n * 31;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < n; i++) v.push({ x: (rnd() - 0.5) * spread, y: (rnd() - 0.5) * spread });
    return v;
}

// rotating set: vary which bodies so branch behaviour is realistic
const verts = [];
for (let i = 0; i < 256; i++) verts.push(makeVerts(4, 40)); // rectangles dominate
const bounds = makeBounds();
const vel = { x: 1.3, y: -0.7 };

function oldUpdate(bounds, vertices, velocity) {
    bounds.min.x = Infinity; bounds.max.x = -Infinity;
    bounds.min.y = Infinity; bounds.max.y = -Infinity;
    for (var i = 0; i < vertices.length; i++) {
        var vertex = vertices[i];
        if (vertex.x > bounds.max.x) bounds.max.x = vertex.x;
        if (vertex.x < bounds.min.x) bounds.min.x = vertex.x;
        if (vertex.y > bounds.max.y) bounds.max.y = vertex.y;
        if (vertex.y < bounds.min.y) bounds.min.y = vertex.y;
    }
    if (velocity) {
        if (velocity.x > 0) bounds.max.x += velocity.x; else bounds.min.x += velocity.x;
        if (velocity.y > 0) bounds.max.y += velocity.y; else bounds.min.y += velocity.y;
    }
}

function newUpdate(bounds, vertices, velocity) {
    var verticesLength = vertices.length, vertex = vertices[0],
        minX = vertex.x, maxX = vertex.x, minY = vertex.y, maxY = vertex.y, x, y, i;
    for (i = 1; i < verticesLength; i++) {
        vertex = vertices[i]; x = vertex.x; y = vertex.y;
        if (x > maxX) { maxX = x; } else if (x < minX) { minX = x; }
        if (y > maxY) { maxY = y; } else if (y < minY) { minY = y; }
    }
    if (velocity) {
        if (velocity.x > 0) maxX += velocity.x; else minX += velocity.x;
        if (velocity.y > 0) maxY += velocity.y; else minY += velocity.y;
    }
    bounds.min.x = minX; bounds.max.x = maxX; bounds.min.y = minY; bounds.max.y = maxY;
}

// correctness check
for (const vs of verts) {
    const b1 = makeBounds(), b2 = makeBounds();
    oldUpdate(b1, vs, vel); newUpdate(b2, vs, vel);
    if (JSON.stringify(b1) !== JSON.stringify(b2)) { console.error('MISMATCH', b1, b2, vs); process.exit(1); }
}
console.log('correctness: OK (old and new produce identical bounds)');

bench('Bounds.update (rectangles)', {
    old: (ctx, i) => oldUpdate(bounds, verts[i & 255], vel),
    new: (ctx, i) => newUpdate(bounds, verts[i & 255], vel),
}, 25, 2_000_000, () => null);
