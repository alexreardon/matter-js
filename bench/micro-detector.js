/* eslint-env node */
"use strict";
const { bench } = require('./micro');
const Matter = require('../build/matter.js');
const { Bodies, Body, Composite, Engine } = Matter;

// realistic body set: pile of rectangles + circles, settled a bit
const engine = Engine.create();
const world = engine.world;
let s = 777;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
Composite.add(world, Bodies.rectangle(400, 610, 1200, 60, { isStatic: true }));
for (let i = 0; i < 350; i++) {
    const b = Bodies.rectangle(60 + rnd() * 680, rnd() * 500, 18 + rnd() * 26, 18 + rnd() * 26);
    Body.setAngle(b, rnd() * Math.PI);
    Composite.add(world, b);
}
for (let i = 0; i < 30; i++) Composite.add(world, Bodies.circle(60 + rnd() * 680, rnd() * 400, 8));
const delta = 1000 / 60;
for (let i = 0; i < 200; i++) Engine.update(engine, delta); // settle

const bodies = Composite.allBodies(world);
const canCollide = Matter.Detector.canCollide;

// stub: record pairs instead of doing real SAT, so we measure ONLY broadphase
let recorder = null;
const collidesStub = (a, b) => { if (recorder) recorder.push(a.id * 100000 + b.id); return null; };

function oldCollisions(detector) {
    var pairs = detector.pairs, bodies = detector.bodies, bodiesLength = bodies.length,
        canCollide = Matter.Detector.canCollide, collides = collidesStub,
        collisions = detector.collisions, collisionIndex = 0, i, j;
    bodies.sort(Matter.Detector._compareBoundsX);
    for (i = 0; i < bodiesLength; i++) {
        var bodyA = bodies[i], boundsA = bodyA.bounds, boundXMax = bodyA.bounds.max.x,
            boundYMax = bodyA.bounds.max.y, boundYMin = bodyA.bounds.min.y,
            bodyAStatic = bodyA.isStatic || bodyA.isSleeping,
            partsALength = bodyA.parts.length, partsASingle = partsALength === 1;
        for (j = i + 1; j < bodiesLength; j++) {
            var bodyB = bodies[j], boundsB = bodyB.bounds;
            if (boundsB.min.x > boundXMax) break;
            if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) continue;
            if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) continue;
            if (!canCollide(bodyA.collisionFilter, bodyB.collisionFilter)) continue;
            var partsBLength = bodyB.parts.length;
            if (partsASingle && partsBLength === 1) {
                var collision = collides(bodyA, bodyB, pairs);
                if (collision) collisions[collisionIndex++] = collision;
            } else {
                var partsAStart = partsALength > 1 ? 1 : 0, partsBStart = partsBLength > 1 ? 1 : 0;
                for (var k = partsAStart; k < partsALength; k++) {
                    var partA = bodyA.parts[k]; boundsA = partA.bounds;
                    for (var z = partsBStart; z < partsBLength; z++) {
                        var partB = bodyB.parts[z]; boundsB = partB.bounds;
                        if (boundsA.min.x > boundsB.max.x || boundsA.max.x < boundsB.min.x
                            || boundsA.max.y < boundsB.min.y || boundsA.min.y > boundsB.max.y) continue;
                        var c2 = collides(partA, partB, pairs);
                        if (c2) collisions[collisionIndex++] = c2;
                    }
                }
            }
        }
    }
    if (collisions.length !== collisionIndex) collisions.length = collisionIndex;
    return collisions;
}

