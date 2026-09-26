/* eslint-env es6, jest */
"use strict";

// Controls for the box tag (`Body._updateBoxTag`), which `Collision.collides`
// reads to choose the closed-form support search (`Collision._findSupportsBox`).
//
// The tag must be decided by ACTUAL geometry, never by the factory that built a
// body, so it has to say NO to every shape that is not a rectangle centred on
// its `position`, including the ones a naive "4 vertices and 2 axes" test
// passes: a trapezoid, a parallelogram, a compound parent whose hull has four
// corners, and a rectangle whose centre was moved off its vertices. Every shape
// it accepts must carry a corner table that names the vertex really sitting on
// each pair of sides, since the support search reads its answer off that table.
const Matter = require('../src/module/main.js');
const { Bodies, Body, Vertices } = Matter;

// the corner table must name, for each side pair, the vertex that really sits
// on those sides, and the half extents must be the real ones
function findCornerTableViolation(body) {
    const axes = body.axes;

    for (let k = 0; k < 4; k++) {
        const vertex = body.vertices[k];
        const offsetX = vertex.x - body.position.x;
        const offsetY = vertex.y - body.position.y;
        const offset0 = offsetX * axes[0].x + offsetY * axes[0].y;
        const offset1 = offsetX * axes[1].x + offsetY * axes[1].y;
        const code = (offset0 > 0 ? 1 : 0) | (offset1 > 0 ? 2 : 0);

        if (((body._boxCorners >> (code << 1)) & 3) !== k) {
            return `corner ${k} is not where the table puts it`;
        }

        if (Math.abs(Math.abs(offset0) - body._boxHalf0) > 1e-9 || Math.abs(Math.abs(offset1) - body._boxHalf1) > 1e-9) {
            return `corner ${k} is not at the half extents`;
        }
    }

    return null;
}

function isBox(body) {
    return body._boxCorners >= 0;
}

function makeRotatedParallelogram() {
    const body = Bodies.rectangle(100, 100, 40, 20, { angle: 0.5 });
    Body.scale(body, 2, 1);
    return body;
}

function makeUniformlyScaled() {
    const body = Bodies.rectangle(100, 100, 40, 20, { angle: 0.5 });
    Body.scale(body, 1.5, 1.5);
    return body;
}

function makeUnrotatedStretch() {
    const body = Bodies.rectangle(100, 100, 40, 20);
    Body.scale(body, 2, 1);
    return body;
}

function makeSetAngle() {
    const body = Bodies.rectangle(100, 100, 30, 40);
    Body.setAngle(body, 2.1);
    return body;
}

function makeCompound() {
    const partA = Bodies.rectangle(200, 200, 30, 16);
    const partB = Bodies.rectangle(230, 200, 30, 16);
    return { parent: Body.create({ parts: [partA, partB] }), child: partA };
}

function makeMovedCentre() {
    const body = Bodies.rectangle(100, 100, 30, 40);
    Body.setCentre(body, { x: 5, y: 0 }, true);
    return body;
}

function makeReshapedToTriangle() {
    const body = Bodies.rectangle(100, 100, 30, 40);
    Body.setVertices(body, Vertices.fromPath('L 0 0 L 40 0 L 20 30'));
    return body;
}

function makeCircleReshapedToRectangle() {
    const body = Bodies.circle(100, 100, 12);
    Body.setVertices(body, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }]);
    return body;
}

// a near-uniform scale of a rotated box shears it by less than the axis
// tolerance (|a0.a1| ~1e-9), which on a body thousands of px long still moves a
// corner's ranking by more than the corner tolerance
function makeLongSheared() {
    const body = Bodies.rectangle(500, 500, 4000, 20, { angle: 0.7 });
    Body.scale(body, 1 + 1e-9, 1);
    return body;
}

function makeNonOrthogonalAxes() {
    const body = Bodies.rectangle(100, 100, 30, 40);
    Body.set(body, 'axes', [{ x: 1, y: 0 }, { x: 0.6, y: 0.8 }]);
    return body;
}

