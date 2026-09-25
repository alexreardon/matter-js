/**
* The `Matter.Pairs` module contains methods for creating and manipulating collision pair sets.
*
* @class Pairs
*/

var Pairs = {};

module.exports = Pairs;

var Pair = require('./Pair');
var Common = require('../core/Common');

(function() {

    /**
     * Creates a new pairs structure.
     * @method create
     * @param {object} options
     * @return {pairs} A new pairs structure
     */
    /**
     * Initial slot count of the collision record table (see `Pairs.create`).
     * A power of two so the hash masks; the table grows past half load.
     */
    Pairs._initialSize = 4096;

    Pairs.create = function(options) {
        return Common.extend({
            list: [],
            collisionStart: [],
            collisionActive: [],
            collisionEnd: [],
            // Open-addressing table from pair id to the LIVE pair's collision
            // record, probed by `Collision.collides` on every overlapping
            // candidate. It is authoritative (it replaced a `Map` plus a
            // direct-mapped hint cache in front of it): a present key always
            // means the pair is live and its record is the value, so a probe
            // hit is the record reuse and a miss means a fresh record.
            //
            // Keys: 0 is empty; a real pair id is always >= 1. Linear probing
            // with BACKWARD-SHIFT deletion (`Pairs._recordRemove`), so there
            // are no tombstones: every non-zero key is a live pair. Values are
            // pre-filled with null so the backing store stays packed.
            _recordKeys: new Float64Array(Pairs._initialSize),
            _recordValues: new Array(Pairs._initialSize).fill(null),
            _recordMask: Pairs._initialSize - 1,
            // live entries, which with no tombstones is also every occupied
            // slot; the table doubles when it would pass half load
            _recordLive: 0
        }, options);
    };

    /**
     * Inserts a live pair's collision record into the record table.
     * @method _recordInsert
     * @param {pairs} pairs
     * @param {number} pairId
     * @param {collision} collision
     */
    Pairs._recordInsert = function(pairs, pairId, collision) {
        if ((pairs._recordLive + 1) * 2 > pairs._recordMask + 1) {
            Pairs._recordGrow(pairs);
        }

        var keys = pairs._recordKeys,
            mask = pairs._recordMask,
            slot = Pair.hash(collision.bodyA.id, collision.bodyB.id) & mask,
            key;

        while ((key = keys[slot]) !== 0) {
            if (key === pairId) {
                pairs._recordValues[slot] = collision;
                return;
            }

            slot = (slot + 1) & mask;
        }

        keys[slot] = pairId;
        pairs._recordValues[slot] = collision;
        pairs._recordLive += 1;
    };

    /**
     * Removes an ended pair's record from the record table by backward-shift
     * deletion: every later entry of the same probe cluster that may legally
     * sit in the vacated slot moves back into it, and the last slot vacated
     * that way is emptied. No tombstone is left, so probe chains never walk
     * over dead slots and the table never needs a same-size purge (which on a
     * page being destroyed was a ~262 KB reallocation every ~53 steps).
     * @method _recordRemove
     * @param {pairs} pairs
     * @param {number} pairId
     * @param {pair} pair
     */
    Pairs._recordRemove = function(pairs, pairId, pair) {
        var keys = pairs._recordKeys,
            values = pairs._recordValues,
            mask = pairs._recordMask,
            slot = Pair.hash(pair.bodyA.id, pair.bodyB.id) & mask,
            key;

        while ((key = keys[slot]) !== 0) {
            if (key === pairId) {
                var gap = slot,
                    next = (slot + 1) & mask,
                    nextKey;

                while ((nextKey = keys[next]) !== 0) {
                    var record = values[next],
                        home = Pair.hash(record.bodyA.id, record.bodyB.id) & mask;

                    // an entry may move back into the gap only if its home
                    // slot is not cyclically inside (gap, next], i.e. it sits
                    // at least as far from its home as the gap is from it.
                    // Moving one whose home is after the gap would put it
                    // before its home, where a probe can never reach it
                    if (((next - home) & mask) >= ((next - gap) & mask)) {
                        keys[gap] = nextKey;
                        values[gap] = record;
                        gap = next;
                    }

                    next = (next + 1) & mask;
                }

                keys[gap] = 0;
                values[gap] = null;
                pairs._recordLive -= 1;
                return;
            }

            slot = (slot + 1) & mask;
        }
    };

    /**
     * Doubles the record table and re-inserts every entry. Only a table past
     * half load of LIVE pairs reaches here, since deletion leaves no
     * tombstones to purge.
     * @method _recordGrow
     * @param {pairs} pairs
     */
    Pairs._recordGrow = function(pairs) {
        var oldKeys = pairs._recordKeys,
            oldValues = pairs._recordValues,
            oldSize = oldKeys.length,
            size = oldSize * 2,
            mask = size - 1,
            keys = new Float64Array(size),
            values = new Array(size).fill(null),
            used = 0;

        for (var i = 0; i < oldSize; i += 1) {
            var key = oldKeys[i];

            if (key === 0) {
                continue;
            }

            var record = oldValues[i],
                slot = Pair.hash(record.bodyA.id, record.bodyB.id) & mask;

            while (keys[slot] !== 0) {
                slot = (slot + 1) & mask;
            }

            keys[slot] = key;
            values[slot] = record;
            used += 1;
        }

        pairs._recordKeys = keys;
        pairs._recordValues = values;
        pairs._recordMask = mask;
        pairs._recordLive = used;
    };

    /**
     * Updates pairs given a list of collisions.
     *
     * `pairs.collisionStart` is always filled. `pairs.collisionActive` and
     * `pairs.collisionEnd` are filled unless `collectActive` / `collectEnd` is
     * `false`, in which case the list is left empty (the engine passes `false`
     * for an event with no listener; see `Engine.update`).
     * @method update
     * @param {object} pairs
     * @param {collision[]} collisions
     * @param {number} timestamp
     * @param {boolean} [collectActive=true] Whether to fill `pairs.collisionActive`
     * @param {boolean} [collectEnd=true] Whether to fill `pairs.collisionEnd`
     */
    Pairs.update = function(pairs, collisions, timestamp, collectActive, collectEnd) {
        collectActive = collectActive !== false;
        collectEnd = collectEnd !== false;

        var pairUpdate = Pair.update,
            pairCreate = Pair.create,
            pairSetActive = Pair.setActive,
            pairsList = pairs.list,
            pairsListLength = pairsList.length,
            pairsListIndex = pairsListLength,
            collisionStart = pairs.collisionStart,
            collisionEnd = pairs.collisionEnd,
            collisionActive = pairs.collisionActive,
            collisionsLength = collisions.length,
            collisionStartIndex = 0,
            collisionEndIndex = 0,
            collisionActiveIndex = 0,
            collision,
            pair,
            i;

        for (i = 0; i < collisionsLength; i++) {
            collision = collisions[i];
            pair = collision.pair;

            if (pair) {
                // pair already exists (but may or may not be active)
                if (collectActive && pair.isActive) {
                    // pair exists and is active
                    collisionActive[collisionActiveIndex++] = pair;
                }

                // update the pair
                pairUpdate(pair, collision, timestamp);
            } else {
                // pair did not exist, create a new pair
                pair = pairCreate(collision, timestamp);
                Pairs._recordInsert(pairs, pair.id, collision);

                // add the new pair
                collisionStart[collisionStartIndex++] = pair;
                pairsList[pairsListIndex++] = pair;
            }
        }

        // find pairs that are no longer active
        pairsListIndex = 0;
        pairsListLength = pairsList.length;

        for (i = 0; i < pairsListLength; i++) {
            pair = pairsList[i];
            
            // pair is active if updated this timestep
            if (pair.timeUpdated >= timestamp) {
                // keep active pairs
                pairsList[pairsListIndex++] = pair;
            } else {
                pairSetActive(pair, false, timestamp);

                // keep inactive pairs if both bodies may be sleeping
                if (pair.collision.bodyA.sleepCounter > 0 && pair.collision.bodyB.sleepCounter > 0) {
                    pairsList[pairsListIndex++] = pair;
                } else {
                    // remove inactive pairs if either body awake
                    if (collectEnd) {
                        collisionEnd[collisionEndIndex++] = pair;
                    }
                    Pairs._recordRemove(pairs, pair.id, pair);
                    // the record can outlive the pair in solver scratch, so
                    // drop the back reference or the next `Pairs.update` would
                    // take it for a live pair and never re-add it
                    pair.collision.pair = null;
                }
            }
        }

        // update array lengths if changed
        if (pairsList.length !== pairsListIndex) {
            pairsList.length = pairsListIndex;
        }

        if (collisionStart.length !== collisionStartIndex) {
            collisionStart.length = collisionStartIndex;
        }

        if (collisionEnd.length !== collisionEndIndex) {
            collisionEnd.length = collisionEndIndex;
        }

        if (collisionActive.length !== collisionActiveIndex) {
            collisionActive.length = collisionActiveIndex;
        }
    };

    /**
     * Clears the given pairs structure.
     * @method clear
     * @param {pairs} pairs
     * @return {pairs} pairs
     */
    Pairs.clear = function(pairs) {
        pairs._recordKeys.fill(0);
        pairs._recordValues.fill(null);
        pairs._recordLive = 0;
        pairs.list.length = 0;
        pairs.collisionStart.length = 0;
        pairs.collisionActive.length = 0;
        pairs.collisionEnd.length = 0;

        // solver scratch hung off the container by Resolver.preSolvePosition /
        // postSolvePosition. Clearing the pairs means the solver is starting
        // over, so it must not keep holding bodies from the previous world
        if (pairs._impulseCarry) {
            pairs._impulseCarry.length = 0;
        }

        if (pairs._solverBodies) {
            pairs._solverBodies.length = 0;
        }

        return pairs;
    };

})();
