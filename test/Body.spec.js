/* eslint-env es6, jest */
"use strict";

// Unit tests for Body.setPositionAndAngle, the fused pose setter. Its contract
// is BIT-IDENTICAL body state versus calling Body.setPosition then
// Body.setAngle (velocity left unchanged), across every field either call
// touches: position, positionPrev, angle, anglePrev, vertices, axes, and
// bounds. The fused single-pass path only runs when both axes move on a
// single-part body; single-axis changes and compound bodies fall back to the
// stock setters, so the sweep covers all branches. Requires the source modules
// directly (no build step).
const Body = require('../src/body/Body');
const Bodies = require('../src/factory/Bodies');
const Vertices = require('../src/geometry/Vertices');
const Axes = require('../src/geometry/Axes');
const Bounds = require('../src/geometry/Bounds');

// The stock sequence setPositionAndAngle replaces: guarded setPosition +
// setAngle. The parity oracle.
function applyStockPose(body, x, y, angle) {
    if (x !== body.position.x || y !== body.position.y) {
        Body.setPosition(body, { x: x, y: y });
    }
    if (angle !== body.angle) {
        Body.setAngle(body, angle);
    }
}

// Tiny deterministic LCG so the sweep is reproducible run to run.
function createRandom(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0xffffffff;
    };
}

function buildRect(pose) {
    const body = Bodies.rectangle(pose.x, pose.y, 37.5, 18.25);
    Body.setAngle(body, pose.angle);
    Body.setVelocity(body, { x: pose.velocityX, y: pose.velocityY });
    return body;
}

function buildCircle(pose) {
    const body = Bodies.circle(pose.x, pose.y, 9.75);
    Body.setAngle(body, pose.angle);
    Body.setVelocity(body, { x: pose.velocityX, y: pose.velocityY });
    return body;
}

// A two-part compound body, which must take the stock fallback branch.
function buildCompound(pose) {
    const partA = Bodies.rectangle(pose.x - 15, pose.y, 20, 20);
    const partB = Bodies.rectangle(pose.x + 15, pose.y, 20, 20);
    const body = Body.create({ parts: [partA, partB] });
    Body.setAngle(body, pose.angle);
    Body.setVelocity(body, { x: pose.velocityX, y: pose.velocityY });
    return body;
}

// Object.is on every float either call touches, recursively over parts (a
// single-part body has parts = [body], so this also covers the simple case).
// toBe distinguishes +0/-0 and would catch any op-order drift; an epsilon
// comparison would not.
function expectBodiesIdentical(fused, stock) {
    expect(fused.parts.length).toBe(stock.parts.length);
    fused.parts.forEach((fusedPart, partIndex) => {
        const stockPart = stock.parts[partIndex];
        expect(fusedPart.position.x).toBe(stockPart.position.x);
        expect(fusedPart.position.y).toBe(stockPart.position.y);
        expect(fusedPart.positionPrev.x).toBe(stockPart.positionPrev.x);
        expect(fusedPart.positionPrev.y).toBe(stockPart.positionPrev.y);
        expect(fusedPart.angle).toBe(stockPart.angle);
        expect(fusedPart.anglePrev).toBe(stockPart.anglePrev);

        expect(fusedPart.vertices.length).toBe(stockPart.vertices.length);
        fusedPart.vertices.forEach((vertex, index) => {
            expect(vertex.x).toBe(stockPart.vertices[index].x);
            expect(vertex.y).toBe(stockPart.vertices[index].y);
        });

        expect(fusedPart.axes.length).toBe(stockPart.axes.length);
        fusedPart.axes.forEach((axis, index) => {
            expect(axis.x).toBe(stockPart.axes[index].x);
            expect(axis.y).toBe(stockPart.axes[index].y);
        });

        expect(fusedPart.bounds.min.x).toBe(stockPart.bounds.min.x);
        expect(fusedPart.bounds.min.y).toBe(stockPart.bounds.min.y);
        expect(fusedPart.bounds.max.x).toBe(stockPart.bounds.max.x);
        expect(fusedPart.bounds.max.y).toBe(stockPart.bounds.max.y);
    });
}

