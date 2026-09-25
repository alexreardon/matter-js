/* eslint-env es6, jest */
"use strict";

// Unit tests for the static-index grid broadphase (a detector made with
// `broadphase: 'grid'`), and for how a detector is configured. Requires the
// source modules directly (no build step).
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
// insert pass and the old rebuild-every-step grid both diverted oversized
// bodies to a bounded path; this pass did not. An oversized mover now scans a flat static
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
const Common = require('../src/core/Common');

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

// Runs `fn` with every grid broadphase call checked against the sweep over
// the SAME bodies at the same moment (the grid index persists across calls,
// which is what can go stale; the sweep reads live bounds). Returns how many
// grid calls ran and how many confirmed a different set of pairs.
function checkedAgainstSweep(fn) {
    var grid = Detector._collisionsGrid;
    var result = { calls: 0, mismatches: 0, first: null };

    Detector._collisionsGrid = function(detector) {
        var collisions = grid(detector);
        var found = sortedPairKeys(collisions).join(',');
        var sweep = Detector._collisionsSweep({
            bodies: detector.bodies.slice(), collisions: [], pairs: null, _bodiesOwned: true
        });
        var expected = sortedPairKeys(sweep).join(',');

        result.calls++;
        if (found !== expected) {
            result.mismatches++;
            result.first = result.first || { call: result.calls, found: found, expected: expected };
        }

        return collisions;
    };

    try {
        fn();
    } finally {
        Detector._collisionsGrid = grid;
    }

    return result;
}

// an engine on the grid broadphase, at the default cell size
function createGridEngine() {
    return Engine.create({ enableSleeping: false, detector: Detector.create({ broadphase: 'grid', cellSize: 32 }) });
}

