/* eslint-env node */
// Internal breakdown of Collision.collides (the ~38% hot spot).
// Captures the real (bodyA, bodyB) argument pairs the detector feeds to collides
// during steady-state frames, then times: (1) full collides, (2) SAT-only
// (_overlapAxes x2), to see how much is projection vs support-finding.
"use strict";

const M = require('../build/matter.dev.js');
const { Engine, Composite, Bodies, Body, Collision } = M;

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
for (let i = 0; i < 30; i++) {
    const c = Bodies.circle(60 + rand() * 680, rand() * 400, 6 + rand() * 6);
    Body.setVelocity(c, { x: (rand() - 0.5) * 20, y: rand() * 10 });
    Composite.add(engine.world, c);
}
const delta = 1000 / 60;

// capture the (bodyA, bodyB) pairs collides is called with on one steady frame
let capture = null, pairsObj = null;
const origCollides = Collision.collides;
let capturing = false;
Collision.collides = function (a, b, pairs) {
    if (capturing) { capture.push([a, b]); pairsObj = pairs; }
    return origCollides(a, b, pairs);
};
for (let i = 0; i < 300; i++) Engine.update(engine, delta);
capture = [];
capturing = true;
Engine.update(engine, delta);
capturing = false;
Collision.collides = origCollides;

let hits = 0;
for (const [a, b] of capture) if (origCollides(a, b, pairsObj)) hits++;
console.log('captured collides calls:', capture.length, '| actually collide:', hits,
    '(' + (100 * hits / capture.length).toFixed(0) + '%)');

const overlapAxes = Collision._overlapAxes;
const _AB = { overlap: 0, axis: null }, _BA = { overlap: 0, axis: null };
function satOnly(a, b) {
    overlapAxes(_AB, a.vertices, b.vertices, a.axes);
    if (_AB.overlap <= 0) return null;
    overlapAxes(_BA, b.vertices, a.vertices, b.axes);
    return _BA.overlap;
}

const hr = () => Number(process.hrtime.bigint());
function time(fn, label) {
    const rounds = 50, warm = 10, batch = 400;
    const s = [];
    for (let r = 0; r < rounds + warm; r++) {
        const t = hr();
        for (let k = 0; k < batch; k++) for (const [a, b] of capture) fn(a, b, pairsObj);
        const us = (hr() - t) / 1e3 / batch;
        if (r >= warm) s.push(us);
    }
    s.sort((x, y) => x - y);
    console.log(label.padEnd(28) + s[s.length >> 1].toFixed(2) + ' us/frame-worth (' + capture.length + ' calls)');
    return s[s.length >> 1];
}

const full = time((a, b, p) => origCollides(a, b, p), 'full collides');
const sat = time((a, b) => satOnly(a, b), 'SAT only (_overlapAxes x2)');
console.log('\nsupport-finding + setup share: ' + ((1 - sat / full) * 100).toFixed(0) + '% of collides');