describe('Body.setPositionAndAngle parity with setPosition + setAngle', () => {
    test('both axes changed on a rectangle is bit-identical (the fused path)', () => {
        const pose = { x: 120.5, y: -33.25, angle: 0.7, velocityX: 3.2, velocityY: -1.7 };
        const fused = buildRect(pose);
        const stock = buildRect(pose);

        Body.setPositionAndAngle(fused, 141.125, -20.0625, 1.3);
        applyStockPose(stock, 141.125, -20.0625, 1.3);

        expectBodiesIdentical(fused, stock);
    });

    test('both axes changed on a circle is bit-identical (many-vertex polygon)', () => {
        const pose = { x: 12, y: 800, angle: -2.1, velocityX: 0, velocityY: 9.5 };
        const fused = buildCircle(pose);
        const stock = buildCircle(pose);

        Body.setPositionAndAngle(fused, 13.5, 780.25, -2.05);
        applyStockPose(stock, 13.5, 780.25, -2.05);

        expectBodiesIdentical(fused, stock);
    });

    test('the fused path actually moves and rotates the body', () => {
        const body = buildRect({ x: 0, y: 0, angle: 0, velocityX: 0, velocityY: 0 });
        const before = body.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));

        Body.setPositionAndAngle(body, 100, 50, 1);

        expect(body.position).toEqual({ x: 100, y: 50 });
        expect(body.angle).toBe(1);
        // Every vertex moved (translation + rotation), proving the pass ran.
        body.vertices.forEach((vertex, index) => {
            expect(vertex.x).not.toBe(before[index].x);
            expect(vertex.y).not.toBe(before[index].y);
        });
    });

    test('position-only change takes the stock setPosition path', () => {
        const pose = { x: 50, y: 60, angle: 0.25, velocityX: -4, velocityY: 2 };
        const fused = buildRect(pose);
        const stock = buildRect(pose);

        Body.setPositionAndAngle(fused, 51.75, 58.5, 0.25);
        applyStockPose(stock, 51.75, 58.5, 0.25);

        expectBodiesIdentical(fused, stock);
    });

    test('angle-only change takes the stock setAngle path', () => {
        const pose = { x: 50, y: 60, angle: 0.25, velocityX: 0.5, velocityY: -0.5 };
        const fused = buildRect(pose);
        const stock = buildRect(pose);

        Body.setPositionAndAngle(fused, 50, 60, 0.5);
        applyStockPose(stock, 50, 60, 0.5);

        expectBodiesIdentical(fused, stock);
    });

    test('no change leaves the body untouched', () => {
        const pose = { x: 50, y: 60, angle: 0.25, velocityX: 1, velocityY: 1 };
        const fused = buildRect(pose);
        const stock = buildRect(pose);

        Body.setPositionAndAngle(fused, 50, 60, 0.25);
        applyStockPose(stock, 50, 60, 0.25);

        expectBodiesIdentical(fused, stock);
    });

    test('a compound body takes the stock fallback and stays bit-identical', () => {
        const pose = { x: 200, y: 120, angle: 0.4, velocityX: 2, velocityY: -3 };
        const fused = buildCompound(pose);
        const stock = buildCompound(pose);

        Body.setPositionAndAngle(fused, 214.5, 133.25, 0.95);
        applyStockPose(stock, 214.5, 133.25, 0.95);

        expectBodiesIdentical(fused, stock);
    });

    test('randomized sweep stays bit-identical across shapes, poses, and repeats', () => {
        const random = createRandom(20260713);
        for (let iteration = 0; iteration < 200; iteration++) {
            const pose = {
                x: (random() - 0.5) * 4000,
                y: (random() - 0.5) * 40000,
                angle: (random() - 0.5) * 8,
                velocityX: (random() - 0.5) * 30,
                velocityY: (random() - 0.5) * 30
            };
            const useCircle = random() > 0.5;
            const fused = useCircle ? buildCircle(pose) : buildRect(pose);
            const stock = useCircle ? buildCircle(pose) : buildRect(pose);

            // Repeated applies compound float state, so drift anywhere amplifies.
            for (let step = 0; step < 5; step++) {
                const nextX = pose.x + (random() - 0.5) * 60;
                const nextY = pose.y + (random() - 0.5) * 60;
                const nextAngle = pose.angle + (random() - 0.5) * 1.5;
                Body.setPositionAndAngle(fused, nextX, nextY, nextAngle);
                applyStockPose(stock, nextX, nextY, nextAngle);
                pose.x = nextX;
                pose.y = nextY;
                pose.angle = nextAngle;
            }

            expectBodiesIdentical(fused, stock);
        }
    });
});

// Body._transformSinglePart is Body.update's geometry step for a single-part
// body. Its contract is BIT-IDENTICAL state versus the helper sequence it
// replaced: vertices, axes, bounds and the self-projection memo flag, compared
// with Object.is so a signed zero or a NaN counts.
function applyStockTransform(part, velocity, angularVelocity, position) {
    Vertices.translate(part.vertices, velocity);
    if (angularVelocity !== 0) {
        Vertices.rotate(part.vertices, angularVelocity, position);
        Axes.rotate(part.axes, angularVelocity);
    }
    Bounds.update(part.bounds, part.vertices, velocity);
}

