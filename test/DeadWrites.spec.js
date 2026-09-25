/* eslint-env es6, jest */
"use strict";

// Guards for the writes the engine stopped making because nothing reads them
// before they are overwritten.
//
// Each DEAD guard poisons a field with NaN at the point in the update where
// the dropped write used to land (the end of the update) and requires the
// whole run to stay bit-identical: a field nothing reads cannot move anything.
// Each group carries a NEGATIVE CONTROL that poisons a LIVE field the same way
// and must diverge, so a fingerprint that has stopped seeing the state cannot
// pass silently.
//
// The scene is the churn regime in miniature: statics released into debris,
// a debris body frozen back to static on a later update (the one path where
// the static index reads a body's bounds after the position solve), and age
// eviction with the page topped back up.
//
// `enableSolvedVelocityAndBounds: false` is held to the same bar from the other
// side: a run with it off must fingerprint identically to a run with it on,
// where the consumer of the run with it off DERIVES each moving body's velocity
// the way `Body.updateVelocities` does instead of reading the engine's.

const Common = require('../src/core/Common');
const Engine = require('../src/core/Engine');
const Bodies = require('../src/factory/Bodies');
const Body = require('../src/body/Body');
const Composite = require('../src/body/Composite');
const Detector = require('../src/collision/Detector');
const Collision = require('../src/collision/Collision');
const Resolver = require('../src/collision/Resolver');

const STEPS = 240;

const scratch64 = new Float64Array(1);
const scratch32 = new Uint32Array(scratch64.buffer);

// FNV-1a over the exact bits, so any last-bit difference changes the hash
function mix(hash, value) {
    scratch64[0] = value;
    hash = Math.imul(hash ^ scratch32[0], 16777619);
    return Math.imul(hash ^ scratch32[1], 16777619);
}

// what a consumer of an engine with the option off sends, derived exactly as
// Body.updateVelocities computes it
function derivedVelocity(body) {
    const timeScale = Body._baseDelta / body.deltaTime;
    return [
        (body.position.x - body.positionPrev.x) * timeScale,
        (body.position.y - body.positionPrev.y) * timeScale,
        (body.angle - body.anglePrev) * timeScale
    ];
}

function fingerprint(engine, consumer) {
    let hash = 2166136261;
    const bodies = Composite.allBodies(engine.world);
    for (const body of bodies) {
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
        if (body.isStatic || body.isSleeping) {
            // the static index's input, and a resting body's box
            hash = mix(hash, body.bounds.min.x);
            hash = mix(hash, body.bounds.max.x);
            hash = mix(hash, body.bounds.min.y);
            hash = mix(hash, body.bounds.max.y);
        }
        // the velocity a consumer reads of a MOVING body: the engine's own, or
        // derived. Not of a sleeping one: `Sleeping.set` zeroes `velocity` but
        // not `angularVelocity`, so the engine's reading there is stale where
        // the derived one is 0
        if (consumer && !body.isStatic && !body.isSleeping) {
            const velocity = consumer === 'derived'
                ? derivedVelocity(body)
                : [body.velocity.x, body.velocity.y, body.angularVelocity];
            hash = mix(hash, velocity[0]);
            hash = mix(hash, velocity[1]);
            hash = mix(hash, velocity[2]);
        }
    }
    // pair order, and the warm-start state the next update starts from
    for (const pair of engine.pairs.list) {
        hash = mix(hash, pair.id);
        hash = mix(hash, pair.contacts[0].normalImpulse);
        hash = mix(hash, pair.contacts[0].tangentImpulse);
        hash = mix(hash, pair.contacts[1].normalImpulse);
        hash = mix(hash, pair.contacts[1].tangentImpulse);
    }
    // the collision stream a consumer reads
    for (const pair of engine.pairs.collisionStart) {
        hash = mix(hash, pair.id);
    }
    return hash;
}

const SOLVED_OFF = { enableSolvedVelocityAndBounds: false };

