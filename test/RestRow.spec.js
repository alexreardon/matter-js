/* eslint-env es6, jest */
"use strict";

// Guards for the velocity solver's REST ROW: a static body that is not moving
// and has an inverse inertia of exactly +0 is given a constant zero row in
// `Resolver.preSolveVelocity` instead of a read of the body, on the strength of
// `body._restStatic` (see `Common._isRestingStatic`).
//
// The flag is only as good as the writers that keep it, so the differential
// below runs every scene twice: once as shipped, and once with the predicate
// patched to always answer false, which reads every body's real row the way
// the solver did before the zero row existed. The two must fingerprint
// identically at every update, on a scene that gives statics a velocity
// through every `Body` method that can (the moving-static cases the zero row
// must never be used for), freezes bodies that still carry a position impulse,
// and keeps a plain resting page that the zero row IS used for. A NEGATIVE
// control forces the flag on for the statics that move and must diverge, so a
// fingerprint that cannot see the substitution cannot pass silently.

const Common = require('../src/core/Common');
const Engine = require('../src/core/Engine');
const Bodies = require('../src/factory/Bodies');
const Body = require('../src/body/Body');
const Composite = require('../src/body/Composite');
const Detector = require('../src/collision/Detector');
const Resolver = require('../src/collision/Resolver');

const STEPS = 240;

const scratch64 = new Float64Array(1);
const scratch32 = new Uint32Array(scratch64.buffer);

// FNV-1a over the exact bits (so +0 and -0 differ, and NaN is one value)
function mix(hash, value) {
    scratch64[0] = value;
    hash = Math.imul(hash ^ scratch32[0], 16777619);
    return Math.imul(hash ^ scratch32[1], 16777619);
}

function fingerprint(engine) {
    let hash = 2166136261;
    for (const body of Composite.allBodies(engine.world)) {
        hash = mix(hash, body.id);
        hash = mix(hash, body.position.x);
        hash = mix(hash, body.position.y);
        hash = mix(hash, body.positionPrev.x);
        hash = mix(hash, body.positionPrev.y);
        hash = mix(hash, body.angle);
        hash = mix(hash, body.anglePrev);
        hash = mix(hash, body.positionImpulse.x);
        hash = mix(hash, body.positionImpulse.y);
        for (const vertex of body.vertices) {
            hash = mix(hash, vertex.x);
            hash = mix(hash, vertex.y);
        }
    }
    // the warm-start state the next update starts from
    for (const pair of engine.pairs.list) {
        hash = mix(hash, pair.id);
        hash = mix(hash, pair.contacts[0].normalImpulse);
        hash = mix(hash, pair.contacts[0].tangentImpulse);
        hash = mix(hash, pair.contacts[1].normalImpulse);
        hash = mix(hash, pair.contacts[1].tangentImpulse);
    }
    return hash;
}

function firstDivergence(a, b) {
    return a.findIndex((hash, index) => hash !== b[index]);
}

// summed over every update: `restSlots`, the resting statics with a slot of
// their own (an impulse other than +0) that took the zero row; `shared`, the
// resting statics that took the shared slot 0 instead (these are not in
// `_solverBodies`); and the position corrections applied to a flagged static
function withProbes(fn) {
    const postSolveBody = Resolver._postSolveBody;
    const probe = { restSlots: 0, shared: 0, flaggedCorrections: 0 };
    Resolver._postSolveBody = function(body, deferBounds) {
        if (body._restStatic === true) {
            probe.flaggedCorrections++;
        }
        return postSolveBody(body, deferBounds);
    };
    try {
        return Object.assign(fn(probe), { probe });
    } finally {
        Resolver._postSolveBody = postSolveBody;
    }
}

