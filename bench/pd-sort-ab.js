/* eslint-env node */
"use strict";
// Focused question: at n=7300, can a shot's perturbation push the fork's
// insertion sort (O(n^2) worst case) far above native Array.sort (O(n log n))?
// Test the orderings that actually occur: calm (static, re-sliced composite
// order each step), and "shot" (a cluster displaced far in x).
const now = () => Number(process.hrtime.bigint()) / 1e6;
const N = 7300;

function makeBounds(order) {
  // each "body" is { bounds:{min:{x}} }. Lay out a 110x66 grid.
  const cols = 110, rows = 66, tile = 20;
  const bodies = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      bodies.push({ bounds: { min: { x: c * tile } }, _c: c, _r: r });
    }
  }
  if (order === 'xMajor') bodies.sort((a, b) => a.bounds.min.x - b.bounds.min.x);
  // yMajor: keep row-major insertion order (matches staticByRow materialise)
  return bodies.slice(0, N);
}

function insertionSort(bodies) {
  const n = bodies.length;
  for (let i = 1; i < n; i++) {
    const ins = bodies[i];
    const x = ins.bounds.min.x;
    let k = i - 1;
    while (k >= 0 && bodies[k].bounds.min.x > x) { bodies[k + 1] = bodies[k]; k--; }
    bodies[k + 1] = ins;
  }
}
function nativeSort(bodies) { bodies.sort((a, b) => a.bounds.min.x - b.bounds.min.x); }

function timeSort(fn, base, iters) {
  // re-slice each iter (Detector.setBodies does bodies.slice(0) every step)
  let t = 0;
  for (let i = 0; i < iters; i++) {
    const arr = base.slice(0);
    const t0 = now();
    fn(arr);
    t += now() - t0;
  }
  return t / iters;
}

function perturb(base, k, spread) {
  // displace k bodies far in x (a blasted cluster flung across the field)
  const arr = base.slice(0);
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rnd() * arr.length);
    arr[idx] = { bounds: { min: { x: rnd() * spread } } };
  }
  return arr;
}

const ITERS = 200;
const scenarios = [
  ['xMajor calm', makeBounds('xMajor')],
  ['yMajor calm (row-major add order)', makeBounds('yMajor')],
  ['xMajor + 30 flung (one shot)', perturb(makeBounds('xMajor'), 30, 2200)],
  ['xMajor + 200 flung (sustained fire)', perturb(makeBounds('xMajor'), 200, 2200)],
  ['fully shuffled (worst case)', perturb(makeBounds('xMajor'), 7300, 2200)],
];

console.log(`n=${N}, ${ITERS} iters each, re-sliced per iter\n`);
console.log('scenario'.padEnd(40), 'insertion(fork)'.padStart(16), 'native(stock)'.padStart(16));
scenarios.forEach(([label, base]) => {
  // warm
  timeSort(insertionSort, base, 20); timeSort(nativeSort, base, 20);
  const ins = timeSort(insertionSort, base, ITERS);
  const nat = timeSort(nativeSort, base, ITERS);
  console.log(label.padEnd(40), `${ins.toFixed(2)}ms`.padStart(16), `${nat.toFixed(2)}ms`.padStart(16));
});
