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
     * Slot count of the collision record cache (see `Pairs.create`). A power of
     * two so the hash masks; sized well above a typical live pair count so
     * eviction is rare.
     */
    Pairs._cacheMask = 4095;

    Pairs.create = function(options) {
        return Common.extend({
            table: new Map(),
            list: [],
            collisionStart: [],
            collisionActive: [],
            collisionEnd: [],
            // Direct-mapped cache from pair id to the collision record the pair
            // reuses, read by `Collision.collides` on every overlapping
            // candidate. The table lookup it replaces was one of the larger
            // per-candidate costs; the cache turns it into a masked array read.
            //
            // It is only ever a hint, so it needs no invalidation: a pair id
            // identifies its two bodies for the life of the world (body ids are
            // never reused), a stored key can only ever be matched by that same
            // body pair, and the record itself is scratch that the collision
            // rewrites in full. It holds records for pairs that have since
            // ended, which is what lets a re-collision reuse the old record
            // instead of allocating a new one.
            _recordKeys: new Float64Array(Pairs._cacheMask + 1),
            _recordValues: new Array(Pairs._cacheMask + 1),
            _recordMask: Pairs._cacheMask
        }, options);
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
            pairsTable = pairs.table,
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
                pairsTable.set(pair.id, pair);

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
                    pairsTable.delete(pair.id);
                    // the record outlives the pair (the collision record cache
                    // hands it straight back if these bodies collide again), so
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
        pairs.table = new Map();
        pairs._recordKeys.fill(0);
        pairs._recordValues.length = 0;
        pairs._recordValues.length = Pairs._cacheMask + 1;
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
