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

    test('an engine-level broadphase or cellSize option throws rather than being ignored', function() {
        // upstream's back-compatibility `engine.broadphase` would overwrite
        // the first, and nothing would read the second
        expect(function() { Engine.create({ broadphase: 'grid' }); }).toThrow(/detector/);
        expect(function() { Engine.create({ cellSize: 16 }); }).toThrow(/detector/);
        expect(function() { Engine.create({ detector: Detector.create({ broadphase: 'grid' }), cellSize: 16 }); }).toThrow(/detector/);
        expect(Engine.create({ cellSize: undefined }).detector.cellSize).toBe(32);
    });

    test('the engine-level error suggests code that runs, whatever name it was given', function() {
        var message = '';
        try {
            Engine.create({ broadphase: 'gridStatic' });
        } catch (error) {
            message = error.message;
        }

        // the bad name is reported, but never pasted into the suggested call
        expect(message).toMatch(/gridStatic/);
        expect(message).not.toMatch(/broadphase: 'gridStatic'/);
        var suggested = message.match(/Detector\.create\((\{.*?\})\)/);
        expect(suggested).not.toBe(null);
        // eslint-disable-next-line no-new-func
        var options = new Function('return ' + suggested[1])();
        expect(Detector.create(options).broadphase).toBe('grid');
    });

    test('a cell size given as undefined takes the default, as an absent one does', function() {
        expect(Detector.create({ cellSize: undefined }).cellSize).toBe(32);
        expect(Detector.create({ broadphase: 'grid', cellSize: undefined }).cellSize).toBe(32);
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

    test.each([[0], [-0], [-8], [NaN], [Infinity], ['32'], [1e-310], [5e-324], [undefined]])('a cell size of %p throws at create, and at the next grid step', function(cellSize) {
        // an unset cell size takes the default at create (see above)
        if (cellSize !== undefined) {
            expect(function() { Detector.create({ broadphase: 'grid', cellSize: cellSize }); }).toThrow(/cellSize/);
        }

        var engine = createGridEngine();
        Composite.add(engine.world, Bodies.rectangle(100, 100, 40, 40));
        Engine.update(engine, DELTA);

        engine.detector.cellSize = cellSize;
        expect(function() { Engine.update(engine, DELTA); }).toThrow(/cellSize/);
    });

    // the grid seeded its remembered cell size with 0 and checked a cell size
    // only when it CHANGED, so a zero set before the first grid step was never
    // checked: its inverse is Infinity, every body lands in cell Infinity, and
    // the insert loop never ends (it died, eventually, on an array too long)
    test.each([[0], [-0], [1e-310]])('a cell size of %p set before the first grid step throws there, with or without an engine', function(cellSize) {
        var detector = Detector.create({ broadphase: 'grid' });
        detector.cellSize = cellSize;
        var engine = Engine.create({ detector: detector });
        Composite.add(engine.world, [
            Bodies.rectangle(100, 100, 40, 40, { isStatic: true }),
            Bodies.rectangle(100, 60, 20, 20)
        ]);
        expect(function() { Engine.update(engine, DELTA); }).toThrow(/cellSize/);

        var bare = Detector.create({ broadphase: 'grid' });
        bare.cellSize = cellSize;
        Detector.setBodies(bare, engine.world.bodies.slice());
        expect(function() { Detector.collisions(bare); }).toThrow(/cellSize/);

        // a sweep never reads the cell size, until it is switched to the grid
        var sweep = Engine.create();
        Composite.add(sweep.world, Bodies.rectangle(100, 100, 40, 40, { isStatic: true }));
        sweep.detector.cellSize = cellSize;
        Engine.update(sweep, DELTA);
        sweep.detector.broadphase = 'grid';
        expect(function() { Engine.update(sweep, DELTA); }).toThrow(/cellSize/);
    });

    test.each([
        ['a bad cell size', function(detector) { detector.cellSize = 0; }, /cellSize/],
        ['an unknown broadphase', function(detector) { detector.broadphase = 'gridStatic'; }, /unknown broadphase/]
    ])('an update that throws on %s changes nothing first', function(name, breakIt, error) {
        var engine = createGridEngine();
        var box = Bodies.rectangle(100, 100, 20, 20);
        Composite.add(engine.world, [box, Bodies.rectangle(100, 300, 400, 20, { isStatic: true })]);
        Engine.update(engine, DELTA);

        var before = { x: box.position.x, y: box.position.y, timestamp: engine.timing.timestamp, bodies: engine.world.bodies };
        breakIt(engine.detector);
        expect(function() { Engine.update(engine, DELTA); }).toThrow(error);

        expect(box.position.x).toBe(before.x);
        expect(box.position.y).toBe(before.y);
        expect(engine.timing.timestamp).toBe(before.timestamp);
        // the update never lent the world its own array, so an add after the
        // throw edits it in place rather than copying it
        expect(engine.world._bodiesLent).toBe(false);
        Composite.add(engine.world, Bodies.rectangle(50, 50, 10, 10));
        expect(engine.world.bodies).toBe(before.bodies);
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

// A body carries the grid's visit stamp (`_gsStamp`) from whichever detector
// last visited it. With a counter per detector, a stamp another detector left
// could equal the one a pass took, and the pass skipped the body as already
// seen: a static released out of a journal pass stayed out of the mover lists,
// and a static left out of a mover's candidates missed its pair. Two detectors
// over one world is the case that reaches it: a detector swapped in for
// another, and two engines stepping bodies moved between their worlds
describe('the grid visit stamp', function() {
    test('a grid detector swapped in for another skips no body the old one stamped', function() {
        var engine = createGridEngine();
        var world = engine.world;
        var random = createRandom(0x57a4);
        var row;
        var col;

        engine.gravity.y = 1;
        for (row = 0; row < 16; row++) {
            for (col = 0; col < 24; col++) {
                var tile = Bodies.rectangle(20 + col * 34, 300 + row * 22, 30, 18);
                Body.setStatic(tile, true);
                Composite.add(world, tile);
            }
        }
        for (var index = 0; index < 60; index++) {
            Composite.add(world, Bodies.rectangle(40 + random() * 760, 100 + random() * 150, 10 + random() * 10, 10 + random() * 10));
        }

        var problems = [];
        var staleStamps = 0;
        var checked = checkedAgainstSweep(function() {
            for (var step = 0; step < 240; step++) {
                var before = world.bodies.map(function(body) { return body._gsStamp; });
                var newest = Math.max.apply(null, before);
                if (step === 40) {
                    // a fresh detector over the same world: every body still
                    // carries the old one's stamps
                    var fresh = Detector.create({ broadphase: 'grid', cellSize: 32 });
                    fresh.pairs = engine.pairs;
                    engine.detector = fresh;
                    Composite.setModified(world, true, true, false);
                }
                if (step >= 40) {
                    // a release every step, and a freeze every third
                    var statics = world.bodies.filter(function(body) { return body.isStatic; });
                    var chosen = statics[Math.floor(random() * statics.length)];
                    Body.setStatic(chosen, false);
                    Body.setVelocity(chosen, { x: random() * 4 - 2, y: -1 });
                    if (step % 3 === 0) {
                        var moving = world.bodies.filter(function(body) { return !body.isStatic; });
                        Body.setStatic(moving[Math.floor(random() * moving.length)], true);
                    }
                }
                Engine.update(engine, DELTA);

                // a stamp this update wrote is newer than every stamp any
                // body carried before it, so no pass can mistake a body
                // another detector visited for one it visited itself
                world.bodies.forEach(function(body, index) {
                    if (index < before.length && body._gsStamp !== before[index] && body._gsStamp <= newest) {
                        staleStamps++;
                    }
                });

                var g = engine.detector._sgrid;
                var movers = world.bodies.filter(function(body) { return !(body.isStatic || body.isSleeping); });
                var ids = function(list) { return list.map(function(body) { return body.id; }).join(','); };
                if (ids(engine._moverBodies) !== ids(movers) || ids(g.movers) !== ids(movers)) {
                    problems.push(step);
                }
                var badIndexed = g.indexed.filter(function(body) { return !body.isStatic; });
                if (badIndexed.length > 0) {
                    problems.push('indexed ' + step);
                }
            }
        });

        expect(staleStamps).toBe(0);
        expect(problems).toEqual([]);
        expect(checked.calls).toBe(240);
        expect(checked.first).toBe(null);
    });
});

// A resting body (static or asleep) that a Body setter moves after the grid
// indexed it is promoted to a mover by that setter (Body._promoteIfIndexed):
// nothing tags it. Every setter that moves or reshapes a body is run through
// the same scene: a shelf of statics that starts moving 30 steps in, under a
// pile of debris, above a static page. On every step the grid must confirm
// exactly the sweep's pairs, and the debris must ride the shelf.
describe('a resting body moved after the grid indexed it', function() {
    var SHELF_Y = 300;

    // each moves one shelf piece by a step's worth; `index` is its place in
    // the shelf, so a rotation about a shared pivot turns the shelf as one
    var SETTERS = [
        ['Body.setPosition', function(body) {
            Body.setPosition(body, { x: body.position.x, y: body.position.y - 1 });
        }],
        ['Body.setPosition, inferring velocity', function(body) {
            Body.setPosition(body, { x: body.position.x, y: body.position.y - 1 }, true);
        }],
        ['Body.translate', function(body) {
            Body.translate(body, { x: 0, y: -1 });
        }],
        ['Body.set position', function(body) {
            Body.set(body, 'position', { x: body.position.x, y: body.position.y - 1 });
        }],
        ['Body.setPositionAndAngle', function(body, step) {
            // both change on every call, the first included, so the fused
            // path is the one that promotes (with either unchanged it
            // delegates to setPosition or setAngle)
            Body.setPositionAndAngle(body, body.position.x, body.position.y - 1, 0.002 * (step + 1));
        }],
        ['Body.setAngle', function(body) {
            Body.setAngle(body, body.angle + 0.004);
        }],
        ['Body.rotate', function(body) {
            Body.rotate(body, 0.004);
        }],
        ['Body.rotate about a point', function(body) {
            Body.rotate(body, -0.0015, { x: 60, y: SHELF_Y });
        }],
        ['Body.scale', function(body) {
            // grows upward into the debris (about the position, so the
            // position does not move without positionPrev, which would read
            // as a velocity and fling the debris)
            Body.scale(body, 1, 1.01);
        }],
        ['Body.setVertices', function(body, step) {
            var halfHeight = 7 + 0.1 * step;
            Body.setVertices(body, [
                { x: -19, y: -halfHeight }, { x: 19, y: -halfHeight },
                { x: 19, y: halfHeight }, { x: -19, y: halfHeight }
            ]);
        }]
    ];

    function runShelf(move, options) {
        var sleeping = Boolean(options && options.sleeping);
        var moveBeforeFirstStep = Boolean(options && options.moveBeforeFirstStep);
        // { step, cellSize }: a cell-size change at that step, which rebuilds
        // the static index from every body in the world
        var cellSizeChange = (options && options.cellSizeChange) || null;
        var indexedAfterRebuild = null;
        var engine = createGridEngine();
        var world = engine.world;
        var random = createRandom(0x5e1f);
        var shelf = [];
        var debris = [];
        var contactSteps = 0;
        var movingSteps = 0;
        var row;
        var col;

        engine.gravity.y = 1;

        // the page below and around the shelf
        for (row = 0; row < 10; row++) {
            for (col = 0; col < 16; col++) {
                Composite.add(world, Bodies.rectangle(30 + col * 50, 360 + row * 22, 44, 16, { isStatic: true }));
            }
        }

        for (col = 0; col < 10; col++) {
            var piece = sleeping
                ? Bodies.rectangle(80 + col * 40, SHELF_Y, 38, 14)
                : Bodies.rectangle(80 + col * 40, SHELF_Y, 38, 14, { isStatic: true });
            shelf.push(piece);
        }
        Composite.add(world, shelf);
        if (sleeping) {
            // asleep, not static: with sleeping off in the engine they stay
            // asleep, so the grid indexes them as resting bodies
            shelf.forEach(function(piece) { Body.setStatic(piece, false); });
            shelf.forEach(function(piece) { require('../src/core/Sleeping').set(piece, true); });
        }

        for (var index = 0; index < 30; index++) {
            debris.push(Bodies.rectangle(80 + random() * 380, SHELF_Y - 30 - random() * 60, 10, 10));
        }
        Composite.add(world, debris);

        if (moveBeforeFirstStep) {
            shelf.forEach(function(piece) {
                Body.setPosition(piece, { x: piece.position.x, y: piece.position.y - 20 });
            });
        }

        var shelfIds = new Set(shelf.map(function(piece) { return piece.id; }));
        var debrisStartY = 0;

        var checked = checkedAgainstSweep(function() {
            for (var step = 0; step < 150; step++) {
                if (step >= 30) {
                    if (step === 30) {
                        debrisStartY = debris.reduce(function(sum, body) { return sum + body.position.y; }, 0) / debris.length;
                    }
                    for (var s = 0; s < shelf.length; s++) {
                        move(shelf[s], step - 30);
                    }
                    movingSteps++;
                }
                if (cellSizeChange !== null && step === cellSizeChange.step) {
                    engine.detector.cellSize = cellSizeChange.cellSize;
                }
                Engine.update(engine, DELTA);
                if (cellSizeChange !== null && step === cellSizeChange.step) {
                    indexedAfterRebuild = shelf.filter(function(piece) {
                        return piece._sIndexed || engine.detector._sgrid.indexed.indexOf(piece) !== -1;
                    }).length;
                }
                if (step >= 30) {
                    var touching = engine.pairs.list.some(function(pair) {
                        return pair.isActive && shelfIds.has(pair.bodyA.parent.id) !== shelfIds.has(pair.bodyB.parent.id);
                    });
                    if (touching) {
                        contactSteps++;
                    }
                }
            }
        });

        var debrisEndY = debris.reduce(function(sum, body) { return sum + body.position.y; }, 0) / debris.length;

        return {
            checked: checked,
            shelf: shelf,
            indexedAfterRebuild: indexedAfterRebuild,
            contactShare: contactSteps / movingSteps,
            debrisRise: debrisStartY - debrisEndY
        };
    }

    test.each(SETTERS)('%s: the grid confirms the sweep\'s pairs on every step, and the debris rides the shelf', function(name, move) {
        var result = runShelf(move);

        expect(result.checked.calls).toBe(150);
        expect(result.checked.first).toBe(null);
        expect(result.checked.mismatches).toBe(0);
        // promoted by the move, never tagged
        result.shelf.forEach(function(piece) {
            expect(piece._sMoved).toBe(true);
            expect(piece._sIndexed).toBe(false);
        });
        // the debris stays on the moving shelf
        expect(result.contactShare).toBeGreaterThan(0.9);
    });

    // the full rebuild a cell-size change forces walks every body in the
    // world, not the classification, so it has its own test of the promotion:
    // a promoted static is still static, and indexing it again would answer
    // for the pose at the rebuild while it moves on (and, being a mover too,
    // pair it with its debris twice)
    test('a promoted shelf stays out of the static index through a cell-size rebuild', function() {
        var rebuild = jest.spyOn(Detector, '_staticIndexRebuild');
        var result = runShelf(SETTERS[0][1], { cellSizeChange: { step: 60, cellSize: 48 } });
        var rebuilds = rebuild.mock.calls.length;
        rebuild.mockRestore();

        // the first step, and the change
        expect(rebuilds).toBe(2);
        expect(result.indexedAfterRebuild).toBe(0);
        expect(result.checked.calls).toBe(150);
        expect(result.checked.first).toBe(null);
        expect(result.checked.mismatches).toBe(0);
        result.shelf.forEach(function(piece) {
            expect(piece._sMoved).toBe(true);
            expect(piece._sIndexed).toBe(false);
        });
        expect(result.contactShare).toBeGreaterThan(0.9);
    });

    test('a rising shelf carries its debris up', function() {
        var result = runShelf(SETTERS[0][1]);
        // 120 steps at 1px a step
        expect(result.debrisRise).toBeGreaterThan(80);
    });

    test('NEGATIVE: with the promotion switched off, the moved shelf misses pairs', function() {
        var promote = Body._promoteIfIndexed;
        var result;

        Body._promoteIfIndexed = function() {};
        try {
            result = runShelf(SETTERS[0][1]);
        } finally {
            Body._promoteIfIndexed = promote;
        }

        expect(result.checked.mismatches).toBeGreaterThan(10);
        result.shelf.forEach(function(piece) {
            expect(piece._sMoved).toBe(false);
        });
    });

    test('a sleeping body moved after the grid indexed it is promoted the same way', function() {
        var result = runShelf(SETTERS[0][1], { sleeping: true });

        result.shelf.forEach(function(piece) {
            expect(piece.isSleeping).toBe(true);
            expect(piece._sMoved).toBe(true);
        });
        expect(result.checked.mismatches).toBe(0);
        expect(result.contactShare).toBeGreaterThan(0.9);
    });

    test('a static moved before the grid first indexed it is indexed at its new pose, not promoted', function() {
        var engine = createGridEngine();
        var floor = Bodies.rectangle(200, 400, 60, 20, { isStatic: true });
        var box = Bodies.rectangle(200, 330, 20, 20);
        Composite.add(engine.world, [floor, box]);

        Body.setPosition(floor, { x: 200, y: 350 });

        var checked = checkedAgainstSweep(function() {
            for (var step = 0; step < 20; step++) {
                Engine.update(engine, DELTA);
            }
        });

        expect(floor._sMoved).toBe(false);
        expect(floor._sIndexed).toBe(true);
        expect(checked.mismatches).toBe(0);
        expect(hasCollisionBetween(engine.detector.collisions, box, floor)).toBe(true);

        // and the first move once it is indexed promotes it
        Body.setPosition(floor, { x: 200, y: 349 });
        expect(floor._sMoved).toBe(true);
    });

    test('a promotion moves the static epoch and records the body in its world\'s journal, once', function() {
        var engine = createGridEngine();
        var tiles = [];
        for (var index = 0; index < 20; index++) {
            tiles.push(Bodies.rectangle(20 + index * 30, 200, 24, 12, { isStatic: true }));
        }
        Composite.add(engine.world, tiles);
        Engine.update(engine, DELTA);
        Engine.update(engine, DELTA);

        var world = engine.world;
        var epoch = Common._bodyStaticEpoch;
        var touched = world._touchedCount;

        expect(world._journalLive).toBe(true);
        Body.setPosition(tiles[4], { x: tiles[4].position.x + 3, y: 200 });

        expect(Common._bodyStaticEpoch).toBe(epoch + 1);
        expect(world._touchedCount).toBe(touched + 1);
        expect(world._touched[touched]).toBe(tiles[4]);

        // a promoted body is a mover for good: a second move records nothing
        Body.setPosition(tiles[4], { x: tiles[4].position.x + 3, y: 200 });
        Body.setAngle(tiles[4], 0.2);
        expect(Common._bodyStaticEpoch).toBe(epoch + 1);
        expect(world._touchedCount).toBe(touched + 1);

        Engine.update(engine, DELTA);
        expect(engine.detector._sgrid.movers).toContain(tiles[4]);
        expect(tiles[4]._sIndexed).toBe(false);
    });

    test('on the sweep nothing is indexed, so a move promotes nothing', function() {
        var engine = Engine.create();
        var floor = Bodies.rectangle(200, 400, 60, 20, { isStatic: true });
        Composite.add(engine.world, floor);
        Engine.update(engine, DELTA);

        var epoch = Common._bodyStaticEpoch;
        Body.setPosition(floor, { x: 210, y: 400 });

        expect(floor._sMoved).toBe(false);
        expect(Common._bodyStaticEpoch).toBe(epoch);
    });

    test('Detector.setGridDynamic is gone', function() {
        expect(Detector.setGridDynamic).toBeUndefined();
    });
});
