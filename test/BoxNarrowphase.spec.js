/* eslint-env es6, jest */
"use strict";

// Differential tests for the closed-form box support search
// (`Collision._findSupportsBox`) against the general hill-climb
// (`Collision._findSupports`) it stands in for.
//
// The box search must return the SAME two vertex objects in the SAME order on
// every call, because `Pair.update` matches contacts by vertex identity and the
// solver walks them in order: a swapped pair, or a different but equally deep
// corner, is a different simulation. The 46-example suite can only see that
// where a scene happens to hit it, so this compares the two on EVERY call:
//
// 1. a directed sweep of search directions over boxes of several shapes,
//    rotations and scales, aimed at the ties (a normal along a box's own face,
//    at 45 degrees to a square's faces, and a hair either side of both), which
//    is where a closed form and a float comparison can disagree;
// 2. a shadow differential inside two small storm-shaped churn scenes, one on
//    the game's axis-aligned statics and one on rotated statics, where the
//    world steps on the GENERAL result and the box result is checked beside it;
// 3. two mutants that must be caught, so the differential can say no.
const Matter = require('../src/module/main.js');
const { Engine, Composite, Bodies, Body, Collision, Detector } = Matter;

function makeRandom(seed) {
    let state = seed;
    return function random() {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

// counts which exit of the box search ran. `_findSupportsBox` reaches its two
// helpers and its fallback through `Collision`, so wrapping them there sees
// every call; the fast path is whatever reached none of them
function createPathCounter() {
    const counts = { fast: 0, beside: 0, level: 0, fallback: 0 };
    let exit = null;
    const originals = {
        beside: Collision._supportsBesideDeepest,
        level: Collision._supportsFromLevelPair,
        general: Collision._findSupports
    };

    Collision._supportsBesideDeepest = function() {
        exit = 'beside';
        return originals.beside.apply(this, arguments);
    };
    Collision._supportsFromLevelPair = function() {
        exit = 'level';
        return originals.level.apply(this, arguments);
    };
    Collision._findSupports = function() {
        if (exit === 'pending') {
            exit = 'fallback';
        }
        return originals.general.apply(this, arguments);
    };

    return {
        counts,
        // runs the box search, recording the exit it took
        run(fn) {
            exit = 'pending';
            const result = fn();
            counts[exit === 'pending' ? 'fast' : exit]++;
            exit = null;
            return result;
        },
        restore() {
            Collision._supportsBesideDeepest = originals.beside;
            Collision._supportsFromLevelPair = originals.level;
            Collision._findSupports = originals.general;
        }
    };
}

// the general search's answer, copied out of the shared result array both
// searches write into
function generalSupports(bodyA, bodyB, normal, direction, general) {
    const result = general(bodyA, bodyB, normal, direction);
    return [result[0], result[1]];
}

describe('directed sweep: every search direction, aimed at the ties', () => {
    function makeBoxes() {
        return [
            ['rectangle 30x40', Bodies.rectangle(100, 100, 30, 40)],
            ['rectangle 30x40 at angle 0.3', Bodies.rectangle(100, 100, 30, 40, { angle: 0.3 })],
            ['rectangle 30x40 at 45 degrees', Bodies.rectangle(100, 100, 30, 40, { angle: Math.PI / 4 })],
            ['square polygon', Bodies.polygon(100, 100, 4, 20)],
            ['square polygon at angle 1.7', Bodies.polygon(100, 100, 4, 20, { angle: 1.7 })],
            ['1x1 px rectangle at angle 2.2', Bodies.rectangle(100, 100, 1, 1, { angle: 2.2 })],
            ['sliver 200x1 at angle -0.4', Bodies.rectangle(100, 100, 200, 1, { angle: -0.4 })],
            ['rectangle at page coordinates, angle 1.1', Bodies.rectangle(1e6, 2e5, 17, 9, { angle: 1.1 })],
            ['a box too small to reason about (1e-6 px)', Bodies.rectangle(100, 100, 1e-6, 1e-6, { angle: 0.6 })]
        ];
    }

    // search directions: a uniform sweep, plus the box's own face normals and
    // the directions halfway between them, each nudged a hair either way
    function makeDirections(box) {
        const angles = [];

        for (let i = 0; i < 720; i++) {
            angles.push((i / 720) * 2 * Math.PI);
        }

        const faceAngle = Math.atan2(box.axes[0].y, box.axes[0].x);
        const nudges = [0, 1e-15, -1e-15, 1e-12, -1e-12, 1e-9, -1e-9, 1e-7, -1e-7, 1e-5, -1e-5];

        for (let quarter = 0; quarter < 8; quarter++) {
            for (const nudge of nudges) {
                angles.push(faceAngle + quarter * Math.PI / 4 + nudge);
            }
        }

        const directions = angles.map((angle) => ({ x: Math.cos(angle), y: Math.sin(angle) }));

        // the exact face normals, as the SAT hands them over (the axis object's
        // own components, negated or not)
        for (const axis of box.axes) {
            directions.push({ x: axis.x, y: axis.y });
            directions.push({ x: -axis.x, y: -axis.y });
        }

        return directions;
    }

    it('returns the general search\'s vertices, in its order, on every call', () => {
        const general = Collision._findSupports;
        const paths = createPathCounter();
        let calls = 0;
        const mismatches = [];

        try {
            for (const [label, box] of makeBoxes()) {
                expect(box._boxCorners).toBeGreaterThanOrEqual(0);

                // the body whose position the search measures from, at a few
                // offsets including right on top of the box
                const others = [
                    Bodies.rectangle(box.position.x, box.position.y, 10, 10),
                    Bodies.rectangle(box.position.x + 37, box.position.y - 11, 10, 10),
                    Bodies.rectangle(box.position.x - 3.5, box.position.y + 250, 10, 10)
                ];

                for (const other of others) {
                    for (const normal of makeDirections(box)) {
                        for (const direction of [1, -1]) {
                            const expected = generalSupports(other, box, normal, direction, general);
                            const actual = paths.run(() => Collision._findSupportsBox(other, box, normal, direction));
                            calls++;

                            if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
                                mismatches.push(`${label}: normal (${normal.x}, ${normal.y}) x ${direction}`);
                            }
                        }
                    }
                }
            }
        } finally {
            paths.restore();
        }

        expect(mismatches.slice(0, 5)).toEqual([]);
        expect(calls).toBeGreaterThan(40000);

        // every exit of the box search was taken
        expect(paths.counts.fast).toBeGreaterThan(0);
        expect(paths.counts.level).toBeGreaterThan(0);
        expect(paths.counts.beside).toBeGreaterThan(0);
        expect(paths.counts.fallback).toBeGreaterThan(0);
    });
});

// A small storm-shaped churn scene in the game's configuration: a grid of
// static tiles released a few per step with a push, debris evicted after a
// fixed life and replaced by a new static, plus a few NON-box movers (circles
// and a trapezoid) so the general search also runs through `collides`.
function buildScene({ rotatedStatics }) {
    const random = makeRandom(97531);
    const engine = Engine.create({ enableSleeping: false, enableSolvedVelocityAndBounds: false, detector: Detector.create({ broadphase: 'grid' }) });
    const world = engine.world;

    Composite.add(world, [
        Bodies.rectangle(500, 830, 1100, 40, { isStatic: true }),
        Bodies.rectangle(-30, 400, 40, 900, { isStatic: true }),
        Bodies.rectangle(1030, 400, 40, 900, { isStatic: true })
    ]);

    const tiles = [];
    const tileWidth = 38;
    const tileHeight = 22;

    function makeTile(x, y) {
        const angle = rotatedStatics ? (random() - 0.5) * Math.PI : 0;
        const tile = Bodies.rectangle(x, y, tileWidth, tileHeight, { angle: angle });
        Body.setStatic(tile, true);
        Composite.add(world, tile);
        tiles.push(tile);
        return tile;
    }

    for (let row = 0; row < 14; row++) {
        for (let col = 0; col < 22; col++) {
            makeTile(30 + col * 43, 30 + row * 40);
        }
    }

    const nonBoxes = [
        Bodies.circle(200, 700, 9),
        Bodies.circle(520, 690, 14),
        Bodies.circle(810, 700, 4),
        Bodies.trapezoid(400, 700, 30, 16, 0.4)
    ];
    Composite.add(world, nonBoxes);

    const order = tiles.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const swap = order[i];
        order[i] = order[j];
        order[j] = swap;
    }

    let released = 0;
    let frame = 0;
    const live = [];

    function churn() {
        frame++;

        for (let k = 0; k < 5 && released < order.length; k++) {
            const tile = tiles[order[released++]];
            Body.setStatic(tile, false);
            Body.setVelocity(tile, { x: (random() - 0.5) * 6, y: 4 + random() * 4 });
            Body.setAngularVelocity(tile, (random() - 0.5) * 0.2);
            live.push({ body: tile, bornFrame: frame });
        }

        while (live.length > 0 && frame - live[0].bornFrame > 40) {
            Composite.remove(world, live.shift().body);
            makeTile(60 + random() * 880, 30 + random() * 520);
            order.push(tiles.length - 1);
        }
    }

    return {
        engine,
        nonBoxes,
        step() {
            churn();
            Engine.update(engine, 1000 / 60);
        }
    };
}

