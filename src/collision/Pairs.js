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
            // Keys: 0 is empty, -1 is a tombstone left by an ended pair
            // (`Pairs._recordRemove`); a real pair id is always >= 1. Values
            // are pre-filled with null so the backing store stays packed.
            _recordKeys: new Float64Array(Pairs._initialSize),
            _recordValues: new Array(Pairs._initialSize).fill(null),
            _recordMask: Pairs._initialSize - 1,
            // slots whose key is non-zero (live or tombstone); tombstone reuse
            // keeps it flat, so it only grows on a write into an empty slot
            _recordUsed: 0,
            // live entries only; drives the grow-vs-rehash decision, because a
            // churning world retires pairs constantly and the tombstones they
            // leave must not read as fullness
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
        if ((pairs._recordUsed + 1) * 2 > pairs._recordMask + 1) {
            Pairs._recordGrow(pairs);
        }

        var keys = pairs._recordKeys,
            mask = pairs._recordMask,
            slot = Pair.hash(collision.bodyA.id, collision.bodyB.id) & mask,
            firstTombstone = -1,
            key;

        while ((key = keys[slot]) !== 0) {
            if (key === pairId) {
                pairs._recordValues[slot] = collision;
                return;
            }

            if (key === -1 && firstTombstone === -1) {
                firstTombstone = slot;
            }

            slot = (slot + 1) & mask;
        }

        if (firstTombstone !== -1) {
            slot = firstTombstone;
        } else {
            pairs._recordUsed += 1;
        }

        keys[slot] = pairId;
        pairs._recordValues[slot] = collision;
        pairs._recordLive += 1;
    };

    /**
     * Removes an ended pair's record from the record table, leaving a
     * tombstone so later probe chains stay intact.
     * @method _recordRemove
     * @param {pairs} pairs
     * @param {number} pairId
     * @param {pair} pair
     */
    Pairs._recordRemove = function(pairs, pairId, pair) {
        var keys = pairs._recordKeys,
            mask = pairs._recordMask,
            slot = Pair.hash(pair.bodyA.id, pair.bodyB.id) & mask,
            key;

        while ((key = keys[slot]) !== 0) {
            if (key === pairId) {
                keys[slot] = -1;
                pairs._recordValues[slot] = null;
                pairs._recordLive -= 1;
                return;
            }

            slot = (slot + 1) & mask;
        }
    };

    /**
     * Rebuilds the record table, re-inserting live records and dropping
     * tombstones. Keeps the size when tombstones are what filled it (the
     * churn regime retires pairs every step) and doubles only when live
     * entries genuinely need the room.
     * @method _recordGrow
     * @param {pairs} pairs
     */
    Pairs._recordGrow = function(pairs) {
        var oldKeys = pairs._recordKeys,
            oldValues = pairs._recordValues,
            oldSize = oldKeys.length,
            size = (pairs._recordLive + 1) * 4 > oldSize ? oldSize * 2 : oldSize,
            mask = size - 1,
            keys = new Float64Array(size),
            values = new Array(size).fill(null),
            used = 0;

        for (var i = 0; i < oldSize; i += 1) {
            var key = oldKeys[i];

            if (key === 0 || key === -1) {
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
        pairs._recordUsed = used;
        pairs._recordLive = used;
    };

    /**
     * Updates pairs given a list of collisions.
     * @method update
     * @param {object} pairs
     * @param {collision[]} collisions
     * @param {number} timestamp
     */
    Pairs.update = function(pairs, collisions, timestamp) {
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
                if (pair.isActive) {
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
                    collisionEnd[collisionEndIndex++] = pair;
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
        pairs._recordUsed = 0;
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
