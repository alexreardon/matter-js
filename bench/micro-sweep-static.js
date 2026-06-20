/* eslint-env node */
// Broadphase SWEEP cost in the static-heavy (page-destroyer) regime: a dense
// grid of static tiles plus dynamic debris. Compares the current sweep against
// two output-identical variants:
//   new  = inline canCollide + hoist bodyA collisionFilter fields
//   new2 = new + move the static/static skip ahead of the y-overlap test
// Both must emit the identical candidate-pair list IN THE SAME ORDER, which is
// what keeps Engine.update bit-identical (same collisions array -> same pairs
// -> same resolver order). Collides is stubbed so we time the sweep only.
"use strict";

const Matter = require('../build/matter.js');
const { Bodies, Body, Composite, Engine } = Matter;

let s = 24681;
const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

const engine = Engine.create({ enableSleeping: false });
const world = engine.world;
Composite.add(world, Bodies.rectangle(600, 910, 1300, 60, { isStatic: true }));
for (let row = 0; row < 18; row++) {
    for (let col = 0; col < 30; col++) {
        Composite.add(world, Bodies.rectangle(40 + col * 40, 40 + row * 32, 36, 28, { isStatic: true }));
    }
}
for (let i = 0; i < 320; i++) {
    const b = Bodies.rectangle(60 + rnd() * 1080, -40 - rnd() * 600, 16 + rnd() * 22, 16 + rnd() * 22, { friction: 0.4, restitution: 0.2 });
    Body.setAngle(b, rnd() * Math.PI);
    Composite.add(world, b);
}
const delta = 1000 / 60;
for (let i = 0; i < 300; i++) Engine.update(engine, delta);

const bodies = engine.detector.bodies.slice(0);
console.log('bodies:', bodies.length);

let recorder = null;
const collides = (a, b) => { if (recorder) recorder.push(a.id * 100000 + b.id); return null; };
const canCollide = Matter.Detector.canCollide;
const compareBoundsX = Matter.Detector._compareBoundsX;

function oldSweep() {
    var bodiesLength = bodies.length, collisions = [], collisionIndex = 0, i, j;
    bodies.sort(compareBoundsX);
    for (i = 0; i < bodiesLength; i++) {
        var bodyA = bodies[i], boundXMax = bodyA.bounds.max.x, boundYMax = bodyA.bounds.max.y,
            boundYMin = bodyA.bounds.min.y, bodyAStatic = bodyA.isStatic || bodyA.isSleeping;
        for (j = i + 1; j < bodiesLength; j++) {
            var bodyB = bodies[j], boundsB = bodyB.bounds;
            if (boundsB.min.x > boundXMax) break;
            if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) continue;
            if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) continue;
            if (!canCollide(bodyA.collisionFilter, bodyB.collisionFilter)) continue;
            var c = collides(bodyA, bodyB); if (c) collisions[collisionIndex++] = c;
        }
    }
    return collisions;
}

function newSweep() {
    var bodiesLength = bodies.length, collisions = [], collisionIndex = 0, i, j;
    bodies.sort(compareBoundsX);
    for (i = 0; i < bodiesLength; i++) {
        var bodyA = bodies[i], boundXMax = bodyA.bounds.max.x, boundYMax = bodyA.bounds.max.y,
            boundYMin = bodyA.bounds.min.y, bodyAStatic = bodyA.isStatic || bodyA.isSleeping,
            filterA = bodyA.collisionFilter, groupA = filterA.group, categoryA = filterA.category, maskA = filterA.mask;
        for (j = i + 1; j < bodiesLength; j++) {
            var bodyB = bodies[j], boundsB = bodyB.bounds;
            if (boundsB.min.x > boundXMax) break;
            if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) continue;
            if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) continue;
            var filterB = bodyB.collisionFilter;
            if (groupA === filterB.group && groupA !== 0) { if (groupA < 0) continue; }
            else if ((maskA & filterB.category) === 0 || (filterB.mask & categoryA) === 0) continue;
            var c = collides(bodyA, bodyB); if (c) collisions[collisionIndex++] = c;
        }
    }
    return collisions;
}

function new2Sweep() {
    var bodiesLength = bodies.length, collisions = [], collisionIndex = 0, i, j;
    bodies.sort(compareBoundsX);
    for (i = 0; i < bodiesLength; i++) {
        var bodyA = bodies[i], boundXMax = bodyA.bounds.max.x, boundYMax = bodyA.bounds.max.y,
            boundYMin = bodyA.bounds.min.y, bodyAStatic = bodyA.isStatic || bodyA.isSleeping,
            filterA = bodyA.collisionFilter, groupA = filterA.group, categoryA = filterA.category, maskA = filterA.mask;
        for (j = i + 1; j < bodiesLength; j++) {
            var bodyB = bodies[j], boundsB = bodyB.bounds;
            if (boundsB.min.x > boundXMax) break;
            if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) continue;
            if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) continue;
            var filterB = bodyB.collisionFilter;
            if (groupA === filterB.group && groupA !== 0) { if (groupA < 0) continue; }
            else if ((maskA & filterB.category) === 0 || (filterB.mask & categoryA) === 0) continue;
            var c = collides(bodyA, bodyB); if (c) collisions[collisionIndex++] = c;
        }
    }
    return collisions;
}

function capture(fn) { recorder = []; fn(); const r = recorder; recorder = null; return r; }
const oldPairs = capture(oldSweep), newPairs = capture(newSweep), new2Pairs = capture(new2Sweep);
function same(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
console.log('new  identical order:', same(oldPairs, newPairs), '(' + oldPairs.length + ' pairs)');
console.log('new2 identical order:', same(oldPairs, new2Pairs));
if (!same(oldPairs, newPairs) || !same(oldPairs, new2Pairs)) { console.error('MISMATCH'); process.exit(1); }

const hr = () => Number(process.hrtime.bigint());
const variants = { old: oldSweep, new: newSweep, new2: new2Sweep };
const rounds = 40, warm = 8, iters = 4000;
const results = { old: [], new: [], new2: [] };
for (let r = 0; r < rounds + warm; r++) {
    for (const k of Object.keys(variants)) {
        const fn = variants[k];
        const t = hr();
        for (let i = 0; i < iters; i++) fn();
        const us = (hr() - t) / 1e3 / iters;
        if (r >= warm) results[k].push(us);
    }
}
const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
const mo = med(results.old), mn = med(results.new), m2 = med(results.new2);
console.log('\nold  ' + mo.toFixed(3) + ' us/sweep');
console.log('new  ' + mn.toFixed(3) + ' us/sweep  => ' + ((mo / mn - 1) * 100).toFixed(2) + '% faster than old');
console.log('new2 ' + m2.toFixed(3) + ' us/sweep  => ' + ((mo / m2 - 1) * 100).toFixed(2) + '% faster than old');