// new: hoist filterA + group/category/mask, inline canCollide, use boundsA local
function newCollisions(detector) {
    var pairs = detector.pairs, bodies = detector.bodies, bodiesLength = bodies.length,
        collides = collidesStub, collisions = detector.collisions, collisionIndex = 0, i, j;
    bodies.sort(Matter.Detector._compareBoundsX);
    for (i = 0; i < bodiesLength; i++) {
        var bodyA = bodies[i], boundsA = bodyA.bounds,
            boundXMax = boundsA.max.x, boundYMax = boundsA.max.y, boundYMin = boundsA.min.y,
            bodyAStatic = bodyA.isStatic || bodyA.isSleeping,
            partsALength = bodyA.parts.length, partsASingle = partsALength === 1,
            filterA = bodyA.collisionFilter, groupA = filterA.group,
            categoryA = filterA.category, maskA = filterA.mask;
        for (j = i + 1; j < bodiesLength; j++) {
            var bodyB = bodies[j], boundsB = bodyB.bounds;
            if (boundsB.min.x > boundXMax) break;
            if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) continue;
            if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) continue;
            var filterB = bodyB.collisionFilter;
            if (groupA === filterB.group && groupA !== 0) {
                if (groupA < 0) continue;
            } else if ((maskA & filterB.category) === 0 || (filterB.mask & categoryA) === 0) {
                continue;
            }
            var partsBLength = bodyB.parts.length;
            if (partsASingle && partsBLength === 1) {
                var collision = collides(bodyA, bodyB, pairs);
                if (collision) collisions[collisionIndex++] = collision;
            } else {
                var partsAStart = partsALength > 1 ? 1 : 0, partsBStart = partsBLength > 1 ? 1 : 0;
                for (var k = partsAStart; k < partsALength; k++) {
                    var partA = bodyA.parts[k], pBoundsA = partA.bounds;
                    for (var z = partsBStart; z < partsBLength; z++) {
                        var partB = bodyB.parts[z], pBoundsB = partB.bounds;
                        if (pBoundsA.min.x > pBoundsB.max.x || pBoundsA.max.x < pBoundsB.min.x
                            || pBoundsA.max.y < pBoundsB.min.y || pBoundsA.min.y > pBoundsB.max.y) continue;
                        var c2 = collides(partA, partB, pairs);
                        if (c2) collisions[collisionIndex++] = c2;
                    }
                }
            }
        }
    }
    if (collisions.length !== collisionIndex) collisions.length = collisionIndex;
    return collisions;
}

const detector = { bodies: bodies.slice(0), pairs: null, collisions: [] };

// correctness: same pair set, same order
recorder = []; oldCollisions(detector); const oldPairs = recorder.slice();
recorder = []; newCollisions(detector); const newPairs = recorder.slice();
recorder = null;
if (oldPairs.length !== newPairs.length || oldPairs.some((v, i) => v !== newPairs[i])) {
    console.error('MISMATCH pairs', oldPairs.length, newPairs.length); process.exit(1);
}
console.log('correctness: OK (' + oldPairs.length + ' candidate pairs, identical)');

// middle: hoist boundsA local + hoist filterA, but KEEP canCollide call (no dup logic)
function midCollisions(detector) {
    var pairs = detector.pairs, bodies = detector.bodies, bodiesLength = bodies.length,
        canCollide = Matter.Detector.canCollide, collides = collidesStub,
        collisions = detector.collisions, collisionIndex = 0, i, j;
    bodies.sort(Matter.Detector._compareBoundsX);
    for (i = 0; i < bodiesLength; i++) {
        var bodyA = bodies[i], boundsA = bodyA.bounds,
            boundXMax = boundsA.max.x, boundYMax = boundsA.max.y, boundYMin = boundsA.min.y,
            bodyAStatic = bodyA.isStatic || bodyA.isSleeping,
            partsALength = bodyA.parts.length, partsASingle = partsALength === 1,
            filterA = bodyA.collisionFilter;
        for (j = i + 1; j < bodiesLength; j++) {
            var bodyB = bodies[j], boundsB = bodyB.bounds;
            if (boundsB.min.x > boundXMax) break;
            if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) continue;
            if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) continue;
            if (!canCollide(filterA, bodyB.collisionFilter)) continue;
            var partsBLength = bodyB.parts.length;
            if (partsASingle && partsBLength === 1) {
                var collision = collides(bodyA, bodyB, pairs);
                if (collision) collisions[collisionIndex++] = collision;
            } else {
                var partsAStart = partsALength > 1 ? 1 : 0, partsBStart = partsBLength > 1 ? 1 : 0;
                for (var k = partsAStart; k < partsALength; k++) {
                    var partA = bodyA.parts[k], pBoundsA = partA.bounds;
                    for (var z = partsBStart; z < partsBLength; z++) {
                        var partB = bodyB.parts[z], pBoundsB = partB.bounds;
                        if (pBoundsA.min.x > pBoundsB.max.x || pBoundsA.max.x < pBoundsB.min.x
                            || pBoundsA.max.y < pBoundsB.min.y || pBoundsA.min.y > pBoundsB.max.y) continue;
                        var c2 = collides(partA, partB, pairs);
                        if (c2) collisions[collisionIndex++] = c2;
                    }
                }
            }
        }
    }
    if (collisions.length !== collisionIndex) collisions.length = collisionIndex;
    return collisions;
}

bench('Detector broadphase: old vs new(full inline)', {
    old: () => oldCollisions(detector),
    new: () => newCollisions(detector),
}, 20, 30_000, () => null);

bench('Detector broadphase: old vs mid(hoist+call)', {
    old: () => oldCollisions(detector),
    mid: () => midCollisions(detector),
}, 20, 30_000, () => null);
