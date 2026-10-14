/* eslint-env es6, jest */
"use strict";

const Axes = require('../src/geometry/Axes');
const Vector = require('../src/geometry/Vector');
const Common = require('../src/core/Common');

// The original reduction is an independent oracle, including key ordering,
// rounded gradients, NaN and signed zero.
function originalAxes(vertices) {
    const axes = {};
    for (let index = 0; index < vertices.length; index++) {
        const next = (index + 1) % vertices.length;
        const normal = Vector.normalise({
            x: vertices[next].y - vertices[index].y,
            y: vertices[index].x - vertices[next].x
        });
        const gradient = normal.y === 0 ? Infinity : normal.x / normal.y;
        axes[gradient.toFixed(3).toString()] = normal;
    }
    return Common.values(axes);
}

function rectangle(x, y, width, height) {
    return [
        { x, y }, { x: x + width, y },
        { x: x + width, y: y + height }, { x, y: y + height }
    ];
}

function expectIdentical(vertices) {
    const actual = Axes.fromVertices(vertices);
    const expected = originalAxes(vertices);
    expect(actual.length).toBe(expected.length);
    actual.forEach((axis, index) => {
        expect(axis.x).toBe(expected[index].x);
        expect(axis.y).toBe(expected[index].y);
    });
}

describe('rectangle axis reduction', () => {
    test('normalises only the two surviving edges', () => {
        const normalise = jest.spyOn(Vector, 'normalise');
        try {
            expect(Axes.fromVertices(rectangle(0, 0, 37, 19))).toEqual([
                { x: 0, y: 1 }, { x: -1, y: 0 }
            ]);
            expect(normalise).toHaveBeenCalledTimes(2);
        } finally {
            normalise.mockRestore();
        }
    });

    test('keeps exact normals and ordering at varied sizes, offsets and winding', () => {
        let seed = 9123;
        function random() {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        }
        for (let index = 0; index < 3000; index++) {
            const vertices = rectangle((random() - 0.5) * 1e5, (random() - 0.5) * 1e5,
                (random() - 0.5) * 1000, (random() - 0.5) * 1000);
            for (let rotation = 0; rotation < 4; rotation++) {
                expectIdentical(vertices.slice(rotation).concat(vertices.slice(0, rotation)));
            }
            expectIdentical(vertices.slice().reverse());
        }
    });

    test('falls back for degenerate, underflowing and overflowing normals', () => {
        const dimensions = [0, -0, 1e-300, 1e-160, 1e-155, 1e100, 1e155, 1e300, Infinity, NaN];
        dimensions.forEach(width => dimensions.forEach(height => {
            expectIdentical(rectangle(0, 0, width, height));
        }));
        expectIdentical([{ x: -0, y: -0 }, { x: 10, y: -0 },
            { x: 10, y: 10 }, { x: -0, y: 10 }]);
    });

    test('preserves the general polygon reduction', () => {
        expectIdentical([]);
        expectIdentical([{ x: 1, y: 2 }]);
        expectIdentical([{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 5, y: 9 }]);
        expectIdentical([{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 9, y: 10 }, { x: 1, y: 9 }]);
        expectIdentical([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 12, y: 7 }, { x: 8, y: 12 }, { x: 0, y: 8 }]);
    });
});