// A bare part with hand-set coordinates, for the cases a factory body cannot
// reach (signed zeros, NaN, no vertices). Each vertex points back at the part,
// as a real body's vertices do, so the memo flag is exercised.
function buildPart(coordinates, axes) {
    const part = {
        vertices: [],
        axes: axes.map((axis) => ({ x: axis.x, y: axis.y })),
        bounds: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
        _spValid: true
    };
    part.vertices = coordinates.map((point, index) => ({ x: point.x, y: point.y, index: index, body: part, isInternal: false }));
    return part;
}

function collectPartMismatches(fused, stock, label) {
    const mismatches = [];
    function compare(name, fusedValue, stockValue) {
        if (!Object.is(fusedValue, stockValue)) {
            mismatches.push(`${label} ${name}: ${fusedValue} vs ${stockValue}`);
        }
    }
    compare('vertices.length', fused.vertices.length, stock.vertices.length);
    fused.vertices.forEach((vertex, index) => {
        compare(`vertices[${index}].x`, vertex.x, stock.vertices[index].x);
        compare(`vertices[${index}].y`, vertex.y, stock.vertices[index].y);
    });
    compare('axes.length', fused.axes.length, stock.axes.length);
    fused.axes.forEach((axis, index) => {
        compare(`axes[${index}].x`, axis.x, stock.axes[index].x);
        compare(`axes[${index}].y`, axis.y, stock.axes[index].y);
    });
    compare('bounds.min.x', fused.bounds.min.x, stock.bounds.min.x);
    compare('bounds.min.y', fused.bounds.min.y, stock.bounds.min.y);
    compare('bounds.max.x', fused.bounds.max.x, stock.bounds.max.x);
    compare('bounds.max.y', fused.bounds.max.y, stock.bounds.max.y);
    compare('_spValid', fused._spValid, stock._spValid);
    return mismatches;
}

// Runs both paths on twin parts and returns every field that differs.
function transformBoth(buildTwin, velocity, angularVelocity, position, label) {
    const fused = buildTwin();
    const stock = buildTwin();
    Body._transformSinglePart(fused, { x: velocity.x, y: velocity.y }, angularVelocity, { x: position.x, y: position.y });
    applyStockTransform(stock, { x: velocity.x, y: velocity.y }, angularVelocity, { x: position.x, y: position.y });
    return collectPartMismatches(fused, stock, label);
}