// the statics this scene moves, each through a different method, plus a page
// of resting tiles, rain, and freezes of bodies still carrying an impulse
function run({ restRow = true, options = {}, beforeUpdate = null } = {}) {
    const isRestingStatic = Common._isRestingStatic;
    if (!restRow) {
        Common._isRestingStatic = () => false;
    }

    try {
        return withProbes((probe) => {
            Common._nextId = 0;

            let seed = 13579;
            const rand = () => {
                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                return seed / 0x7fffffff;
            };

            const engine = Engine.create(Object.assign({ enableSleeping: false, detector: Detector.create({ broadphase: 'grid', cellSize: 32 }) }, options));
            const world = engine.world;

            // a resting floor and a page of resting tiles
            for (let i = 0; i < 24; i++) {
                Composite.add(world, Bodies.rectangle(20 + i * 40, 780, 40, 40, { isStatic: true }));
            }
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 8; col++) {
                    const tile = Bodies.rectangle(80 + col * 110, 420 + row * 60, 60, 20);
                    Body.setStatic(tile, true);
                    Composite.add(world, tile);
                }
            }

            const kinematic = (x, y) => {
                const body = Bodies.rectangle(x, y, 120, 20);
                Body.setStatic(body, true);
                Composite.add(world, body);
                return body;
            };

            // a conveyor: a static given a velocity once, which it keeps
            const conveyor = kinematic(120, 300);
            Body.setVelocity(conveyor, { x: 2, y: 0 });
            // a spinner: a static given an angular velocity once
            const spinner = kinematic(320, 300);
            Body.setAngularVelocity(spinner, 0.03);
            // a piston, moved every update with the velocity inferred
            const piston = kinematic(520, 300);
            // a rotor, turned every update with the velocity inferred
            const rotor = kinematic(720, 300);
            // a slider, moved every update WITHOUT a velocity: the page's
            // moving static, which stays a resting static
            const slider = kinematic(900, 300);
            // a heavy static: a static given a finite mass and inertia
            const heavy = kinematic(120, 150);
            Body.setMass(heavy, 4);
            // a static whose angle was set with the velocity inferred once
            const tilted = kinematic(320, 150);
            Body.setAngle(tilted, 0.2, true);
            // a static translated once with the velocity inferred
            const pushed = kinematic(520, 150);
            Body.translate(pushed, { x: 1.5, y: 0 }, true);

            const moving = [conveyor, spinner, piston, rotor, heavy, tilted, pushed];

            const live = [];
            const hashes = [];
            let refrozen = 0;
            let restStaticsSeen = 0;

            for (let step = 0; step < STEPS; step++) {
                // rain onto everything
                for (let k = 0; k < 3; k++) {
                    const box = Bodies.rectangle(40 + rand() * 900, 20 + rand() * 60, 14 + rand() * 10, 14 + rand() * 10);
                    Body.setVelocity(box, { x: (rand() - 0.5) * 4, y: 2 + rand() * 3 });
                    Composite.add(world, box);
                    live.push({ body: box, born: step });
                }

                // freeze a body released on an EARLIER update, often while it
                // still carries a decaying position impulse
                const pick = live[Math.floor(rand() * live.length)];
                if (pick && pick.born !== step && !pick.body.isStatic) {
                    Body.setStatic(pick.body, true);
                    refrozen++;
                }
                while (live.length > 0 && step - live[0].born > 90) {
                    Composite.remove(world, live.shift().body);
                }

                const phase = step * 0.05;
                Body.setPosition(piston, { x: 520 + Math.sin(phase) * 30, y: 300 }, true);
                Body.setAngle(rotor, rotor.angle + 0.02, true);
                Body.setPosition(slider, { x: 900 + Math.sin(phase) * 20, y: 300 });

                if (beforeUpdate) {
                    beforeUpdate({ moving });
                }

                Engine.update(engine, 1000 / 60);
                hashes.push(fingerprint(engine));

                probe.restSlots += engine.pairs._solverBodies.filter((body) => body._restStatic).length;
                const epoch = engine.pairs._solverEpoch;
                probe.shared += Composite.allBodies(world).filter((body) => body._solverStamp === epoch && body._solverIndex === 0).length;
                restStaticsSeen = Math.max(restStaticsSeen, Composite.allBodies(world).filter((body) => body._restStatic).length);
            }

            return { hashes, refrozen, restStaticsSeen, moving, slider, engine };
        });
    } finally {
        Common._isRestingStatic = isRestingStatic;
    }
}

