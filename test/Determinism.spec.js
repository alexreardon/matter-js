/* eslint-env es6, jest */
"use strict";

// Chaos-aware regression guards for the solver and broadphase.
//
// This fork exists to change the broadphase and solver for performance, and
// every such change risks the physics. A snapshot suite (Examples.spec.js)
// cannot tell a real regression from chaotic float-reordering noise, so it gets
// re-blessed and masks bugs. This spec separates the two by scene type:
//
//   Tier 1 (non-chaotic guards, tight epsilon): scenes that do not amplify
//     float noise over the steps they run (a stack that settles; a box that
//     lands on a ramp, stopped before it tips onto a corner, from where it
//     amplifies about tenfold per step). Their final transform is pinned. A real
//     solver/broadphase regression moves them well past EPS; a float-reordering
//     micro-optimisation stays under it. EPS (not bit-exact) is the bar on
//     purpose, so an intended reordering opt does not force a re-bless. The
//     grid run is the guard for the perf broadphase: it must reproduce the
//     trusted sweep pose (today it is bit-identical).
//
//   Tier 2 (chaotic scene, statistical only): a tumbling pile. Its exact pose is
//     NEVER asserted (see Tier 3); only physical invariants are (finite, bounded,
//     no explosion, body count).
//
//   Tier 3 (sensitivity documenter): proves the tumbling scene amplifies a 1e-9
//     nudge to pixels, which is WHY Tier 2 is statistical. Without this, someone
//     would eventually "fix" the flakiness by tightening a tolerance and pin a
//     value that is not reproducible across platforms or refactors.
//
// Golden values were captured from this fork under the sweep broadphase (run
// each scene and read poses(bodies); the scenes and helper live in this file).
// Regenerate them only when blessing an intended scene or numerical change,
// never to silence a failure.

const Engine = require('../src/core/Engine');
const Bodies = require('../src/factory/Bodies');
const Composite = require('../src/body/Composite');
const Detector = require('../src/collision/Detector');

const DELTA = 1000 / 60;

// Tight, but not bit-exact: ~1um of simulated space. Non-chaotic scenes do not
// amplify, so this stays a meaningful bound across refactors.
const EPS = 1e-6;

// Runs a scene to rest and returns its bodies. gravity is pinned so the golden
// values are reproducible; the broadphase is a parameter so the same scene can
// be checked under both the sweep and the perf grid index.
function run({ steps, broadphase, setup }) {
    const engine = Engine.create({ detector: Detector.create({ broadphase, cellSize: 32 }) });
    engine.gravity.x = 0;
    engine.gravity.y = 1;
    engine.gravity.scale = 0.001;
    const bodies = [];
    setup({ engine, bodies });
    for (let step = 0; step < steps; step++) {
        Engine.update(engine, DELTA);
    }
    return bodies;
}

// A vertical stack of 5 boxes falling and settling on a floor: translational
// dynamics, box-box and box-floor contacts, friction, resting stability.
function buildStack({ engine, bodies }) {
    const floor = Bodies.rectangle(300, 500, 600, 40, { isStatic: true });
    Composite.add(engine.world, floor);
    bodies.push(floor);
    for (let i = 0; i < 5; i++) {
        const box = Bodies.rectangle(300, 100 + i * 45, 40, 40);
        Composite.add(engine.world, box);
        bodies.push(box);
    }
}

// A single box falling onto a tilted ramp and sliding: rotated SAT axes, angular
// integration, sliding friction. It is non-chaotic only until about step 32,
// where it tips onto one corner and rocks: from there a 1e-9 px nudge of its
// start grows about tenfold per step (1e-5 px by step 40, 0.1 px by step 60),
// so the scene is run for 30 steps, where the same nudge still moves it 1e-9.
function buildRamp({ engine, bodies }) {
    const platform = Bodies.rectangle(300, 400, 400, 20, { isStatic: true, angle: 0.3 });
    Composite.add(engine.world, platform);
    bodies.push(platform);
    const box = Bodies.rectangle(320, 365, 30, 30);
    Composite.add(engine.world, box);
    bodies.push(box);
}

// Three boxes dropped at offsets onto a ramp above a floor: they collide,
// tumble, and cascade. This is genuinely chaotic (Tier 3 proves it). `perturb`
// nudges the first box's initial x to probe sensitivity. Only the boxes are
// pushed to `bodies` (the static platform and floor are not under test).
function buildTumble({ perturb }) {
    return ({ engine, bodies }) => {
        const platform = Bodies.rectangle(300, 400, 400, 20, { isStatic: true, angle: 0.3 });
        Composite.add(engine.world, platform);
        const floor = Bodies.rectangle(300, 580, 800, 40, { isStatic: true });
        Composite.add(engine.world, floor);
        for (let i = 0; i < 3; i++) {
            const x = 220 + i * 50 + (i === 0 ? perturb : 0);
            const box = Bodies.rectangle(x, 120 + i * 20, 30, 30);
            Composite.add(engine.world, box);
            bodies.push(box);
        }
    };
}

