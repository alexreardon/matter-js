/* eslint-env node */
"use strict";
const { bench } = require('./micro');

// Model pairs.table: many GETs/frame (hot lookup) + SET on new pair + DELETE on
// ended pair. Plain object (delete -> V8 dictionary mode) vs Map. Ring buffer
// for the live set so churn bookkeeping is O(1) (no Array.shift).
function keyFor(a, b) { return a < b ? a + ':' + b : b + ':' + a; }

function runObject(nLive, getsPerFrame, churnPerFrame, frames, baseId) {
    const table = {};
    const live = new Array(nLive);
    let nextId = baseId, head = 0, sink = 0;
    for (let i = 0; i < nLive; i++) { const k = keyFor(i, i + 1); table[k] = 1; live[i] = k; }
    for (let f = 0; f < frames; f++) {
        for (let g = 0; g < getsPerFrame; g++) { if (table[live[g % nLive]]) sink++; }
        for (let c = 0; c < churnPerFrame; c++) {
            const k = keyFor(nextId++, nextId++);
            delete table[live[head]];
            table[k] = 1; live[head] = k; head = (head + 1) % nLive;
        }
    }
    return sink;
}

function runMap(nLive, getsPerFrame, churnPerFrame, frames, baseId) {
    const table = new Map();
    const live = new Array(nLive);
    let nextId = baseId, head = 0, sink = 0;
    for (let i = 0; i < nLive; i++) { const k = keyFor(i, i + 1); table.set(k, 1); live[i] = k; }
    for (let f = 0; f < frames; f++) {
        for (let g = 0; g < getsPerFrame; g++) { if (table.get(live[g % nLive])) sink++; }
        for (let c = 0; c < churnPerFrame; c++) {
            const k = keyFor(nextId++, nextId++);
            table.delete(live[head]);
            table.set(k, 1); live[head] = k; head = (head + 1) % nLive;
        }
    }
    return sink;
}

bench('table STABLE (600 live, 600 get, 5 churn, 60f)', {
    object: () => runObject(600, 600, 5, 60, 1e6),
    map: () => runMap(600, 600, 5, 60, 1e6),
}, 15, 200, () => null);

bench('table CHURN (600 live, 600 get, 80 churn, 60f)', {
    object: () => runObject(600, 600, 80, 60, 1e6),
    map: () => runMap(600, 600, 80, 60, 1e6),
}, 15, 200, () => null);