describe('Body._transformSinglePart parity with translate + rotate + Axes.rotate + Bounds.update', () => {
    const SIGNED_ZEROS = [0, -0];
    const SPECIAL_ANGLES = [Math.PI, -Math.PI, Math.PI / 2, 5e-324, -5e-324, 1e-300, NaN, Infinity];

    test('random poses on factory bodies stay bit-identical, both velocity signs, over repeated steps', () => {
        const random = createRandom(20260929);
        const builders = [
            (pose) => Bodies.rectangle(pose.x, pose.y, 37.5, 18.25),
            (pose) => Bodies.circle(pose.x, pose.y, 9.75),
            (pose) => Bodies.polygon(pose.x, pose.y, 5, 14.5),
            (pose) => Bodies.trapezoid(pose.x, pose.y, 30, 20, 0.4)
        ];
        const mismatches = [];
        for (let iteration = 0; iteration < 400; iteration++) {
            const pose = {
                x: (random() - 0.5) * 4000,
                y: (random() - 0.5) * 40000,
                angle: (random() - 0.5) * 8
            };
            const build = builders[iteration % builders.length];
            const fused = build(pose);
            const stock = build(pose);
            Body.setAngle(fused, pose.angle);
            Body.setAngle(stock, pose.angle);

            // Repeated steps compound float state, so drift anywhere amplifies.
            for (let step = 0; step < 6; step++) {
                const velocity = { x: (random() - 0.5) * 30, y: (random() - 0.5) * 30 };
                // one step in six does not rotate, which takes the helper path
                const angularVelocity = step === 5 ? 0 : (random() - 0.5) * 0.4;
                const position = { x: fused.position.x + velocity.x, y: fused.position.y + velocity.y };
                fused._spValid = true;
                stock._spValid = true;
                Body._transformSinglePart(fused, velocity, angularVelocity, position);
                applyStockTransform(stock, velocity, angularVelocity, position);
            }
            mismatches.push(...collectPartMismatches(fused, stock, `iteration ${iteration}`));
        }
        expect(mismatches).toEqual([]);
    });

    test('signed zeros and ties in every coordinate, velocity, position and angle stay bit-identical', () => {
        const mismatches = [];
        const axes = [{ x: 0, y: 1 }, { x: -0, y: -1 }];
        // every sign pattern of three zero vertices, so the bounds folds meet
        // +0 and -0 ties in both orders
        for (let pattern = 0; pattern < 64; pattern++) {
            const coordinates = [0, 1, 2].map((index) => ({
                x: SIGNED_ZEROS[(pattern >> (index * 2)) & 1],
                y: SIGNED_ZEROS[(pattern >> (index * 2 + 1)) & 1]
            }));
            SPECIAL_ANGLES.concat([0, -0]).forEach((angularVelocity) => {
                SIGNED_ZEROS.forEach((velocityX) => {
                    SIGNED_ZEROS.forEach((velocityY) => {
                        SIGNED_ZEROS.forEach((positionX) => {
                            SIGNED_ZEROS.forEach((positionY) => {
                                mismatches.push(...transformBoth(
                                    () => buildPart(coordinates, axes),
                                    { x: velocityX, y: velocityY },
                                    angularVelocity,
                                    { x: positionX, y: positionY },
                                    `pattern ${pattern} angle ${angularVelocity}`
                                ));
                            });
                        });
                    });
                });
            });
        }
        expect(mismatches).toEqual([]);
    });

    test('a -0 then +0 tie keeps the held -0 in the bounds', () => {
        // With cos = -1 and these zeros the first vertex lands on x = -0 and
        // the second on x = +0, so max.x must stay at the first value.
        const coordinates = [{ x: 0, y: 0 }, { x: 0, y: -0 }];
        const part = buildPart(coordinates, []);
        Body._transformSinglePart(part, { x: 0, y: -0 }, Math.PI, { x: -0, y: 0 });
        expect(Object.is(part.vertices[0].x, -0)).toBe(true);
        expect(Object.is(part.vertices[1].x, 0)).toBe(true);
        expect(Object.is(part.bounds.max.x, -0)).toBe(true);
        expect(transformBoth(() => buildPart(coordinates, []), { x: 0, y: -0 }, Math.PI, { x: -0, y: 0 }, 'tie')).toEqual([]);
    });

    test('NaN and infinite inputs stay bit-identical', () => {
        const mismatches = [];
        const specials = [NaN, Infinity, -Infinity, 0, -0, 3.5, -3.5];
        const baseCoordinates = [{ x: 1, y: 2 }, { x: -4, y: 2 }, { x: -4, y: -7 }, { x: 1, y: -7 }];
        const axes = [{ x: 0, y: 1 }, { x: 1, y: 0 }];
        specials.forEach((special, specialIndex) => {
            // a special value in vertex 0 (the fold seed) and in a later vertex
            [0, 2].forEach((vertexIndex) => {
                const coordinates = baseCoordinates.map((point, index) => (index === vertexIndex ? { x: special, y: point.y } : point));
                mismatches.push(...transformBoth(() => buildPart(coordinates, axes), { x: 1.25, y: -0.5 }, 0.3, { x: -1, y: -2 }, `vertex ${vertexIndex} ${special}`));
            });
            mismatches.push(...transformBoth(() => buildPart(baseCoordinates, axes), { x: special, y: -0.5 }, 0.3, { x: -1, y: -2 }, `velocity.x ${special}`));
            mismatches.push(...transformBoth(() => buildPart(baseCoordinates, axes), { x: 1.25, y: special }, -0.3, { x: -1, y: -2 }, `velocity.y ${special}`));
            mismatches.push(...transformBoth(() => buildPart(baseCoordinates, axes), { x: 1.25, y: -0.5 }, special, { x: -1, y: -2 }, `angularVelocity ${special}`));
            mismatches.push(...transformBoth(() => buildPart(baseCoordinates, axes), { x: 1.25, y: -0.5 }, 0.3, { x: special, y: specials[(specialIndex + 1) % specials.length] }, `position ${special}`));
        });
        expect(mismatches).toEqual([]);
    });

    test('zero angular velocity and zero vertices take the helpers and stay bit-identical', () => {
        const mismatches = [];
        const coordinates = [{ x: 1, y: 2 }, { x: -4, y: 2 }, { x: -4, y: -7 }];
        const axes = [{ x: 0.6, y: 0.8 }, { x: -0.8, y: 0.6 }];
        [0, -0].forEach((angularVelocity) => {
            mismatches.push(...transformBoth(() => buildPart(coordinates, axes), { x: 2.5, y: -1.5 }, angularVelocity, { x: 3, y: 4 }, `angle ${angularVelocity}`));
        });
        [0, -0, 0.25, -0.25].forEach((angularVelocity) => {
            mismatches.push(...transformBoth(() => buildPart([], axes), { x: 2.5, y: -1.5 }, angularVelocity, { x: 3, y: 4 }, `no vertices, angle ${angularVelocity}`));
        });
        expect(mismatches).toEqual([]);

        // the no-vertex path still rotates the axes and empties the bounds
        const empty = buildPart([], axes);
        Body._transformSinglePart(empty, { x: 2.5, y: -1.5 }, 0.25, { x: 3, y: 4 });
        expect(empty.axes[0].x).not.toBe(0.6);
        expect(empty.bounds.min.x).toBe(Infinity);
        expect(empty.bounds.max.x).toBe(-Infinity);
        expect(empty._spValid).toBe(true);
    });
});
