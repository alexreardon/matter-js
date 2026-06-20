/* eslint-env node */
// De-risk the insertion-sort broadphase: measure how nearly-sorted the bodies
// array stays frame-to-frame at scale. Sweep-and-prune relies on temporal
// coherence (bodies move little per frame), so adjacent inversions should stay
// tiny relative to n even with many fast bodies -> insertion sort ~O(n).
"use strict";

const M = require('../build/matter.dev.js');
const { Engine, Composite, Bodies, Body } = M;

let seed = 999;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

function run(nBodies, label) {
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;
    Composite.add(world, [
        Bodies.rectangle(600, 910, 1800, 60, { isStatic: true }),
        Bodies.rectangle(-10, 450, 60, 1000, { isStatic: true }),
        Bodies.rectangle(1210, 450, 60, 1000, { isStatic: true })
    ]);
    for (let i = 0; i < nBodies; i++) {
        const b = Bodies.rectangle(60 + rand() * 1080, rand() * 700, 14 + rand() * 20, 14 + rand() * 20, { friction: 0.4, restitution: 0.3 });
        Body.setAngle(b, rand() * Math.PI);
        Body.setVelocity(b, { x: (rand() - 0.5) * 30, y: (rand() - 0.5) * 30 });
        Composite.add(world, b);
    }
    const delta = 1000 / 60;
    const bodies = engine.detector.bodies;

    let maxInv = 0, sumInv = 0, frames = 0;
    for (let f = 0; f < 600; f++) {
        Engine.update(engine, delta);
        // count adjacent inversions remaining AFTER the in-place sort settled it;
        // to see pre-sort disorder, measure displacement: re-derive from min.x order
        if (f >= 100) {
            let inv = 0;
            for (let i = 1; i < bodies.length; i++) {
                if (bodies[i].bounds.min.x < bodies[i - 1].bounds.min.x) inv++;
            }
            maxInv = Math.max(maxInv, inv);
            sumInv += inv;
            frames++;
        }
    }
    // Note: bodies[] is sorted at end of each Detector.collisions, so post-update
    // it's fully sorted (inv=0). To measure REAL disorder the sort must fix each
    // frame, perturb order by re-sorting a shuffled snapshot is needed; instead
    // measure how far each body's rank moves per frame below.
    console.log(label + ' (n=' + bodies.length + '): post-sort inversions avg ' +
        (sumInv / frames).toFixed(1) + ' max ' + maxInv);
}

// Better measure: how many positions each body's min.x rank shifts between frames.
function runRankShift(nBodies, label) {
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;
    Composite.add(world, [
        Bodies.rectangle(600, 910, 1800, 60, { isStatic: true }),
        Bodies.rectangle(-10, 450, 60, 1000, { isStatic: true }),
        Bodies.rectangle(1210, 450, 60, 1000, { isStatic: true })
    ]);
    for (let i = 0; i < nBodies; i++) {
        const b = Bodies.rectangle(60 + rand() * 1080, rand() * 700, 14 + rand() * 20, 14 + rand() * 20, { friction: 0.4, restitution: 0.3 });
        Body.setAngle(b, rand() * Math.PI);
        Body.setVelocity(b, { x: (rand() - 0.5) * 30, y: (rand() - 0.5) * 30 });
        Composite.add(world, b);
    }
    const delta = 1000 / 60;
    const detector = engine.detector;

    // monkeypatch: before each sort, count inversions present in the live array
    // (this is the disorder the insertion sort must repair each frame)
    let maxInv = 0, sumInv = 0, frames = 0, maxShift = 0;
    const origCollisions = M.Detector.collisions;
    M.Detector.collisions = function(d) {
        const b = d.bodies;
        let inv = 0, worst = 0, run = 0;
        for (let i = 1; i < b.length; i++) {
            if (b[i].bounds.min.x < b[i - 1].bounds.min.x) { inv++; run++; worst = Math.max(worst, run); }
            else run = 0;
        }
        if (frames >= 100 || true) { maxInv = Math.max(maxInv, inv); sumInv += inv; maxShift = Math.max(maxShift, worst); }
        frames++;
        return origCollisions(d);
    };
    for (let f = 0; f < 600; f++) Engine.update(engine, delta);
    M.Detector.collisions = origCollisions;
    console.log(label + ' (n=' + detector.bodies.length + '): PRE-sort inversions/frame avg ' +
        (sumInv / frames).toFixed(1) + ' max ' + maxInv + ' (avg ' + (100 * sumInv / frames / detector.bodies.length).toFixed(2) + '% of n)');
}

runRankShift(500, 'medium');
runRankShift(1500, 'large ');
runRankShift(3000, 'huge  ');