function run({ options = {}, consumer = null, refreeze = true, pauseEvery = 0, atStepEnd = null } = {}) {
    Common._nextId = 0;
    Detector._mode = 'gridStatic';
    Detector._cellSize = 32;

    let seed = 24681;
    const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };

    const engine = Engine.create(Object.assign({ enableSleeping: false }, options));
    const world = engine.world;
    for (let i = 0; i < 12; i++) {
        Composite.add(world, Bodies.rectangle(40 + i * 80, 700, 80, 40, { isStatic: true }));
    }
    const tiles = [];
    for (let row = 0; row < 14; row++) {
        for (let col = 0; col < 24; col++) {
            // built dynamic then frozen, so a release restores a real mass
            const tile = Bodies.rectangle(30 + col * 38, 40 + row * 40, 32, 34);
            Body.setStatic(tile, true);
            Composite.add(world, tile);
            tiles.push(tile);
        }
    }

    const live = [];
    const movers = () => live.map((entry) => entry.body).filter((body) => !body.isStatic);

    const hashes = [];
    let refrozen = 0;
    for (let step = 0; step < STEPS; step++) {
        for (let k = 0; k < 6 && tiles.length > 0; k++) {
            const tile = tiles.splice(Math.floor(rand() * tiles.length), 1)[0];
            Body.setStatic(tile, false);
            Body.setVelocity(tile, { x: (rand() - 0.5) * 6, y: 4 + rand() * 4 });
            live.push({ body: tile, born: step });
        }
        // freeze a body released on an EARLIER update, often while it still
        // carries a decaying position impulse
        const pick = live[Math.floor(rand() * live.length)];
        if (refreeze && pick && pick.born !== step && !pick.body.isStatic) {
            Body.setStatic(pick.body, true);
            refrozen++;
        }
        while (live.length > 0 && step - live[0].born > 40) {
            Composite.remove(world, live.shift().body);
            // top the page back up, as windowing does
            const replacement = Bodies.rectangle(30 + rand() * 880, 40 + rand() * 520, 32, 34);
            Body.setStatic(replacement, true);
            Composite.add(world, replacement);
            tiles.push(replacement);
        }
        // a paused update (timeScale 0) integrates nothing but still solves
        const paused = pauseEvery > 0 && step % pauseEvery === pauseEvery - 1;
        engine.timing.timeScale = paused ? 0 : 1;
        Engine.update(engine, 1000 / 60);
        hashes.push(fingerprint(engine, consumer));
        if (atStepEnd) {
            // told whether the NEXT update is paused
            atStepEnd({ engine, movers: movers(), beforePause: pauseEvery > 0 && (step + 1) % pauseEvery === pauseEvery - 1 });
        }
    }
    return { hashes, refrozen, engine };
}

function firstDivergence(a, b) {
    return a.findIndex((hash, index) => hash !== b[index]);
}

describe('dead writes: the reference', () => {
    test('two unpoisoned runs are identical, and the scene exercises contacts and re-freezes', () => {
        const first = run();
        expect(firstDivergence(first.hashes, run().hashes)).toBe(-1);
        expect(first.refrozen).toBeGreaterThan(100);
        expect(first.engine.pairs.list.length).toBeGreaterThan(50);
    });
});

describe('dead writes: pair records', () => {
    test('pair.separation is dead at the end of an update (poisoned: identical)', () => {
        const poisoned = run({
            atStepEnd: ({ engine }) => engine.pairs.list.forEach((pair) => {
                pair.separation = NaN;
            })
        });
        expect(firstDivergence(run().hashes, poisoned.hashes)).toBe(-1);
    });

    test('a collision record carries no tangent', () => {
        const bodyA = Bodies.rectangle(0, 0, 10, 10);
        const bodyB = Bodies.rectangle(5, 0, 10, 10);
        const collision = Collision.collides(bodyA, bodyB);

        expect('tangent' in Collision.create(bodyA, bodyB)).toBe(false);
        expect(collision).not.toBe(null);
        expect('tangent' in collision).toBe(false);
    });

    test('the container-less resolver path derives the tangent it needs', () => {
        const { engine } = run();
        const pairsList = engine.pairs.list;
        const bodies = Composite.allBodies(engine.world);
        const warmed = pairsList.filter((pair) => pair.isActive && (pair.contacts[0].tangentImpulse !== 0
            || pair.contacts[1].tangentImpulse !== 0));

        expect(warmed.length).toBeGreaterThan(0);
        expect(() => {
            Resolver.preSolveVelocity(pairsList);
            Resolver.solveVelocity(pairsList, 1000 / 60);
        }).not.toThrow();
        bodies.forEach((body) => {
            expect(Number.isFinite(body.positionPrev.x) && Number.isFinite(body.anglePrev)).toBe(true);
        });
    });

    test('NEGATIVE: a warm-start impulse zeroed at the end of an update diverges', () => {
        const poisoned = run({
            atStepEnd: ({ engine }) => engine.pairs.list.forEach((pair) => {
                pair.contacts[0].normalImpulse = 0;
            })
        });
        expect(firstDivergence(run().hashes, poisoned.hashes)).not.toBe(-1);
    });
});

