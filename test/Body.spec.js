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
