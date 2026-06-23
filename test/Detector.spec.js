/* eslint-env es6, jest */
"use strict";

// Unit tests for the static-index grid broadphase (Detector._mode ===
// 'gridStatic'). Requires the source modules directly (no build step).
//
// Regression: the candidate-generation pass walked every mover's full
// bounding-box cell span:
//
//   for (cx = mcx0; cx <= mcx1; cx++)
//     for (cy = mcy0; cy <= mcy1; cy++)   // cost = AREA of the bounds in cells
//
// with no oversized guard. Bounds.update extends a body's bounds by its
// velocity, so a runaway-velocity body gets bounds spanning thousands of cells
// (millions of Map lookups per step), and an Infinity bound makes
// `mcx1 = Math.floor(Infinity)` Infinity, so the loop never terminates. The
// insert pass and the sibling _collisionsGrid both divert oversized bodies to a
// bounded path; this pass did not. An oversized mover now scans a flat static
// list instead of walking its cell span.
//
// Finite-but-large spans are used here (never Infinity): on unfixed code a
// finite span is merely slow (fails the budget), whereas Infinity would hang the
// jest worker (a synchronous loop cannot be interrupted by a timeout).
const Detector = require('../src/collision/Detector');
const Engine = require('../src/core/Engine');
const Bodies = require('../src/factory/Bodies');
const Composite = require('../src/body/Composite');
const Body = require('../src/body/Body');
const Bounds = require('../src/geometry/Bounds');

const DELTA = 1000 / 60;

function hasCollisionBetween(collisions, bodyA, bodyB) {
    return collisions.some(function(collision) {
        return (collision.bodyA === bodyA && collision.bodyB === bodyB)
            || (collision.bodyA === bodyB && collision.bodyB === bodyA);
    });
}

function countCollisionsBetween(collisions, bodyA, bodyB) {
    return collisions.filter(function(collision) {
        return (collision.bodyA === bodyA && collision.bodyB === bodyB)
            || (collision.bodyA === bodyB && collision.bodyB === bodyA);
    }).length;
}