describe('dead writes: the end-of-update velocity pass', () => {
    const poisonVelocity = (body) => {
        body.velocity.x = NaN;
        body.velocity.y = NaN;
        body.angularVelocity = NaN;
        body.speed = NaN;
        body.angularSpeed = NaN;
    };

    test('the four properties it writes are dead at the end of an update (poisoned: identical)', () => {
        const poisoned = run({
            atStepEnd: ({ movers }) => movers.forEach(poisonVelocity)
        });
        expect(firstDivergence(run().hashes, poisoned.hashes)).toBe(-1);
    });

    test('with the option off the run is bit-identical, and the derived velocity is the engine\'s', () => {
        const kept = run({ consumer: 'engine' });
        const skipped = run({ options: SOLVED_OFF, consumer: 'derived' });
        expect(firstDivergence(kept.hashes, skipped.hashes)).toBe(-1);
    });

    test('with the option off and sleeping enabled the simulation is bit-identical', () => {
        // the simulation only, not the consumer's velocity: a body woken part-way
        // through an update joins the velocity pass on the NEXT update, so for
        // that one update the engine reports 0 where the derived value is the
        // body's real motion (and see the sleeping note in fingerprint)
        const sleeping = { enableSleeping: true };
        const kept = run({ options: sleeping });
        const skipped = run({ options: Object.assign({}, sleeping, SOLVED_OFF) });
        expect(kept.engine.world.bodies.some((body) => body.isSleeping)).toBe(true);
        expect(firstDivergence(kept.hashes, skipped.hashes)).toBe(-1);
    });

    test('with the option off and paused updates the run is bit-identical', () => {
        const kept = run({ pauseEvery: 7, consumer: 'engine' });
        const skipped = run({ options: SOLVED_OFF, pauseEvery: 7, consumer: 'derived' });
        expect(firstDivergence(kept.hashes, skipped.hashes)).toBe(-1);
    });

    test('with the option off a paused update recomputes the velocity properties before it solves', () => {
        // all but `velocity` itself, which still pads the bounds the update
        // before deferred (see the bounds group below)
        const poisonBeforePause = ({ movers, beforePause }) => {
            if (beforePause) {
                movers.forEach((body) => {
                    body.angularVelocity = NaN;
                    body.speed = NaN;
                    body.angularSpeed = NaN;
                });
            }
        };
        const skipped = run({ options: SOLVED_OFF, pauseEvery: 7 });
        const poisoned = run({ options: SOLVED_OFF, pauseEvery: 7, atStepEnd: poisonBeforePause });
        expect(firstDivergence(skipped.hashes, poisoned.hashes)).toBe(-1);
    });

    test('NEGATIVE: with the option off, velocity poisoned before a paused update diverges (deferred bounds are padded by it)', () => {
        const poisoned = run({
            options: SOLVED_OFF,
            pauseEvery: 7,
            atStepEnd: ({ movers, beforePause }) => {
                if (beforePause) {
                    movers.forEach(poisonVelocity);
                }
            }
        });
        expect(firstDivergence(run({ options: SOLVED_OFF, pauseEvery: 7 }).hashes, poisoned.hashes)).not.toBe(-1);
    });

    test('NEGATIVE: with the option on, velocity poisoned before a paused update diverges (the solve reads it)', () => {
        const poisoned = run({
            pauseEvery: 7,
            atStepEnd: ({ movers, beforePause }) => {
                if (beforePause) {
                    movers.forEach(poisonVelocity);
                }
            }
        });
        expect(firstDivergence(run({ pauseEvery: 7 }).hashes, poisoned.hashes)).not.toBe(-1);
    });

    test('NEGATIVE: positionPrev nudged by 1e-9 at the end of an update diverges', () => {
        const poisoned = run({
            atStepEnd: ({ movers }) => movers.forEach((body) => {
                body.positionPrev.x += 1e-9;
            })
        });
        expect(firstDivergence(run().hashes, poisoned.hashes)).not.toBe(-1);
    });

    test('NEGATIVE: the consumer fingerprint sees a moving body\'s velocity', () => {
        const { engine } = run();
        const engineRead = fingerprint(engine, 'engine');
        const mover = Composite.allBodies(engine.world).find((body) => !body.isStatic);

        expect(fingerprint(engine, 'derived')).toBe(engineRead);
        mover.velocity.x += 1e-9;
        expect(fingerprint(engine, 'engine')).not.toBe(engineRead);
    });
});

