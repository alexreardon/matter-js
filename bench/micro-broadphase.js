/* eslint-env node */
// Measure the broadphase sort cost and compare V8 Array.sort vs a stable
// insertion sort on the real, steady-state (nearly-sorted) bodies array.
// Stable insertion sort yields byte-identical ordering to V8's stable sort,
// so simulation order is preserved.
"use strict";

const M = require('../build/matter.dev.js');
const { Engine, Composite, Bodies, Body } = M;

let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const engine = Engine.create({ enableSleeping: false });
const world = engine.world;
Composite.add(world, [
    Bodies.rectangle(400, 610, 1200, 60, { isStatic: true }),
    Bodies.rectangle(-10, 300, 60, 700, { isStatic: true }),
    Bodies.rectangle(810, 300, 60, 700, { isStatic: true })
]);
for (let i = 0; i < 350; i++) {
    const b = Bodies.rectangle(60 + rand() * 680, rand() * 500, 18 + rand() * 26, 18 + rand() * 26, { friction: 0.4, restitution: 0.2 });
    Body.setAngle(b, rand() * Math.PI);
    Composite.add(world, b);
}
for (let i = 0; i < 30; i++) {
    const c = Bodies.circle(60 + rand() * 680, rand() * 400, 6 + rand() * 6);
    Body.setVelocity(c, { x: (rand() - 0.5) * 20, y: rand() * 10 });
    Composite.add(world, c);
}

const delta = 1000 / 60;
for (let i = 0; i < 320; i++) Engine.update(engine, delta);

// capture the live, steady-state bodies array (already nearly sorted by min.x)
const detector = engine.detector;
const live = detector.bodies.slice(0);
console.log('bodies:', live.length);

const cmp = (a, b) => a.bounds.min.x - b.bounds.min.x;

function insertionSort(arr) {
    for (var i = 1; i < arr.length; i++) {
        var item = arr[i], key = item.bounds.min.x, j = i - 1;
        while (j >= 0 && arr[j].bounds.min.x > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = item;
    }
    return arr;
}

// count how out-of-order the steady-state array is (inversions sampled)
(function () {
    let outOfOrder = 0;
    for (let i = 1; i < live.length; i++) if (live[i].bounds.min.x < live[i - 1].bounds.min.x) outOfOrder++;
    console.log('adjacent inversions in steady-state array:', outOfOrder, '/', live.length - 1);
})();

// correctness: both sorts produce identical ordering
const a1 = live.slice(0).sort(cmp);
const a2 = insertionSort(live.slice(0));
let identical = a1.length === a2.length;
for (let i = 0; identical && i < a1.length; i++) if (a1[i] !== a2[i]) identical = false;
console.log('insertion sort matches V8 sort ordering:', identical);

// timed A/B: each round re-shuffles to the SAME nearly-sorted live order, then sorts
const hr = () => Number(process.hrtime.bigint());
const rounds = 80, warm = 15, batch = 3000;
const A = { name: 'V8 Array.sort(cmp)   ', fn: arr => arr.sort(cmp), s: [] };
const B = { name: 'stable insertion sort', fn: insertionSort, s: [] };
const scratchA = live.slice(0), scratchB = live.slice(0);

for (let r = 0; r < rounds + warm; r++) {
    for (const S of [A, B]) {
        const scratch = S === A ? scratchA : scratchB;
        const t = hr();
        for (let k = 0; k < batch; k++) {
            // restore the nearly-sorted live order cheaply, then sort
            for (let i = 0; i < live.length; i++) scratch[i] = live[i];
            S.fn(scratch);
        }
        const us = (hr() - t) / 1e3 / batch;
        if (r >= warm) S.s.push(us);
    }
}
const med = s => { s = s.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
// note: timing includes the restore copy in BOTH, so it cancels in the delta
const ma = med(A.s), mb = med(B.s);
console.log(A.name + ': ' + ma.toFixed(3) + ' us/sort (incl restore)');
console.log(B.name + ': ' + mb.toFixed(3) + ' us/sort (incl restore)');
console.log('\ninsertion vs V8: ' + ((ma / mb - 1) * 100).toFixed(2) + '% ' + (mb < ma ? 'faster' : 'SLOWER'));
