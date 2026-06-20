/* eslint-env node */
// Definitive regression check for the insertion-sort broadphase at scale:
// across many frames of a chaotic large scene, capture the real pre-sort array
// each frame and time V8 Array.sort vs in-place insertion sort on identical
// copies. Reports total sort time across all frames (lower = better).
"use strict";

const M = require('../build/matter.dev.js');
const { Engine, Composite, Bodies, Body } = M;

const cmp = (a, b) => a.bounds.min.x - b.bounds.min.x;
function insertionSort(arr) {
    for (var i = 1; i < arr.length; i++) {
        var item = arr[i], key = item.bounds.min.x, j = i - 1;
        while (j >= 0 && arr[j].bounds.min.x > key) { arr[j + 1] = arr[j]; j--; }
        arr[j + 1] = item;
    }
    return arr;
}

function scene(nBodies, velScale) {
    let seed = 999;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const engine = Engine.create({ enableSleeping: false });
    Composite.add(engine.world, [
        Bodies.rectangle(600, 910, 1800, 60, { isStatic: true }),
        Bodies.rectangle(-10, 450, 60, 1000, { isStatic: true }),
        Bodies.rectangle(1210, 450, 60, 1000, { isStatic: true })
    ]);
    for (let i = 0; i < nBodies; i++) {
        const b = Bodies.rectangle(60 + rand() * 1080, rand() * 700, 14 + rand() * 20, 14 + rand() * 20, { friction: 0.4, restitution: 0.3 });
        Body.setAngle(b, rand() * Math.PI);
        Body.setVelocity(b, { x: (rand() - 0.5) * velScale, y: (rand() - 0.5) * velScale });
        Composite.add(engine.world, b);
    }
    return engine;
}

const hr = () => Number(process.hrtime.bigint());

function test(nBodies, velScale, label) {
    const engine = scene(nBodies, velScale);
    const delta = 1000 / 60;

    // capture pre-sort snapshots across frames (engine internally re-sorts; we
    // grab the array order at Detector entry, which is what each sort receives)
    const snaps = [];
    const orig = M.Detector.collisions;
    M.Detector.collisions = function (d) { snaps.push(d.bodies.slice(0)); return orig(d); };
    for (let f = 0; f < 400; f++) Engine.update(engine, delta);
    M.Detector.collisions = orig;

    // use the second half (steady state); time both sorts on identical copies
    const frames = snaps.slice(200);
    const n = frames[0].length;
    const tmp = new Array(n);

    // warm
    for (let w = 0; w < 3; w++) for (const s of frames) { for (let i = 0; i < n; i++) tmp[i] = s[i]; insertionSort(tmp); }

    let tV8 = 0, tIns = 0;
    const REPS = 20;
    for (let r = 0; r < REPS; r++) {
        for (const s of frames) {
            for (let i = 0; i < n; i++) tmp[i] = s[i];
            let t = hr(); tmp.sort(cmp); tV8 += hr() - t;
        }
        for (const s of frames) {
            for (let i = 0; i < n; i++) tmp[i] = s[i];
            let t = hr(); insertionSort(tmp); tIns += hr() - t;
        }
    }
    const perV8 = tV8 / 1e3 / (REPS * frames.length);
    const perIns = tIns / 1e3 / (REPS * frames.length);
    console.log(label + ' n=' + n + ' vel=' + velScale +
        ' | V8 ' + perV8.toFixed(2) + 'us  insertion ' + perIns.toFixed(2) + 'us  -> ' +
        ((perV8 / perIns - 1) * 100).toFixed(0) + '% ' + (perIns < perV8 ? 'faster' : 'SLOWER'));
}

test(500, 10, 'settle-ish');
test(1500, 10, 'settle-ish');
test(1500, 30, 'chaotic   ');
test(3000, 30, 'chaotic   ');
test(3000, 60, 'very fast ');
