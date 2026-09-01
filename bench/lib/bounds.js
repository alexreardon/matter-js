/* eslint-env node */
// Shared scene bounds for the page-regime benches.
//
// A floor and two walls keep debris piling instead of escaping the field. Built
// as SINGLE bodies they are a measurement bug: the gridStatic oversize predicate
// refuses to bucket a static spanning more than `maxCells` (24) cells of the
// broadphase grid, so each one lands on `g.sOver`, an unindexed list EVERY mover
// rescans in full every step. Three bounds cost 900 such tests per calm step and
// 1476 per churn step, rejecting 91.6% and 99.87% of the time.
//
// The shipped game holds ZERO oversized statics on all six fixtures (worldgen
// subdivides a panel into tiles before the body reaches the physics world), so
// that whole cross product is bench work the real workload never pays. It is
// worse than a flat tax: the cost scales with MOVERS, which a population sweep
// holds FIXED, so it dilutes a per-body delta more at low STATICS than at high
// and manufactures a growing trend out of nothing.
//
// Build the same geometry out of tiles instead.
"use strict";

const BOUND_CELL_SIZE = 32;
const BOUND_MAX_CELLS = 24;

// Longest piece that cannot span more than `BOUND_MAX_CELLS` cells once the
// short axis is accounted for. A length L spans at most `floor(L / cell) + 2`
// cells whatever its offset, so this inverts that bound rather than measuring
// the pieces after the fact.
function longestSafePiece({ shortSide }) {
    const shortCells = Math.floor(shortSide / BOUND_CELL_SIZE) + 2;
    return (Math.floor(BOUND_MAX_CELLS / shortCells) - 2) * BOUND_CELL_SIZE;
}

// Adds one bound (a floor or a wall) as a row of tiles, and returns the bodies
// it created, so a caller can report a correct static count (`.length`) and hand
// them to `assertBoundsBucketed` below.
function addTiledBound({ Matter, world, centreX, centreY, width, height }) {
    const { Composite, Bodies } = Matter;
    const horizontal = width >= height;
    const longSide = horizontal ? width : height;
    const pieceCount = Math.ceil(longSide / longestSafePiece({ shortSide: horizontal ? height : width }));
    const pieceLength = longSide / pieceCount;
    const pieces = [];

    for (let piece = 0; piece < pieceCount; piece++) {
        const offset = -longSide / 2 + pieceLength * (piece + 0.5);
        const body = Bodies.rectangle(
            horizontal ? centreX + offset : centreX,
            horizontal ? centreY : centreY + offset,
            horizontal ? pieceLength : width,
            horizontal ? height : pieceLength,
            { isStatic: true }
        );
        Composite.add(world, body);
        pieces.push(body);
    }

    return pieces;
}

// Call AFTER at least one `Engine.update`, which is what fills the static index.
//
// This is the real check, and it is deliberately not a check on the constants
// above. The piece size is baked against `BOUND_CELL_SIZE` and `BOUND_MAX_CELLS`
// so a scene stays byte-stable across engine changes, and a bake drifts
// SILENTLY, which is the exact bug the tiling replaces. `Detector._cellSize` can
// at least be read back; the engine's `maxCells` is a local literal inside
// `_collisionsGridStatic` and cannot be. So assert the OUTCOME instead: no piece
// of a tiled bound reached the oversized list, whatever either constant is now.
//
// It asks about the BOUNDS ONLY, and not about `sOver` being empty, because the
// rest of a bench scene is not this module's promise and the wider form
// false-fails: a page-tile grid sized by a STATICS count derives its tile size
// from that count, so a low-STATICS sweep point (300 statics reads 116x110px
// tiles, spanning 49 cells) legitimately puts page tiles on `sOver` while every
// bound is correctly bucketed. That is a caveat for reading a population sweep
// at its small end, not a failure of the bounds.
//
// Only meaningful in `gridStatic` mode, which is the mode these benches profile;
// the sweep arm builds no index and is skipped rather than failed.
function assertBoundsBucketed({ Matter, engine, bounds, label }) {
    if (Matter.Detector._mode !== 'gridStatic') {
        return;
    }

    const grid = engine.detector._sgrid;

    if (!grid) {
        throw new Error(label + ': no static index; step the engine before asserting');
    }

    const oversized = bounds.filter(body => grid.sOver.indexOf(body) !== -1);

    if (oversized.length !== 0) {
        throw new Error(label + ': ' + oversized.length + ' of ' + bounds.length
            + ' bound pieces reached `sOver`. The tiling in bench/lib/bounds.js is baked for '
            + 'cellSize ' + BOUND_CELL_SIZE + ' and maxCells ' + BOUND_MAX_CELLS
            + '; one of those has moved in the engine. Re-bake them deliberately, or this '
            + 'bench measures a cost the game never pays');
    }
}

module.exports = { BOUND_CELL_SIZE, BOUND_MAX_CELLS, addTiledBound, assertBoundsBucketed };