// Deterministic PRNG (mulberry32) so failures are reproducible.
function createRandom(seed) {
    var state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        var t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pairKey(collision) {
    var idA = collision.bodyA.id;
    var idB = collision.bodyB.id;
    return Math.min(idA, idB) + '-' + Math.max(idA, idB);
}

function sortedPairKeys(collisions) {
    return collisions.map(pairKey).sort();
}

describe('Detector gridStatic broadphase', function() {
    var savedMode = Detector._mode;
    var savedCellSize = Detector._cellSize;

    beforeEach(function() {
        Detector._mode = 'gridStatic';
        Detector._cellSize = 32;
    });

    afterEach(function() {
        Detector._mode = savedMode;
        Detector._cellSize = savedCellSize;
    });

    test('a mover with a huge bounds span completes quickly and still collides', function() {
        var engine = Engine.create({ enableSleeping: false });
        engine.gravity.x = 0;
        engine.gravity.y = 0;

        var floor = Bodies.rectangle(100, 100, 40, 40, { isStatic: true });
        var spread = [];
        for (var index = 0; index < 40; index++) {
            spread.push(Bodies.rectangle(300 + index * 40, 300, 20, 20, { isStatic: true }));
        }
        var mover = Bodies.rectangle(100, 100, 24, 24);

        Composite.add(engine.world, [floor, mover].concat(spread));

        // First step builds the static index (and the flat static list).
        Engine.update(engine, DELTA);
        expect(hasCollisionBetween(engine.detector.collisions, mover, floor)).toBe(true);

        // Simulate runaway velocity by inflating only the bounds (the vertices,
        // and thus the real mover/floor overlap, are unchanged). 200000px at 32px
        // cells is ~6250 cells per axis: an instant flat scan now, multiple
        // seconds of cell-walking before the fix.
        mover.bounds.max.x += 200000;
        mover.bounds.max.y += 200000;

        var start = process.hrtime.bigint();
        var collisions = Detector.collisions(engine.detector);
        var elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

        expect(elapsedMs).toBeLessThan(300);
        expect(hasCollisionBetween(collisions, mover, floor)).toBe(true);
    });

    test('an oversized mover collides with a normal static', function() {
        var engine = Engine.create({ enableSleeping: false });
        engine.gravity.x = 0;
        engine.gravity.y = 0;

        // 200x200 at 32px cells spans ~7x7 = 49 cells (> the 24-cell threshold),
        // so it is genuinely oversized with no bounds tampering.
        var oversizedMover = Bodies.rectangle(400, 400, 200, 200);
        var normalStatic = Bodies.rectangle(400, 400, 40, 40, { isStatic: true });

        Composite.add(engine.world, [oversizedMover, normalStatic]);
        Engine.update(engine, DELTA);

        expect(hasCollisionBetween(engine.detector.collisions, oversizedMover, normalStatic)).toBe(true);
    });

    test('an oversized mover collides with a normal mover', function() {
        var engine = Engine.create({ enableSleeping: false });
        engine.gravity.x = 0;
        engine.gravity.y = 0;

        var oversizedMover = Bodies.rectangle(400, 400, 200, 200);
        var normalMover = Bodies.rectangle(400, 400, 30, 30);

        Composite.add(engine.world, [oversizedMover, normalMover]);
        Engine.update(engine, DELTA);

        expect(hasCollisionBetween(engine.detector.collisions, oversizedMover, normalMover)).toBe(true);
    });

    test('two oversized movers collide exactly once', function() {
        var engine = Engine.create({ enableSleeping: false });
        engine.gravity.x = 0;
        engine.gravity.y = 0;

        var oversizedA = Bodies.rectangle(400, 400, 200, 200);
        var oversizedB = Bodies.rectangle(420, 420, 200, 200);

        Composite.add(engine.world, [oversizedA, oversizedB]);
        Engine.update(engine, DELTA);

        expect(hasCollisionBetween(engine.detector.collisions, oversizedA, oversizedB)).toBe(true);
        // The index dedup must emit the pair once, not from both outers nor never.
        expect(countCollisionsBetween(engine.detector.collisions, oversizedA, oversizedB)).toBe(1);
    });

    test('confirms the same pairs as the sweep across fuzzed scenes', function() {
        // The grid and sweep broadphases feed the same narrow phase, so for any
        // scene they must confirm the exact same set of body pairs. Sweep is the
        // trusted reference. Scenes deliberately include oversized and
        // velocity-expanded (runaway) bodies, the regime that hung the grid.
        var random = createRandom(0x1234abcd);
        var totalCollisions = 0;

        for (var scene = 0; scene < 150; scene++) {
            var bodyCount = 10 + Math.floor(random() * 60);
            var field = 200 + random() * 1600;
            var bodies = [];

            for (var index = 0; index < bodyCount; index++) {
                var x = random() * field;
                var y = random() * field;
                var oversized = random() < 0.12;
                var size = oversized ? 160 + random() * 260 : 8 + random() * 40;
                var isStatic = random() < 0.45;
                var body = Bodies.rectangle(x, y, size, size, { isStatic: isStatic });

                if (!isStatic) {
                    var fast = random() < 0.08;
                    var speed = fast ? 1000 + random() * 40000 : random() * 30;
                    Body.setVelocity(body, {
                        x: (random() - 0.5) * 2 * speed,
                        y: (random() - 0.5) * 2 * speed
                    });
                    // Mirror Engine.update: extend the bounds by the velocity.
                    Bounds.update(body.bounds, body.vertices, body.velocity);
                }

                bodies.push(body);
            }

            Detector._mode = 'sweep';
            var sweepDetector = Detector.create({ bodies: bodies.slice(), pairs: null });
            var sweep = sortedPairKeys(Detector.collisions(sweepDetector));

            Detector._mode = 'gridStatic';
            var gridDetector = Detector.create({ bodies: bodies.slice(), pairs: null });
            var grid = sortedPairKeys(Detector.collisions(gridDetector));

            totalCollisions += sweep.length;
            expect(grid).toEqual(sweep);
        }

        // Guard against a degenerate "agrees because nothing ever collides".
        expect(totalCollisions).toBeGreaterThan(50);
    });
});
