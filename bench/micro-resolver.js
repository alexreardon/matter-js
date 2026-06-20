/* eslint-env node */
// Isolated function-level A/B for Resolver.solveVelocity.
// Captures the real `pairs.list` from a warmed scene, snapshots every field the
// solver mutates, then times OLD vs NEW implementations on identically-reset
// data, interleaved round-by-round in one process (cancels machine noise).
"use strict";

const M = require('../build/matter.dev.js');
const { Engine, Composite, Bodies, Body, Common, Resolver } = M;

// ---- build a page-destroyer-like scene, warm to steady state ----
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const engine = Engine.create({ enableSleeping: false });
const world = engine.world;
Composite.add(world, [
    Bodies.rectangle(400, 610, 1200, 60, { isStatic: true }),
    Bodies.rectangle(-10, 300, 60, 700, { isStatic: true }),
    Bodies.rectangle(810, 300, 60, 700, { isStatic: true })
]);
for (let i = 0; i < 350; i++) {
    const b = Bodies.rectangle(60 + rand() * 680, rand() * 500, 18 + rand() * 26, 18 + rand() * 26, { friction: 0.4, restitution: 0.2 });
    Body.setAngle(b, rand() * Math.PI);
    Composite.add(world, b);
}
for (let i = 0; i < 30; i++) {
    const c = Bodies.circle(60 + rand() * 680, rand() * 400, 6 + rand() * 6);
    Body.setVelocity(c, { x: (rand() - 0.5) * 20, y: rand() * 10 });
    Composite.add(world, c);
}

const delta = 1000 / 60;

// capture pairs.list on a steady-state frame
let captured = null;
const origSV = Resolver.solveVelocity;
Resolver.solveVelocity = function(pairs, d) {
    if (!captured) captured = pairs;
    return origSV(pairs, d);
};
for (let i = 0; i < 320; i++) Engine.update(engine, delta);
Resolver.solveVelocity = origSV;

const pairs = captured.slice(0);
let activeContacts = 0, activePairs = 0;
for (const p of pairs) if (p.isActive && !p.isSensor) { activePairs++; activeContacts += p.contactCount; }
console.log('captured pairs:', pairs.length, '| active:', activePairs, '| active contacts:', activeContacts);

// ---- snapshot the mutable fields so each timed call starts identical ----
const bodySet = new Set();
for (const p of pairs) { bodySet.add(p.collision.parentA); bodySet.add(p.collision.parentB); }
const bodies = [...bodySet];
const bodySnap = bodies.map(b => ({ b, ppx: b.positionPrev.x, ppy: b.positionPrev.y, ap: b.anglePrev }));
const contactSnap = [];
for (const p of pairs) for (let j = 0; j < p.contactCount; j++) {
    const c = p.contacts[j];
    contactSnap.push({ c, ni: c.normalImpulse, ti: c.tangentImpulse });
}
function reset() {
    for (const s of bodySnap) { s.b.positionPrev.x = s.ppx; s.b.positionPrev.y = s.ppy; s.b.anglePrev = s.ap; }
    for (const s of contactSnap) { s.c.normalImpulse = s.ni; s.c.tangentImpulse = s.ti; }
}

// ---- constants captured from the build ----
const baseDelta = Common._baseDelta;
const C_restingThresh = Resolver._restingThresh;
const C_restingThreshTangent = Resolver._restingThreshTangent;
const C_frictionNormalMultiplier = Resolver._frictionNormalMultiplier;
const C_frictionMaxStatic = Resolver._frictionMaxStatic;