const MUTANTS = {
    none: null,
    // reads each box's half extents crossed over, so the partner corner is
    // picked across the wrong axis wherever the two margins differ
    swapHalves: 'swapHalves',
    // settles two level corners by vertex index alone, as a closed form that
    // ignored the general search's own float comparison would
    tieByIndex: 'tieByIndex'
};

function runShadowDifferential({ rotatedStatics, mutant, steps }) {
    const realBoxSearch = Collision._findSupportsBox;
    const realLevelPair = Collision._supportsFromLevelPair;
    const general = Collision._findSupports;
    const counters = { boxCalls: 0, generalCalls: 0, first: 0, second: 0 };
    let insideBoxSearch = false;

    if (mutant === MUTANTS.tieByIndex) {
        Collision._supportsFromLevelPair = function(bodyA, vertices, indexA, indexB) {
            const supports = realLevelPair(bodyA, vertices, indexA, indexB);
            supports[0] = vertices[indexA < indexB ? indexA : indexB];
            supports[1] = vertices[indexA < indexB ? indexB : indexA];
            return supports;
        };
    }

    const paths = createPathCounter();
    const countedGeneral = Collision._findSupports;

    // non-box pairs reach the general search straight from `collides`
    Collision._findSupports = function() {
        if (!insideBoxSearch) {
            counters.generalCalls++;
        }
        return countedGeneral.apply(this, arguments);
    };

    Collision._findSupportsBox = function(bodyA, bodyB, normal, direction) {
        counters.boxCalls++;

        const swap = mutant === MUTANTS.swapHalves;
        const half0 = bodyB._boxHalf0;

        if (swap) {
            bodyB._boxHalf0 = bodyB._boxHalf1;
            bodyB._boxHalf1 = half0;
        }

        insideBoxSearch = true;
        const box = paths.run(() => realBoxSearch(bodyA, bodyB, normal, direction));
        const box0 = box[0];
        const box1 = box[1];
        insideBoxSearch = false;

        if (swap) {
            bodyB._boxHalf1 = bodyB._boxHalf0;
            bodyB._boxHalf0 = half0;
        }

        // the world steps on the general answer, so a mutant cannot steer the
        // scene away from the states the unmutated run compares on
        const result = general(bodyA, bodyB, normal, direction);

        if (result[0] !== box0) {
            counters.first++;
        }

        if (result[1] !== box1) {
            counters.second++;
        }

        return result;
    };

    try {
        const scene = buildScene({ rotatedStatics });

        for (let i = 0; i < steps; i++) {
            scene.step();
        }

        const bodies = Composite.allBodies(scene.engine.world);
        const untaggedBoxes = bodies.filter((body) => body._boxCorners < 0 && scene.nonBoxes.indexOf(body) === -1).length;

        return { counters, paths: paths.counts, untaggedBoxes, bodies: bodies.length };
    } finally {
        paths.restore();
        Collision._findSupportsBox = realBoxSearch;
        Collision._supportsFromLevelPair = realLevelPair;
        Collision._findSupports = general;
    }
}