describe('rest row: the flag', () => {
    const makeStatic = (x = 100, y = 100) => {
        const body = Bodies.rectangle(x, y, 40, 20);
        Body.setStatic(body, true);
        return body;
    };

    test('freezing sets it, releasing clears it, and a dynamic body never has it', () => {
        const body = Bodies.rectangle(100, 100, 40, 20);
        expect(body._restStatic).toBe(false);
        Body.setStatic(body, true);
        expect(body._restStatic).toBe(true);
        Body.setStatic(body, false);
        expect(body._restStatic).toBe(false);
        expect(Bodies.rectangle(0, 0, 10, 10, { isStatic: true })._restStatic).toBe(true);
    });

    test('a velocity clears it, and a zero velocity gives it back', () => {
        const body = makeStatic();
        Body.setVelocity(body, { x: 1, y: 0 });
        expect(body._restStatic).toBe(false);
        Body.setVelocity(body, { x: 0, y: 0 });
        expect(body._restStatic).toBe(true);
        Body.setAngularVelocity(body, 0.1);
        expect(body._restStatic).toBe(false);
        Body.setAngularVelocity(body, 0);
        expect(body._restStatic).toBe(true);
        Body.setVelocity(body, { x: 0, y: 1 });
        expect(body._restStatic).toBe(false);
        Body.setSpeed(body, 0);
        expect(body._restStatic).toBe(true);
    });

    test('a move keeps it, a move that infers a velocity clears it', () => {
        const body = makeStatic();
        Body.setPosition(body, { x: 130, y: 90 });
        Body.setAngle(body, 0.4);
        Body.setPositionAndAngle(body, 140, 95, 0.5);
        Body.translate(body, { x: 3, y: 1 });
        Body.rotate(body, 0.1);
        expect(body._restStatic).toBe(true);
        Body.setPosition(body, { x: 150, y: 90 }, true);
        expect(body._restStatic).toBe(false);

        const turned = makeStatic();
        Body.setAngle(turned, 0.3, true);
        expect(turned._restStatic).toBe(false);

        const rotated = makeStatic();
        Body.rotate(rotated, 0.3, null, true);
        expect(rotated._restStatic).toBe(false);
    });

    test('a finite mass or inertia on a static clears it', () => {
        const massive = makeStatic();
        Body.setMass(massive, 5);
        expect(massive._restStatic).toBe(false);
        const dense = makeStatic();
        Body.setDensity(dense, 0.002);
        expect(dense._restStatic).toBe(false);
        const inert = makeStatic();
        Body.setInertia(inert, 100);
        expect(inert._restStatic).toBe(false);
        Body.setInertia(inert, Infinity);
        expect(inert._restStatic).toBe(true);
    });

    test('scaling about a point other than the position clears it', () => {
        const aboutPosition = makeStatic();
        Body.scale(aboutPosition, 1.5, 1.5);
        expect(aboutPosition.inverseInertia).toBe(0);
        expect(aboutPosition._restStatic).toBe(true);
        const aboutOrigin = makeStatic();
        Body.scale(aboutOrigin, 1.5, 1.5, { x: 0, y: 0 });
        expect(aboutOrigin._restStatic).toBe(false);
    });

    test('a -0 difference is not a rest row, and neither is a non-finite position', () => {
        // position.x is -0 and positionPrev.x +0, so position - positionPrev is -0
        const signed = Bodies.rectangle(-0, 100, 40, 20);
        Body.setStatic(signed, true);
        expect(Object.is(signed.position.x, -0)).toBe(true);
        expect(signed._restStatic).toBe(true);
        Body.set(signed, 'positionPrev', { x: 0, y: signed.position.y });
        expect(signed._restStatic).toBe(false);

        const lost = Bodies.rectangle(100, 100, 40, 20);
        Body.setPosition(lost, { x: NaN, y: 100 });
        Body.setStatic(lost, true);
        expect(lost._restStatic).toBe(false);

        const far = makeStatic();
        Body.setPosition(far, { x: Infinity, y: 100 });
        expect(far._restStatic).toBe(false);

        const fused = makeStatic();
        Body.setPositionAndAngle(fused, Infinity, 100, 0.5);
        expect(fused._restStatic).toBe(false);

        const centred = makeStatic();
        Body.setCentre(centred, { x: 101, y: 100 });
        expect(centred._restStatic).toBe(true);
        Body.setCentre(centred, { x: NaN, y: 100 });
        expect(centred._restStatic).toBe(false);

        // the engine never integrates a static, but a direct call can
        const integrated = makeStatic();
        Body.update(integrated, 1000 / 60);
        expect(integrated._restStatic).toBe(true);
        integrated.force.x = Infinity;
        Body.update(integrated, 1000 / 60);
        expect(integrated._restStatic).toBe(false);
    });

    test('a plain assignment through Body.set is checked', () => {
        const body = makeStatic();
        Body.set(body, 'anglePrev', body.angle - 0.1);
        expect(body._restStatic).toBe(false);
        const inert = makeStatic();
        Body.set(inert, 'inverseInertia', 0.5);
        expect(inert._restStatic).toBe(false);
    });

    test('a position correction that leaves a static non-finite clears it', () => {
        const body = makeStatic();
        body.positionImpulse.x = NaN;
        Resolver._postSolveBody(body, false);
        expect(body._restStatic).toBe(false);

        const kept = makeStatic();
        kept.positionImpulse.x = 0.25;
        Resolver._postSolveBody(kept, false);
        expect(kept._restStatic).toBe(true);
    });
});