// ---- OLD implementation (release: re-reads body props per contact) ----
function solveVelocityOld(pairs, delta) {
    var timeScale = delta / baseDelta,
        timeScaleSquared = timeScale * timeScale,
        timeScaleCubed = timeScaleSquared * timeScale,
        restingThresh = -C_restingThresh * timeScale,
        restingThreshTangent = C_restingThreshTangent,
        frictionNormalMultiplier = C_frictionNormalMultiplier * timeScale,
        frictionMaxStatic = C_frictionMaxStatic,
        pairsLength = pairs.length,
        tangentImpulse, maxFriction, i, j;

    for (i = 0; i < pairsLength; i++) {
        var pair = pairs[i];
        if (!pair.isActive || pair.isSensor) continue;
        var collision = pair.collision,
            bodyA = collision.parentA, bodyB = collision.parentB,
            normalX = collision.normal.x, normalY = collision.normal.y,
            tangentX = collision.tangent.x, tangentY = collision.tangent.y,
            inverseMassTotal = pair.inverseMass,
            friction = pair.friction * pair.frictionStatic * frictionNormalMultiplier,
            contacts = pair.contacts, contactCount = pair.contactCount,
            contactShare = 1 / contactCount;
        var bodyAVelocityX = bodyA.position.x - bodyA.positionPrev.x,
            bodyAVelocityY = bodyA.position.y - bodyA.positionPrev.y,
            bodyAAngularVelocity = bodyA.angle - bodyA.anglePrev,
            bodyBVelocityX = bodyB.position.x - bodyB.positionPrev.x,
            bodyBVelocityY = bodyB.position.y - bodyB.positionPrev.y,
            bodyBAngularVelocity = bodyB.angle - bodyB.anglePrev;
        for (j = 0; j < contactCount; j++) {
            var contact = contacts[j], contactVertex = contact.vertex;
            var offsetAX = contactVertex.x - bodyA.position.x,
                offsetAY = contactVertex.y - bodyA.position.y,
                offsetBX = contactVertex.x - bodyB.position.x,
                offsetBY = contactVertex.y - bodyB.position.y;
            var velocityPointAX = bodyAVelocityX - offsetAY * bodyAAngularVelocity,
                velocityPointAY = bodyAVelocityY + offsetAX * bodyAAngularVelocity,
                velocityPointBX = bodyBVelocityX - offsetBY * bodyBAngularVelocity,
                velocityPointBY = bodyBVelocityY + offsetBX * bodyBAngularVelocity;
            var relativeVelocityX = velocityPointAX - velocityPointBX,
                relativeVelocityY = velocityPointAY - velocityPointBY;
            var normalVelocity = normalX * relativeVelocityX + normalY * relativeVelocityY,
                tangentVelocity = tangentX * relativeVelocityX + tangentY * relativeVelocityY;
            var normalOverlap = pair.separation + normalVelocity;
            var normalForce = Math.min(normalOverlap, 1);
            normalForce = normalOverlap < 0 ? 0 : normalForce;
            var frictionLimit = normalForce * friction;
            if (tangentVelocity < -frictionLimit || tangentVelocity > frictionLimit) {
                maxFriction = (tangentVelocity > 0 ? tangentVelocity : -tangentVelocity);
                tangentImpulse = pair.friction * (tangentVelocity > 0 ? 1 : -1) * timeScaleCubed;
                if (tangentImpulse < -maxFriction) tangentImpulse = -maxFriction;
                else if (tangentImpulse > maxFriction) tangentImpulse = maxFriction;
            } else {
                tangentImpulse = tangentVelocity;
                maxFriction = frictionMaxStatic;
            }
            var oAcN = offsetAX * normalY - offsetAY * normalX,
                oBcN = offsetBX * normalY - offsetBY * normalX,
                share = contactShare / (inverseMassTotal + bodyA.inverseInertia * oAcN * oAcN + bodyB.inverseInertia * oBcN * oBcN);
            var normalImpulse = (1 + pair.restitution) * normalVelocity * share;
            tangentImpulse *= share;
            if (normalVelocity < restingThresh) {
                contact.normalImpulse = 0;
            } else {
                var contactNormalImpulse = contact.normalImpulse;
                contact.normalImpulse += normalImpulse;
                if (contact.normalImpulse > 0) contact.normalImpulse = 0;
                normalImpulse = contact.normalImpulse - contactNormalImpulse;
            }
            if (tangentVelocity < -restingThreshTangent || tangentVelocity > restingThreshTangent) {
                contact.tangentImpulse = 0;
            } else {
                var contactTangentImpulse = contact.tangentImpulse;
                contact.tangentImpulse += tangentImpulse;
                if (contact.tangentImpulse < -maxFriction) contact.tangentImpulse = -maxFriction;
                if (contact.tangentImpulse > maxFriction) contact.tangentImpulse = maxFriction;
                tangentImpulse = contact.tangentImpulse - contactTangentImpulse;
            }
            var impulseX = normalX * normalImpulse + tangentX * tangentImpulse,
                impulseY = normalY * normalImpulse + tangentY * tangentImpulse;
            if (!(bodyA.isStatic || bodyA.isSleeping)) {
                bodyA.positionPrev.x += impulseX * bodyA.inverseMass;
                bodyA.positionPrev.y += impulseY * bodyA.inverseMass;
                bodyA.anglePrev += (offsetAX * impulseY - offsetAY * impulseX) * bodyA.inverseInertia;
            }
            if (!(bodyB.isStatic || bodyB.isSleeping)) {
                bodyB.positionPrev.x -= impulseX * bodyB.inverseMass;
                bodyB.positionPrev.y -= impulseY * bodyB.inverseMass;
                bodyB.anglePrev -= (offsetBX * impulseY - offsetBY * impulseX) * bodyB.inverseInertia;
            }
        }
    }
}

