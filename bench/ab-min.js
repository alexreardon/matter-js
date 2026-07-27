/* eslint-env node */
// Interleaved A/B of two source trees using bench/profile-game.js as the
// workload, reported as best-of-N per arm.
//
// Why best-of and not median: interference from other processes on the machine
// can only ever make a run SLOWER, so the minimum of enough runs is the closest
// estimate of the arm's true cost and is far more stable than a median when the
// machine is loaded. Rounds still alternate B,A,B,A so any monotonic thermal
// drift lands on both arms equally.
//
// Usage:
//   node bench/ab-min.js <baselineSrcMain> [scene] [rounds] [workSrcMain]
"use strict";

const { execFileSync } = require('child_process');
const path = require('path');

const baseline = process.argv[2];
const scene = process.argv[3] || 'calm';
const rounds = Number(process.argv[4] || 7);
const work = process.argv[5] || path.join(__dirname, '..', 'src', 'module', 'main.js');

if (!baseline) {
    console.error('usage: node bench/ab-min.js <baselineSrcMain> [scene] [rounds] [workSrcMain]');
    process.exit(1);
}

function measure(buildPath) {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'profile-game.js'), buildPath], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { SCENE: scene, PHASES: '' })
    });
    const match = out.match(/\(([0-9.]+) us\/update\)/);
    if (!match) {
        throw new Error('could not parse: ' + out);
    }
    return Number(match[1]);
}

const baseRuns = [];
const workRuns = [];

for (let round = 0; round < rounds; round++) {
    const b = measure(baseline);
    const w = measure(work);
    baseRuns.push(b);
    workRuns.push(w);
    process.stdout.write(`round ${round + 1}: base=${b.toFixed(1)}us work=${w.toFixed(1)}us\n`);
}

const min = values => values.reduce((a, b) => (b < a ? b : a));
const median = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

const baseMin = min(baseRuns);
const workMin = min(workRuns);
const baseMedian = median(baseRuns);
const workMedian = median(workRuns);

console.log(`\nscene=${scene} rounds=${rounds}`);
console.log(`  best-of : base ${baseMin.toFixed(1)}us  work ${workMin.toFixed(1)}us  delta ${(100 * (workMin - baseMin) / baseMin).toFixed(2)}%`);
console.log(`  median  : base ${baseMedian.toFixed(1)}us  work ${workMedian.toFixed(1)}us  delta ${(100 * (workMedian - baseMedian) / baseMedian).toFixed(2)}%`);