describe.each([
    ['axis-aligned statics', false],
    ['rotated statics', true]
])('shadow differential in a storm-shaped churn scene (%s)', (label, rotatedStatics) => {
    let result;

    beforeAll(() => {
        result = runShadowDifferential({ rotatedStatics, mutant: MUTANTS.none, steps: 240 });
    });

    it('tagged every box in the world', () => {
        expect(result.bodies).toBeGreaterThan(300);
        expect(result.untaggedBoxes).toBe(0);
    });

    it('ran both searches, and every exit of the box search the scene reaches', () => {
        expect(result.counters.boxCalls).toBeGreaterThan(10000);
        expect(result.counters.generalCalls).toBeGreaterThan(0);
        expect(result.paths.fast).toBeGreaterThan(0);
        expect(result.paths.level).toBeGreaterThan(0);
    });

    it('returned the general search\'s vertices, in its order, on every call', () => {
        expect(result.counters.first).toBe(0);
        expect(result.counters.second).toBe(0);
    });
});

describe('the differential catches a wrong box search', () => {
    it('half extents read crossed over', () => {
        const result = runShadowDifferential({ rotatedStatics: true, mutant: MUTANTS.swapHalves, steps: 120 });
        expect(result.counters.first + result.counters.second).toBeGreaterThan(0);
    });

    it('level corners settled by index alone', () => {
        const result = runShadowDifferential({ rotatedStatics: false, mutant: MUTANTS.tieByIndex, steps: 120 });
        expect(result.counters.first + result.counters.second).toBeGreaterThan(0);
    });
});