// NEW implementation: use the build's actual (edited) Resolver.solveVelocity
const solveVelocityNew = Resolver.solveVelocity;

// ---- correctness: both must produce identical mutations ----
function snapshotState() {
    const out = [];
    for (const s of bodySnap) out.push(s.b.positionPrev.x, s.b.positionPrev.y, s.b.anglePrev);
    for (const s of contactSnap) out.push(s.c.normalImpulse, s.c.tangentImpulse);
    return out;
}
reset(); for (let k = 0; k < 4; k++) solveVelocityOld(pairs, delta);
const stateOld = snapshotState();
reset(); for (let k = 0; k < 4; k++) solveVelocityNew(pairs, delta);
const stateNew = snapshotState();
let identical = stateOld.length === stateNew.length;
for (let k = 0; identical && k < stateOld.length; k++) if (stateOld[k] !== stateNew[k]) identical = false;
console.log('bit-identical output:', identical);

// ---- timed interleaved A/B ----
const iters = 4;            // velocity iterations per frame (engine default)
const callsPerRound = 2000; // solveVelocity calls timed per round
const rounds = 60, warmRounds = 10;
const A = { name: 'OLD (re-read per contact)', fn: solveVelocityOld, s: [] };
const B = { name: 'NEW (hoisted invariants) ', fn: solveVelocityNew, s: [] };

const hr = () => Number(process.hrtime.bigint());
for (let r = 0; r < rounds + warmRounds; r++) {
    for (const S of [A, B]) {
        reset();
        const fn = S.fn;
        const t = hr();
        for (let c = 0; c < callsPerRound; c++) {
            for (let it = 0; it < iters; it++) fn(pairs, delta);
        }
        const us = (hr() - t) / 1e3 / callsPerRound;
        if (r >= warmRounds) S.s.push(us);
    }
}
const med = s => { s = s.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
const ma = med(A.s), mb = med(B.s);
console.log(A.name + ': ' + ma.toFixed(3) + ' us/call (x' + iters + ' iters)');
console.log(B.name + ': ' + mb.toFixed(3) + ' us/call (x' + iters + ' iters)');
console.log('\nNEW vs OLD: ' + ((ma / mb - 1) * 100).toFixed(2) + '% ' + (mb < ma ? 'faster' : 'SLOWER'));