describe('dead writes: moving-body bounds after the position correction', () => {
    const Bounds = require('../src/geometry/Bounds');

    const refreshBounds = (body) => {
        body.parts.forEach((part) => {
            Bounds.update(part.bounds, part.vertices, body.velocity);
        });
    };

    test('with the option off, re-adding the deferred write at the end of every update changes nothing', () => {
        const skipped = run({ options: SOLVED_OFF, consumer: 'derived' });
        const readded = run({
            options: SOLVED_OFF,
            consumer: 'derived',
            atStepEnd: ({ movers }) => movers.forEach(refreshBounds)
        });
        expect(firstDivergence(skipped.hashes, readded.hashes)).toBe(-1);
    });

    test('with the option off, the scene defers bounds and re-freezes bodies whose bounds were deferred', () => {
        let deferredAtFreeze = 0;
        const setStatic = Body.setStatic;
        Body.setStatic = function(body, isStatic) {
            if (isStatic && body._boundsStale) {
                deferredAtFreeze++;
            }
            return setStatic.apply(this, arguments);
        };
        try {
            run({ options: SOLVED_OFF });
        } finally {
            Body.setStatic = setStatic;
        }
        expect(deferredAtFreeze).toBeGreaterThan(50);
    });

    test('with the option on, no body is ever marked', () => {
        const { engine } = run();
        expect(Composite.allBodies(engine.world).some((body) => body._boundsStale)).toBe(false);
    });

    test('NEGATIVE: with the option off and the catch-up refresh disabled, a re-freeze hands the static index a stale box', () => {
        const updateStaleBounds = Body._updateStaleBounds;
        Body._updateStaleBounds = function() {};
        let broken;
        try {
            broken = run({ options: SOLVED_OFF, consumer: 'derived' });
        } finally {
            Body._updateStaleBounds = updateStaleBounds;
        }
        expect(firstDivergence(run({ consumer: 'engine' }).hashes, broken.hashes)).not.toBe(-1);
    });

    test('NEGATIVE: with the option off and the catch-up refresh disabled, a paused update detects against a stale box', () => {
        const updateStaleBounds = Body._updateStaleBounds;
        const setStatic = Body.setStatic;
        // disable the refresh only where a paused update calls it, by leaving
        // the re-freeze path its own copy
        Body._updateStaleBounds = function() {};
        Body.setStatic = function(body, isStatic) {
            if (isStatic) {
                updateStaleBounds(body);
            }
            return setStatic.apply(this, arguments);
        };
        let broken;
        try {
            broken = run({ options: SOLVED_OFF, pauseEvery: 7, consumer: 'derived' });
        } finally {
            Body._updateStaleBounds = updateStaleBounds;
            Body.setStatic = setStatic;
        }
        expect(firstDivergence(run({ pauseEvery: 7, consumer: 'engine' }).hashes, broken.hashes)).not.toBe(-1);
    });

    test('NEGATIVE: moving-body bounds poisoned before the detector reads them diverge', () => {
        const Events = require('../src/core/Events');
        let hooked = false;
        const poisoned = run({
            atStepEnd: ({ engine }) => {
                if (hooked) {
                    return;
                }
                hooked = true;
                // after integration, before detection
                Events.on(engine, 'beforeSolve', () => {
                    Composite.allBodies(engine.world).forEach((body) => {
                        if (!body.isStatic) {
                            body.bounds.min.x = body.bounds.min.y = -1e9;
                            body.bounds.max.x = body.bounds.max.y = 1e9;
                        }
                    });
                });
            }
        });
        expect(firstDivergence(run().hashes, poisoned.hashes)).not.toBe(-1);
    });
});