function poses(bodies) {
    return bodies.map((body) => [body.position.x, body.position.y, body.angle]);
}

function expectPose(bodies, golden) {
    expect(bodies).toHaveLength(golden.length);
    bodies.forEach((body, index) => {
        const [x, y, angle] = golden[index];
        expect(Math.abs(body.position.x - x)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(body.position.y - y)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(body.angle - angle)).toBeLessThanOrEqual(EPS);
    });
}

// Final [x, y, angle] of every body, captured from this fork under sweep.
const STACK_GOLDEN = [
    [300, 500, 0],
    [300, 302.19726876907436, 0],
    [300, 342.0438564109569, 0],
    [300, 381.6833980228797, 0],
    [300, 421.1248585003625, 0],
    [300, 460.4116826427915, 0],
];

// The pose at step 30, before the box tips (see buildRamp). The fused box-box
// SAT moves it 6e-14 from the general reduction, far inside EPS; at step 60,
// where this scene used to end, the same last-bit change moved it 0.109 px and
// forced a re-pin.
const RAMP_STEPS = 30;
const RAMP_GOLDEN = [
    [300, 400, 0.3],
    [332.6376045283045, 380.9227706551147, 0.5292270363536637],
];

describe('Tier 1: non-chaotic regression guards (pinned pose, epsilon)', () => {
    test('a 5-box stack settles to the pinned pose (sweep)', () => {
        const bodies = run({ steps: 180, broadphase: 'sweep', setup: buildStack });
        expectPose(bodies, STACK_GOLDEN);
    });

    // The perf-broadphase guard: the grid must reproduce the trusted sweep
    // pose. Detector.spec.js already proves the grid finds the same PAIRS as
    // the sweep; this proves the same pairs produce the same settled STATE.
    test('the same stack under the grid matches the sweep pose', () => {
        const bodies = run({ steps: 180, broadphase: 'grid', setup: buildStack });
        expectPose(bodies, STACK_GOLDEN);
    });

    test('a box slides down a ramp to the pinned pose (sweep)', () => {
        const bodies = run({ steps: RAMP_STEPS, broadphase: 'sweep', setup: buildRamp });
        expectPose(bodies, RAMP_GOLDEN);
    });
});

describe('Tier 2: chaotic scene, statistical invariants only', () => {
    // The exact pose is deliberately NOT asserted here (it is not reproducible;
    // see Tier 3). Only physical sanity is.
    test('a tumbling pile stays finite, bounded, and unexploded', () => {
        const bodies = run({ steps: 240, broadphase: 'sweep', setup: buildTumble({ perturb: 0 }) });
        expect(bodies).toHaveLength(3);
        bodies.forEach((body) => {
            expect(Number.isFinite(body.position.x)).toBe(true);
            expect(Number.isFinite(body.position.y)).toBe(true);
            expect(Number.isFinite(body.angle)).toBe(true);
            expect(Number.isFinite(body.velocity.x)).toBe(true);
            expect(Number.isFinite(body.velocity.y)).toBe(true);
            // No escape to infinity (the scene lives around 300, 400).
            expect(Math.abs(body.position.x)).toBeLessThan(10000);
            expect(Math.abs(body.position.y)).toBeLessThan(10000);
            // No velocity explosion: a settling pile is slow (nominal peak is
            // ~1.5 px/tick), so a generous cap catches a blown-up solver.
            expect(body.speed).toBeLessThan(50);
        });
    });
});

describe('Tier 3: the tumbling scene is chaotic (documents why Tier 2 is statistical)', () => {
    test('the engine is deterministic, but a 1e-9 nudge amplifies to pixels', () => {
        const baseline = poses(run({ steps: 240, broadphase: 'sweep', setup: buildTumble({ perturb: 0 }) }));
        const repeat = poses(run({ steps: 240, broadphase: 'sweep', setup: buildTumble({ perturb: 0 }) }));
        const perturbed = poses(run({ steps: 240, broadphase: 'sweep', setup: buildTumble({ perturb: 1e-9 }) }));

        // Determinism: identical inputs reproduce bit-for-bit. This is the
        // property the whole approach relies on.
        expect(repeat).toEqual(baseline);

        // Chaos: a sub-ULP nudge grows to a macroscopic difference, so this
        // scene's exact pose can never be a regression tripwire.
        let maxDelta = 0;
        baseline.forEach((pose, index) => {
            for (let axis = 0; axis < 3; axis++) {
                maxDelta = Math.max(maxDelta, Math.abs(pose[axis] - perturbed[index][axis]));
            }
        });
        expect(maxDelta).toBeGreaterThan(0.5);
    });
});
