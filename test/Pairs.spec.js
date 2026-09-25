/* eslint-env es6, jest */
"use strict";

// Unit tests for the pair collision-record table (`Pairs.create`), an
// open-addressing table with linear probing and BACKWARD-SHIFT deletion.
//
// Deletion is the fragile half. It moves later entries of a probe cluster back
// into the vacated slot, and an entry moved to before its own home slot can no
// longer be found by a probe, which in the engine reads as "no live pair":
// `Collision.collides` builds a fresh record and the pair loses its warm start.
// The examples suite only sees that if a large scene happens to hit it, so this
// drives a TINY table (clusters, collisions and wraparound on nearly every
// operation) against a `Map` reference and checks the table invariants after
// every single insert and remove.
const Pairs = require('../src/collision/Pairs');
const Pair = require('../src/collision/Pair');

function makeRandom(seed) {
    let state = seed;
    return function random() {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

// the probe `Collision.collides` runs, restated: linear from the home slot to
// the first empty key
function lookup(pairs, idA, idB, pairId) {
    const keys = pairs._recordKeys;
    const mask = pairs._recordMask;
    let slot = Pair.hash(idA, idB) & mask;
    let key;

    while ((key = keys[slot]) !== 0) {
        if (key === pairId) {
            return pairs._recordValues[slot];
        }
        slot = (slot + 1) & mask;
    }

    return null;
}

function makeEntry(idA, idB) {
    const bodyA = { id: Math.min(idA, idB) };
    const bodyB = { id: Math.max(idA, idB) };
    const collision = { bodyA, bodyB };
    const pair = { id: bodyA.id * Pair._idShift + bodyB.id, bodyA, bodyB };
    return { collision, pair };
}

// every occupied slot is reachable from its home without crossing an empty
// slot, no key is a tombstone, and the live count matches the occupancy.
// Returns the first violation, or null. Plain checks rather than an `expect`
// per slot, which would cost a jest matcher call per slot per operation
function findViolation(pairs, reference) {
    const keys = pairs._recordKeys;
    const values = pairs._recordValues;
    const mask = pairs._recordMask;
    let occupied = 0;

    for (let slot = 0; slot < keys.length; slot++) {
        const key = keys[slot];

        if (key === 0) {
            if (values[slot] !== null) {
                return 'empty slot ' + slot + ' holds a record';
            }
            continue;
        }

        if (!(key > 0)) {
            return 'slot ' + slot + ' holds key ' + key;
        }
        occupied += 1;

        const record = values[slot];
        let walk = Pair.hash(record.bodyA.id, record.bodyB.id) & mask;
        while (walk !== slot) {
            if (keys[walk] === 0) {
                return 'key ' + key + ' at slot ' + slot + ' is unreachable from its home';
            }
            walk = (walk + 1) & mask;
        }
    }

    if (occupied !== reference.size || pairs._recordLive !== reference.size) {
        return 'occupied ' + occupied + ', live ' + pairs._recordLive + ', reference ' + reference.size;
    }

    let missing = null;
    reference.forEach(function(entry) {
        if (missing === null && lookup(pairs, entry.pair.bodyA.id, entry.pair.bodyB.id, entry.pair.id) !== entry.collision) {
            missing = 'pair ' + entry.pair.id + ' not found by a probe';
        }
    });

    return missing;
}

describe('Pairs record table', () => {
    const initialSize = Pairs._initialSize;

    afterEach(() => {
        Pairs._initialSize = initialSize;
    });

    it('holds every live pair and loses none through backward-shift deletion', () => {
        Pairs._initialSize = 8;
        const pairs = Pairs.create();
        const random = makeRandom(97);
        const reference = new Map();
        let removals = 0;
        let grows = 0;

        for (let op = 0; op < 4000; op++) {
            // ids drawn from a small range so pairs repeat, remove and return
            const idA = 1 + Math.floor(random() * 24);
            const idB = 1 + Math.floor(random() * 24);
            if (idA === idB) {
                continue;
            }

            const entry = makeEntry(idA, idB);
            const live = reference.get(entry.pair.id);

            if (live && random() < 0.6) {
                Pairs._recordRemove(pairs, live.pair.id, live.pair);
                reference.delete(live.pair.id);
                if (lookup(pairs, idA, idB, live.pair.id) !== null) {
                    throw new Error('removed pair ' + live.pair.id + ' still found');
                }
                removals += 1;
            } else if (!live) {
                const sizeBefore = pairs._recordKeys.length;
                Pairs._recordInsert(pairs, entry.pair.id, entry.collision);
                reference.set(entry.pair.id, entry);
                if (pairs._recordKeys.length !== sizeBefore) {
                    grows += 1;
                }
            }

            expect(findViolation(pairs, reference)).toBe(null);
        }

        // the scenario must have exercised what it claims to
        expect(removals).toBeGreaterThan(500);
        expect(grows).toBeGreaterThan(0);
    });

    it('never grows a table whose live count stays under half load', () => {
        Pairs._initialSize = 64;
        const pairs = Pairs.create();
        const random = makeRandom(5);
        const reference = new Map();

        for (let op = 0; op < 20000; op++) {
            const idA = 1 + Math.floor(random() * 40);
            const idB = 1 + Math.floor(random() * 40);
            if (idA === idB) {
                continue;
            }

            const entry = makeEntry(idA, idB);
            const live = reference.get(entry.pair.id);

            if (live) {
                Pairs._recordRemove(pairs, live.pair.id, live.pair);
                reference.delete(live.pair.id);
            } else if (reference.size < 28) {
                Pairs._recordInsert(pairs, entry.pair.id, entry.collision);
                reference.set(entry.pair.id, entry);
            }
        }

        // churn at a steady live count is where the tombstone design purged,
        // and at this live count doubled; with no tombstones it does neither
        expect(pairs._recordKeys.length).toBe(64);
        expect(findViolation(pairs, reference)).toBe(null);
    });
});
