/* eslint-env node */
// Same-process A/B microbenchmark harness. Compares two implementations of a
// hot function over many iterations, interleaving rounds to cancel drift.
// Reports median ns/op for each and the speedup. This isolates a single
// function so a real micro-opt shows clearly, free of cross-process noise.
"use strict";

function bench(label, fns, rounds, iters, setup) {
    const results = {};
    for (const k in fns) results[k] = [];
    // interleave A/B/A/B... so thermal/scheduler drift hits both equally
    for (let r = 0; r < rounds; r++) {
        for (const k in fns) {
            const ctx = setup();
            const fn = fns[k];
            // warm
            for (let i = 0; i < 2000; i++) fn(ctx, i);
            const t = Number(process.hrtime.bigint());
            for (let i = 0; i < iters; i++) fn(ctx, i);
            const ns = Number(process.hrtime.bigint()) - t;
            results[k].push(ns / iters);
        }
    }
    console.log('\n' + label + '  (' + rounds + ' rounds x ' + iters + ' iters)');
    const med = {};
    for (const k in results) {
        results[k].sort((a, b) => a - b);
        med[k] = results[k][results[k].length >> 1];
        console.log('  ' + k.padEnd(10) + med[k].toFixed(3) + ' ns/op');
    }
    const keys = Object.keys(fns);
    if (keys.length === 2) {
        const [a, b] = keys;
        const speedup = (med[a] / med[b] - 1) * 100;
        console.log('  => ' + b + ' is ' + speedup.toFixed(1) + '% ' + (speedup >= 0 ? 'faster' : 'SLOWER') + ' than ' + a);
    }
    return med;
}

module.exports = { bench };