describe('Detector grid broadphase', function() {
    test('a mover with a huge bounds span completes quickly and still collides', function() {
        var engine = createGridEngine();
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
        var engine = createGridEngine();
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
        var engine = createGridEngine();
        engine.gravity.x = 0;
        engine.gravity.y = 0;

        var oversizedMover = Bodies.rectangle(400, 400, 200, 200);
        var normalMover = Bodies.rectangle(400, 400, 30, 30);

        Composite.add(engine.world, [oversizedMover, normalMover]);
        Engine.update(engine, DELTA);

        expect(hasCollisionBetween(engine.detector.collisions, oversizedMover, normalMover)).toBe(true);
    });

    test('two oversized movers collide exactly once', function() {
        var engine = createGridEngine();
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

    // Regression: the classification walk fills `movers` BY INDEX
    // (`movers[moverCount++] = i`) and trims it once, rather than clearing it to
    // zero and re-pushing, because clearing drops the backing store and every
    // rebuild then regrows it from empty. `movers` holds INDICES into
    // `detector.bodies`, and the ONE read of `movers.length` further down is
    // what bounds every consumer, so without the trim a slot left over from a
    // longer previous list is read as a live mover and indexes past the end of a
    // SHRUNKEN body array: `TypeError: Cannot read properties of undefined`.
    //
    // Nothing else in the suite reaches this. Every other case here builds a
    // fresh detector per scene, so the cached mover list starts empty; and
    // `bench/grid-correctness.js`'s `removeStatics` scene shrinks the STATIC
    // set, which never shortens the mover list. Deleting the trim leaves the
    // whole gate set green, which is what this test exists to stop.
    test('a shrinking mover set does not leave stale indices behind', function() {
        var engine = createGridEngine();
        engine.gravity.x = 0;
        engine.gravity.y = 0;

        var floor = Bodies.rectangle(400, 600, 800, 40, { isStatic: true });
        Composite.add(engine.world, floor);

        var movers = [];
        for (var index = 0; index < 40; index++) {
            movers.push(Bodies.rectangle(60 + index * 16, 100, 12, 12));
        }
        Composite.add(engine.world, movers);

        // builds the mover list at its longest
        Engine.update(engine, DELTA);
        expect(engine.detector._sgrid.movers.length).toBe(40);

        // the regime the consumer runs: debris is evicted every step, so the
        // body array and the mover list both shorten together
        Composite.remove(engine.world, movers.slice(5), true);
        Engine.update(engine, DELTA);

        var grid = engine.detector._sgrid;
        expect(grid.movers.length).toBe(5);

        var bodyCount = engine.detector.bodies.length;
        var stale = grid.movers.filter(function(moverIndex) {
            return moverIndex >= bodyCount;
        });
        expect(stale).toEqual([]);

        // and the survivors are still simulated
        var remaining = movers.slice(0, 5);
        for (var check = 0; check < remaining.length; check++) {
            expect(engine.detector.bodies.indexOf(remaining[check])).toBeGreaterThan(-1);
        }
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

            var sweepDetector = Detector.create({ broadphase: 'sweep', bodies: bodies.slice(), pairs: null });
            var sweep = sortedPairKeys(Detector.collisions(sweepDetector));

            var gridDetector = Detector.create({ broadphase: 'grid', cellSize: 32, bodies: bodies.slice(), pairs: null });
            var grid = sortedPairKeys(Detector.collisions(gridDetector));

            totalCollisions += sweep.length;
            expect(grid).toEqual(sweep);
        }

        // Guard against a degenerate "agrees because nothing ever collides".
        expect(totalCollisions).toBeGreaterThan(50);
    });
});

describe('Detector configuration', function() {
    test('a detector defaults to the sweep at a 32px cell, with its grid state declared', function() {
        var detector = Detector.create();

        expect(detector.broadphase).toBe('sweep');
        expect(detector.cellSize).toBe(32);
        expect(detector._sgrid).toBe(null);
        // declared, not added on the first grid step
        expect(Object.keys(detector)).toEqual([
            'bodies', 'collisions', 'pairs', 'broadphase', 'cellSize', '_bodiesOwned', '_world', '_sgrid'
        ]);
        expect(Engine.create().detector.broadphase).toBe('sweep');
    });

    test('Engine.create runs the detector it is given, with its broadphase and cell size', function() {
        var detector = Detector.create({ broadphase: 'grid', cellSize: 48 });
        var engine = Engine.create({ detector: detector });
        var gridCalls = 0;
        var grid = Detector._collisionsGrid;

        expect(engine.detector).toBe(detector);
        expect(detector.pairs).toBe(engine.pairs);

        Composite.add(engine.world, [
            Bodies.rectangle(100, 100, 40, 40, { isStatic: true }),
            Bodies.rectangle(100, 70, 20, 20)
        ]);

        Detector._collisionsGrid = function() {
            gridCalls++;
            return grid.apply(this, arguments);
        };
        try {
            Engine.update(engine, DELTA);
        } finally {
            Detector._collisionsGrid = grid;
        }

        expect(gridCalls).toBe(1);
        expect(engine.detector.broadphase).toBe('grid');
        expect(engine.detector._sgrid.cellSize).toBe(48);
    });

    test('an engine-level broadphase option throws rather than being ignored', function() {
        // upstream's back-compatibility `engine.broadphase` would overwrite it
        expect(function() { Engine.create({ broadphase: 'grid' }); }).toThrow(/detector/);
    });

    test.each([['gridStatic'], ['Grid'], [''], [null], [undefined], [1]])('an unknown broadphase %p throws at Detector.create', function(broadphase) {
        expect(function() { Detector.create({ broadphase: broadphase }); }).toThrow(/unknown broadphase/);
    });

    test.each([['gridStatic'], [undefined]])('an unknown broadphase %p assigned after create throws at the next step', function(broadphase) {
        var engine = createGridEngine();
        Composite.add(engine.world, Bodies.rectangle(100, 100, 40, 40));
        Engine.update(engine, DELTA);

        engine.detector.broadphase = broadphase;
        expect(function() { Engine.update(engine, DELTA); }).toThrow(/unknown broadphase/);

        // and a detector made by hand, with no broadphase at all
        expect(function() { Detector.collisions({ bodies: [], collisions: [], pairs: null }); }).toThrow(/unknown broadphase/);
    });

    test.each([[0], [-8], [NaN], [Infinity], ['32'], [undefined]])('a cell size of %p throws at create, and at the next grid step', function(cellSize) {
        expect(function() { Detector.create({ broadphase: 'grid', cellSize: cellSize }); }).toThrow(/cellSize/);

        var engine = createGridEngine();
        Composite.add(engine.world, Bodies.rectangle(100, 100, 40, 40));
        Engine.update(engine, DELTA);

        engine.detector.cellSize = cellSize;
        expect(function() { Engine.update(engine, DELTA); }).toThrow(/cellSize/);
    });

    test('a cell-size change between updates rebuilds the static index once, and the grid still matches the sweep', function() {
        var engine = createGridEngine();
        var random = createRandom(0x51ce);
        for (var row = 0; row < 8; row++) {
            for (var col = 0; col < 12; col++) {
                Composite.add(engine.world, Bodies.rectangle(40 + col * 60, 300 + row * 30, 50, 20, { isStatic: true }));
            }
        }
        for (var index = 0; index < 40; index++) {
            Composite.add(engine.world, Bodies.rectangle(40 + random() * 700, 100 + random() * 150, 16, 16));
        }

        var rebuild = jest.spyOn(Detector, '_staticIndexRebuild');
        var checked = checkedAgainstSweep(function() {
            for (var step = 0; step < 90; step++) {
                if (step === 30) {
                    engine.detector.cellSize = 48;
                }
                if (step === 60) {
                    engine.detector.cellSize = 20;
                }
                Engine.update(engine, DELTA);
            }
        });
        var rebuilds = rebuild.mock.calls.length;
        rebuild.mockRestore();

        // the first step, and once per change
        expect(rebuilds).toBe(3);
        expect(engine.detector._sgrid.cellSize).toBe(20);
        expect(checked.calls).toBe(90);
        expect(checked.mismatches).toBe(0);
    });

    // Config lives on the detector and the index on each detector's `_sgrid`,
    // but several counters are still shared across every engine in the process
    // (the static and body-set epochs, the walk stamp). Sharing them may cost a
    // wasted classification; it must never change an answer
    test('engines with different broadphases and cell sizes, stepped interleaved, each match their solo run', function() {
        var configs = [
            { broadphase: 'grid', cellSize: 32 },
            { broadphase: 'grid', cellSize: 48 },
            { broadphase: 'sweep', cellSize: 32 },
            { broadphase: 'grid', cellSize: 20 }
        ];
        var steps = 150;

        function createScene(config, seed) {
            Common._nextId = 0;
            var engine = Engine.create({ enableSleeping: false, detector: Detector.create(config) });
            var world = engine.world;
            var random = createRandom(seed);
            var tiles = [];
            var live = [];
            var tick = 0;

            for (var k = 0; k < 12; k++) {
                Composite.add(world, Bodies.rectangle(40 + k * 70, 620, 68, 30, { isStatic: true }));
            }
            for (var row = 0; row < 10; row++) {
                for (var col = 0; col < 14; col++) {
                    // built dynamic then frozen, so a release restores a real mass
                    var tile = Bodies.rectangle(40 + col * 55 + (row % 2) * 9, 60 + row * 30, 44, 18);
                    Body.setStatic(tile, true);
                    Composite.add(world, tile);
                    tiles.push(tile);
                }
            }

            return {
                step: function() {
                    tick++;
                    var released = tiles.splice(Math.floor(random() * tiles.length), 1)[0];
                    if (released) {
                        Body.setStatic(released, false);
                        Body.setVelocity(released, { x: random() * 4 - 2, y: 1 });
                        live.push({ body: released, born: tick });
                    }
                    while (live.length > 0 && tick - live[0].born > 60) {
                        Composite.remove(world, live.shift().body);
                    }
                    Engine.update(engine, DELTA);
                },
                state: function() {
                    return {
                        bodies: world.bodies.map(function(body) {
                            return [body.id, body.position.x, body.position.y, body.angle, body.velocity.x, body.velocity.y];
                        }),
                        pairs: engine.pairs.list.map(function(pair) { return pair.id; })
                    };
                }
            };
        }

        var solo = configs.map(function(config, index) {
            var scene = createScene(config, 1000 + index);
            var states = [];
            for (var step = 0; step < steps; step++) {
                scene.step();
                states.push(scene.state());
            }
            return states;
        });

        var scenes = configs.map(function(config, index) {
            return createScene(config, 1000 + index);
        });
        var interleaved = configs.map(function() { return []; });
        for (var step = 0; step < steps; step++) {
            for (var index = 0; index < scenes.length; index++) {
                scenes[index].step();
                interleaved[index].push(scenes[index].state());
            }
        }

        for (var check = 0; check < configs.length; check++) {
            expect(interleaved[check]).toEqual(solo[check]);
        }
        // the configurations genuinely differ (the grid re-baselines the sweep,
        // and its emission order follows the cell size), so an engine reading
        // another's config would show here
        expect(solo[0]).not.toEqual(solo[2]);
        expect(solo[0]).not.toEqual(solo[1]);
        expect(solo[1]).not.toEqual(solo[3]);
    });
});
