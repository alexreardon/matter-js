/* eslint-env node */
// Puts a Matter build on a broadphase, whichever API that build has.
//
// This fork configures the broadphase per DETECTOR:
//
//   Engine.create({ detector: Detector.create({ broadphase: 'grid', cellSize: 32 }) })
//
// Every release before that (`v0.20.0-perf18` and earlier, and the
// `.bench/s10-base` worktree) configures it on the MODULE instead, as
// `Detector._mode = 'gridStatic'` and `Detector._cellSize`, and upstream has the
// sweep only. An A/B of this tree against one of those must still run BOTH arms
// on the grid, and a bench that sets `_mode` on a current build sets a field
// nothing reads and silently measures the sweep. So every bench that can load
// another build makes its engines through here.
//
// Broadphase names are the current ones, `'sweep'` and `'grid'`. `'gridStatic'`
// is read as `'grid'`, so a command copied from the decision record still runs
// the same broadphase (the rebuild-every-step grid that `'grid'` used to name
// is gone).
"use strict";

const BROADPHASES = ['sweep', 'grid'];

function normalise(broadphase) {
    const name = broadphase === 'gridStatic' ? 'grid' : broadphase;

    if (BROADPHASES.indexOf(name) === -1) {
        throw new Error('unknown broadphase ' + JSON.stringify(broadphase) + ' (expected sweep or grid)');
    }

    return name;
}

// The broadphase an env var names, e.g. `MODE`, or `fallback` when it is unset
function readBroadphase(name, fallback) {
    return normalise(process.env[name] || fallback);
}

// 'detector': configured per detector. 'module': an earlier fork release,
// configured on the Detector module. 'upstream': the sweep only
function apiOf(Matter) {
    const Detector = Matter.Detector;

    if (Detector.create().broadphase !== undefined) {
        return 'detector';
    }

    if ('_mode' in Detector) {
        return 'module';
    }

    return 'upstream';
}

// Options to merge into `Engine.create`'s so its detector runs `broadphase`.
// A module-configured build is configured here as a side effect instead, which
// holds for every engine that module instance makes
function engineOptions({ Matter, broadphase, cellSize = 32 }) {
    const name = normalise(broadphase);
    const api = apiOf(Matter);

    if (api === 'detector') {
        return { detector: Matter.Detector.create({ broadphase: name, cellSize }) };
    }

    if (api === 'module') {
        Matter.Detector._mode = name === 'grid' ? 'gridStatic' : 'sweep';
        Matter.Detector._cellSize = cellSize;
        return {};
    }

    if (name !== 'sweep') {
        throw new Error('this build is upstream matter-js, which has the sweep broadphase only');
    }

    return {};
}

function createEngine({ Matter, broadphase, cellSize = 32, options = {} }) {
    return Matter.Engine.create(Object.assign({}, options, engineOptions({ Matter, broadphase, cellSize })));
}

// A detector used on its own, with no engine around it
function createDetector({ Matter, broadphase, cellSize = 32, options = {} }) {
    const name = normalise(broadphase);

    if (apiOf(Matter) === 'detector') {
        return Matter.Detector.create(Object.assign({}, options, { broadphase: name, cellSize }));
    }

    engineOptions({ Matter, broadphase: name, cellSize });
    return Matter.Detector.create(options);
}

// Changes the cell size of `engine`'s grid between updates
function setCellSize({ Matter, engine, cellSize }) {
    if (apiOf(Matter) === 'detector') {
        engine.detector.cellSize = cellSize;
        return;
    }

    Matter.Detector._cellSize = cellSize;
}

// The broadphase `engine` runs, in the current names
function broadphaseOf({ Matter, engine }) {
    const api = apiOf(Matter);

    if (api === 'detector') {
        return engine.detector.broadphase;
    }

    if (api === 'module') {
        return Matter.Detector._mode === 'gridStatic' ? 'grid' : Matter.Detector._mode;
    }

    return 'sweep';
}

// Counts the calls into `Matter`'s grid broadphase, whatever the build names it,
// so a bench can prove an arm ran the grid rather than assume it. Returns
// `{ calls }`, live
function countGridCalls({ Matter }) {
    const Detector = Matter.Detector;
    const name = apiOf(Matter) === 'module' ? '_collisionsGridStatic' : '_collisionsGrid';
    const grid = Detector[name];
    const counter = { calls: 0 };

    if (typeof grid !== 'function') {
        return counter;
    }

    Detector[name] = function() {
        counter.calls++;
        return grid.apply(this, arguments);
    };

    return counter;
}

// What a build without the automatic moving-static promotion must be told
// after a resting body moves, to match one with it: the explicit tag, applied
// exactly when the fork's own promotion would be (a resting body already in a
// grid index). A no-op on a build that promotes by itself, and on upstream
function afterRestingMove({ Matter, body }) {
    const setGridDynamic = Matter.Detector.setGridDynamic;

    if (typeof setGridDynamic === 'function' && (body.isStatic || body.isSleeping) && body._sIndexed === true) {
        setGridDynamic(body, true);
    }
}

module.exports = {
    readBroadphase,
    apiOf,
    engineOptions,
    createEngine,
    createDetector,
    setCellSize,
    broadphaseOf,
    countGridCalls,
    afterRestingMove
};