// [label, build, expected tag]
const CONTROLS = [
    ['rectangle 30x40', () => Bodies.rectangle(100, 100, 30, 40), true],
    ['rectangle rotated at build (angle 0.3)', () => Bodies.rectangle(100, 100, 30, 40, { angle: 0.3 }), true],
    ['rectangle, Body.setAngle(2.1)', makeSetAngle, true],
    ['square built as Bodies.polygon(4 sides)', () => Bodies.polygon(100, 100, 4, 20), true],
    ['1x1 px rectangle (the game floor)', () => Bodies.rectangle(100, 100, 1, 1), true],
    ['rectangle at page coordinates (x 1e6)', () => Bodies.rectangle(1e6, 2e5, 17, 9), true],
    ['circle radius 3 (10-gon)', () => Bodies.circle(100, 100, 3), false],
    ['circle radius 14', () => Bodies.circle(100, 100, 14), false],
    ['triangle', () => Bodies.polygon(100, 100, 3, 20), false],
    ['pentagon', () => Bodies.polygon(100, 100, 5, 20), false],
    ['trapezoid (4 vertices, 3 axes)', () => Bodies.trapezoid(100, 100, 40, 20, 0.3), false],
    ['chamfered rectangle', () => Bodies.rectangle(100, 100, 40, 20, { chamfer: { radius: 4 } }), false],
    ['rotated rectangle scaled 2 x 1 (a parallelogram: 4 vertices, 2 axes)', makeRotatedParallelogram, false],
    ['rotated rectangle scaled 1.5 x 1.5 (still a box)', makeUniformlyScaled, true],
    ['unrotated rectangle scaled 2 x 1 (still a box)', makeUnrotatedStretch, true],
    ['compound parent of two boxes (its hull is a 4-corner box)', () => makeCompound().parent, false],
    ['compound CHILD part (a real box about its own position)', () => makeCompound().child, true],
    ['rectangle after Body.setCentre (position off the centre)', makeMovedCentre, false],
    ['rectangle reshaped to a triangle by Body.setVertices', makeReshapedToTriangle, false],
    ['circle reshaped to a rectangle by Body.setVertices', makeCircleReshapedToRectangle, true],
    ['rectangle given non-orthogonal axes through Body.set', makeNonOrthogonalAxes, false],
    ['4000 px rectangle rotated at build (angle 0.7, still a box)', () => Bodies.rectangle(500, 500, 4000, 20, { angle: 0.7 }), true],
    ['4000 px rotated rectangle sheared inside the axis tolerance', makeLongSheared, false]
];

describe('the box tag is decided by geometry', () => {
    it('covers every control', () => {
        expect(CONTROLS.length).toBe(23);
    });

    it.each(CONTROLS)('%s', (label, build, expected) => {
        const body = build();

        expect(isBox(body)).toBe(expected);

        if (expected) {
            expect(findCornerTableViolation(body)).toBe(null);
        } else {
            expect(body._boxHalf0).toBe(0);
            expect(body._boxHalf1).toBe(0);
        }
    });

    it('rejects a vertex ring that crosses a diagonal, even with the corners and axes of a box', () => {
        const body = Bodies.rectangle(100, 100, 30, 40, { angle: 0.4 });
        expect(isBox(body)).toBe(true);

        // swap two ring neighbours: the corners, the quadrants and the axes are
        // all still a box's, but the ring now runs 0 -> 2 -> 1 -> 3, a bow tie
        const vertices = body.vertices;
        const moved = vertices[1];
        vertices[1] = vertices[2];
        vertices[2] = moved;
        vertices[1].index = 1;
        vertices[2].index = 2;
        Body._updateBoxTag(body);

        expect(isBox(body)).toBe(false);
    });

    it('rejects a vertex whose index is not its array position', () => {
        const body = Bodies.rectangle(100, 100, 30, 40);
        body.vertices[3].index = 7;
        Body._updateBoxTag(body);

        expect(isBox(body)).toBe(false);
    });

    it('a new body already carries the tag its finished geometry gives', () => {
        // `_initProperties` takes the tag in the `axes` setter, after rotation;
        // re-taking it must change nothing. Factory output only: a later
        // rotation moves the half extents in their last bits, which the
        // tolerances of the tag and of the support search absorb by design
        const bodies = [
            Bodies.rectangle(100, 100, 30, 40),
            Bodies.rectangle(100, 100, 30, 40, { angle: 0.3 }),
            Bodies.rectangle(10, 20, 7, 3, { angle: 2.5, isStatic: true }),
            Bodies.rectangle(1e6, 2e5, 17, 9, { angle: 1.1 }),
            Bodies.polygon(10, 20, 4, 9, { angle: -0.7 }),
            Bodies.circle(100, 100, 3),
            Bodies.trapezoid(100, 100, 40, 20, 0.3),
            makeCompound().parent,
            makeCompound().child
        ];

        for (const body of bodies) {
            const before = [body._boxCorners, body._boxHalf0, body._boxHalf1];
            Body._updateBoxTag(body);
            expect([body._boxCorners, body._boxHalf0, body._boxHalf1]).toEqual(before);
        }
    });

    it('rotation and translation keep the tag valid without recomputing it', () => {
        const body = Bodies.rectangle(300, 200, 26, 11);

        for (let step = 0; step < 50; step++) {
            Body.setAngle(body, body.angle + 0.37);
            Body.setPosition(body, { x: body.position.x + 13.1, y: body.position.y - 7.3 });
            Body.rotate(body, -0.11);
            Body.translate(body, { x: 0.5, y: 0.25 });
        }

        expect(isBox(body)).toBe(true);
        expect(findCornerTableViolation(body)).toBe(null);
    });
});