describe('rest row: the solve', () => {
    test('the zero row is bit-identical to reading every row, and the scene uses it and moves statics', () => {
        const shipped = run();
        const reference = run({ restRow: false });

        expect(firstDivergence(shipped.hashes, reference.hashes)).toBe(-1);
        // the zero row is used, in a slot of its own and in the shared slot 0,
        // and never for a static that moves
        expect(shipped.probe.restSlots).toBeGreaterThan(1000);
        expect(reference.probe.restSlots).toBe(0);
        expect(shipped.probe.shared).toBeGreaterThan(1000);
        expect(reference.probe.shared).toBe(0);
        shipped.moving.forEach((body) => expect(body._restStatic).toBe(false));
        expect(shipped.slider._restStatic).toBe(true);
        // statics frozen while carrying an impulse are corrected as statics
        expect(shipped.refrozen).toBeGreaterThan(100);
        expect(shipped.probe.flaggedCorrections).toBeGreaterThan(0);
        // the moving statics are in contact with something: a reach check,
        // and a count the scene's chaos moves (the grid running a static
        // frozen with an impulse as a mover while it drifts changed the pair
        // order, and with it which three of the seven end up touching)
        const touched = new Set();
        shipped.engine.pairs.list.forEach((pair) => {
            touched.add(pair.bodyA.id);
            touched.add(pair.bodyB.id);
        });
        expect(shipped.moving.filter((body) => touched.has(body.id)).length).toBeGreaterThan(2);
    });

    test('with enableSolvedVelocityAndBounds off the zero row is bit-identical too', () => {
        const options = { enableSolvedVelocityAndBounds: false };
        const shipped = run({ options });
        const reference = run({ restRow: false, options });
        expect(firstDivergence(shipped.hashes, reference.hashes)).toBe(-1);
        expect(shipped.probe.restSlots).toBeGreaterThan(1000);
        expect(shipped.probe.shared).toBeGreaterThan(1000);
    });

    test('a resting static with a -0 impulse takes a slot of its own, not the shared slot 0, as parentA and as parentB', () => {
        Common._nextId = 0;
        const engine = Engine.create({ detector: Detector.create({ broadphase: 'grid', cellSize: 32 }) });
        const plain = Bodies.rectangle(100, 200, 80, 20, { isStatic: true });
        const signedX = Bodies.rectangle(300, 200, 80, 20, { isStatic: true });
        const signedY = Bodies.rectangle(500, 200, 80, 20, { isStatic: true });
        signedX.positionImpulse.x = -0;
        signedY.positionImpulse.y = -0;
        // a box overlapping each static, so all three are in an active pair
        Composite.add(engine.world, [plain, signedX, signedY]);
        [100, 300, 500].forEach((x) => Composite.add(engine.world, Bodies.rectangle(x, 185, 20, 20)));
        // statics created AFTER their boxes take the higher id, so each is its
        // pair's parentB (the three above are parentA): the other branch of
        // the slot 0 predicate
        const boxOfSignedB = Bodies.rectangle(700, 185, 20, 20);
        const signedB = Bodies.rectangle(700, 200, 80, 20, { isStatic: true });
        const boxOfPlainB = Bodies.rectangle(900, 185, 20, 20);
        const plainB = Bodies.rectangle(900, 200, 80, 20, { isStatic: true });
        signedB.positionImpulse.x = -0;
        Composite.add(engine.world, [boxOfSignedB, signedB, boxOfPlainB, plainB]);

        Engine.update(engine, 1000 / 60);

        const pairOf = (body) => engine.pairs.list.find((pair) => pair.bodyA === body || pair.bodyB === body);
        [plain, signedX, signedY].forEach((body) => expect(pairOf(body).collision.parentA).toBe(body));
        [signedB, plainB].forEach((body) => expect(pairOf(body).collision.parentB).toBe(body));

        const epoch = engine.pairs._solverEpoch;
        const solverBodies = engine.pairs._solverBodies;
        [plain, signedX, signedY, signedB, plainB].forEach((body) => {
            expect(body._restStatic).toBe(true);
            expect(body._solverStamp).toBe(epoch);
        });
        expect(Object.is(signedX.positionImpulse.x, -0)).toBe(true);
        expect(Object.is(signedY.positionImpulse.y, -0)).toBe(true);
        expect(Object.is(signedB.positionImpulse.x, -0)).toBe(true);
        [signedX, signedY, signedB].forEach((body) => {
            expect(body._solverIndex).toBeGreaterThan(0);
            expect(solverBodies[body._solverIndex - 1]).toBe(body);
        });
        // the +0 controls share slot 0
        [plain, plainB].forEach((body) => {
            expect(body._solverIndex).toBe(0);
            expect(solverBodies).not.toContain(body);
        });
    });

    test('NEGATIVE: the flag forced on for the statics that move diverges', () => {
        const forced = run({
            beforeUpdate: ({ moving }) => moving.forEach((body) => {
                body._restStatic = true;
            })
        });
        expect(firstDivergence(run().hashes, forced.hashes)).not.toBe(-1);
    });
});
