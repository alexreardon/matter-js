/**
* The `Matter.Detector` module contains methods for efficiently detecting collisions between a list of bodies using a broadphase algorithm.
*
* @class Detector
*/

var Detector = {};

module.exports = Detector;

var Common = require('../core/Common');
var Collision = require('./Collision');

(function() {

    /**
     * The grid broadphase's visit stamp, written to `body._gsStamp` (and to
     * the flat mover stamps) to mark a body already seen by one pass: a
     * candidate collected once however many of a mover's cells hold it, a
     * journal entry read once however often it was recorded. ONE counter for
     * every grid detector, so every stamp is fresh for every body: with a
     * counter per detector, a stamp another detector left on a body could
     * equal the one a pass took, and the pass skipped that body as already
     * seen (a released static left out of the mover lists, a static left out
     * of a mover's candidates).
     *
     * Known limit, unchanged by sharing the counter (one detector takes the
     * same stamps either way): past `2^31` stamps, about 33 hours of a
     * 300-mover world at 60 updates a second, the flat mover stamps (an
     * `Int32Array`) wrap and stop deduping a mover reached through several
     * cells, so its pair is emitted more than once, and `_gsStamp` leaves the
     * small-integer range, which changes the field's representation on every
     * body once.
     * @private
     */
    var gridStamp = 0;

    /**
     * Creates a new collision detector.
     *
     * The broadphase is chosen per detector, with `broadphase` (`'sweep'`, the
     * default, or `'grid'`) and, for the grid, `cellSize`. To run an engine on
     * the grid, give it a detector made for it:
     *
     *     Engine.create({ detector: Detector.create({ broadphase: 'grid' }) })
     *
     * Any other `broadphase` throws, here and on every `Detector.collisions`.
     * @method create
     * @param {} options
     * @return {detector} A new collision detector
     */
    Detector.create = function(options) {
        var defaults = {
            bodies: [],
            collisions: [],
            pairs: null,
            // which broadphase `Detector.collisions` runs (see there)
            broadphase: 'sweep',
            // the grid's cell size in pixels, read by the grid broadphase only.
            // Tune it to roughly the typical static body's size
            cellSize: Detector._defaultCellSize,
            // whether `bodies` is a private copy the sweep may sort in place
            // (see Detector.setBodies)
            _bodiesOwned: true,
            // the world whose own body array `bodies` is, set by
            // `Engine.update` for a flat world: the grid broadphase then reads
            // that world's body journal instead of walking every body (see
            // Common._journalTouch). Null for a detector used on its own
            _world: null,
            // the grid broadphase's state, made on its first step (see
            // Detector._collisionsGrid)
            _sgrid: null
        };

        var detector = Common.extend(defaults, options);

        // Common.extend copies an option given as `undefined`, so a cell size
        // left unset that way takes the default like an absent one. The
        // broadphase does not: an unset broadphase quietly running the sweep
        // is the failure the check below exists to rule out
        if (detector.cellSize === undefined) {
            detector.cellSize = Detector._defaultCellSize;
        }

        if (!Detector._isBroadphase(detector.broadphase)) {
            throw Detector._broadphaseError(detector.broadphase);
        }

        if (!Detector._isCellSize(detector.cellSize)) {
            throw Detector._cellSizeError(detector.cellSize);
        }

        return detector;
    };

    /**
     * The grid's cell size when a detector is not given one.
     * @private
     * @property _defaultCellSize
     * @type number
     */
    Detector._defaultCellSize = 32;

    /**
     * Whether `broadphase` names a broadphase `Detector.collisions` runs.
     * @private
     * @method _isBroadphase
     * @param {} broadphase
     * @return {boolean}
     */
    Detector._isBroadphase = function(broadphase) {
        return broadphase === 'sweep' || broadphase === 'grid';
    };

    /**
     * Whether `cellSize` is a cell size the grid can use: a finite number of
     * pixels above zero whose inverse is finite too. The grid maps a
     * coordinate to its cell by multiplying by that inverse, and an infinite
     * one (a denormal cell size such as `1e-310`) puts every body in cell
     * `Infinity`, whose cell loop never ends.
     * @private
     * @method _isCellSize
     * @param {} cellSize
     * @return {boolean}
     */
    Detector._isCellSize = function(cellSize) {
        return typeof cellSize === 'number' && cellSize > 0 && cellSize < Infinity && 1 / cellSize < Infinity;
    };

    /**
     * Throws if `detector` names no broadphase, or names the grid with a cell
     * size it cannot use: the checks `Detector.collisions` and the grid make
     * when they run, made up front. `Engine.update` calls this before it
     * changes anything, so an update that throws on its configuration leaves
     * the engine, the world and every body as they were.
     * @private
     * @method _assertConfig
     * @param {detector} detector
     */
    Detector._assertConfig = function(detector) {
        var broadphase = detector.broadphase;

        if (broadphase === 'grid') {
            if (!Detector._isCellSize(detector.cellSize)) {
                throw Detector._cellSizeError(detector.cellSize);
            }
            return;
        }

        if (broadphase !== 'sweep') {
            throw Detector._broadphaseError(broadphase);
        }
    };

    /**
     * The error for a detector whose `broadphase` names no broadphase.
     * @private
     * @method _broadphaseError
     * @param {} broadphase
     * @return {Error}
     */
    Detector._broadphaseError = function(broadphase) {
        return new Error('Matter.Detector: unknown broadphase ' + String(broadphase)
            + ", expected 'sweep' or 'grid' (e.g. Detector.create({ broadphase: 'grid' }))");
    };

    /**
     * The error for a detector whose `cellSize` the grid cannot use.
     * @private
     * @method _cellSizeError
     * @param {} cellSize
     * @return {Error}
     */
    Detector._cellSizeError = function(cellSize) {
        return new Error('Matter.Detector: cellSize must be a finite number above 0 with a finite inverse, got '
            + String(cellSize));
    };

    /**
     * Sets the list of bodies in the detector.
     * @method setBodies
     * @param {detector} detector
     * @param {body[]} bodies
     */
    Detector.setBodies = function(detector, bodies) {
        // only the sweep reorders detector.bodies (it sorts in place), so only
        // it needs a private copy. The grid modes reference the caller's array
        // directly, which for `Engine.update` on a flat world is `world.bodies`
        // itself: its identity does NOT change when its membership does, so the
        // classification cache keys on Common._bodySetEpoch as well. The copy
        // for the sweep is taken lazily in _collisionsSweep, so a detector
        // flipped to sweep after this call stays correct, and the caller's
        // array is never reordered.
        detector.bodies = bodies;
        detector._bodiesOwned = false;
        // whose array this is, `Engine.update` says again after this call
        detector._world = null;
    };

    /**
     * Clears the detector including its list of bodies.
     * @method clear
     * @param {detector} detector
     */
    Detector.clear = function(detector) {
        detector.bodies = [];
        detector.collisions = [];
    };

    /**
     * Efficiently finds all collisions among all the bodies in `detector.bodies` using a broadphase algorithm.
     * 
     * _Note:_ The specific ordering of collisions returned is not guaranteed between releases and may change for performance reasons.
     * If a specific ordering is required then apply a sort to the resulting array.
     * @method collisions
     * @param {detector} detector
     * @return {collision[]} collisions
     */
    Detector._collisionsSweep = function(detector) {
        var pairs = detector.pairs,
            bodies = detector.bodies,
            bodiesLength = bodies.length,
            canCollide = Detector.canCollide,
            collides = Collision.collides,
            collisions = detector.collisions,
            collisionIndex = 0,
            i,
            j;

        // the sweep sorts in place, so it must own the array: setBodies hands
        // over the caller's array by reference (the grid modes never reorder
        // it) and the copy is taken here, only when the sweep actually runs
        if (!detector._bodiesOwned) {
            bodies = detector.bodies = detector.bodies.slice(0);
            detector._bodiesOwned = true;
        }

        // sort bodies by bounds.min.x for sweep-and-prune. Uses the engine's
        // stable O(n log n) sort: callers rebuild `detector.bodies` from
        // Composite.allBodies (add order) every step via Detector.setBodies, so
        // the input is NOT nearly-sorted between frames. A hand-rolled insertion
        // sort degrades to O(n^2) on that input (~34ms at n=7300 when the array
        // is row-major), whereas this stays sub-millisecond regardless of order.
        bodies.sort(Detector._compareBoundsX);

        for (i = 0; i < bodiesLength; i++) {
            var bodyA = bodies[i],
                boundsA = bodyA.bounds,
                boundXMax = bodyA.bounds.max.x,
                boundYMax = bodyA.bounds.max.y,
                boundYMin = bodyA.bounds.min.y,
                bodyAStatic = bodyA.isStatic || bodyA.isSleeping,
                partsALength = bodyA.parts.length,
                partsASingle = partsALength === 1;

            for (j = i + 1; j < bodiesLength; j++) {
                var bodyB = bodies[j],
                    boundsB = bodyB.bounds;

                if (boundsB.min.x > boundXMax) {
                    break;
                }

                if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) {
                    continue;
                }

                if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) {
                    continue;
                }

                if (!canCollide(bodyA.collisionFilter, bodyB.collisionFilter)) {
                    continue;
                }

                var partsBLength = bodyB.parts.length;

                if (partsASingle && partsBLength === 1) {
                    var collision = collides(bodyA, bodyB, pairs);

                    if (collision) {
                        collisions[collisionIndex++] = collision;
                    }
                } else {
                    var partsAStart = partsALength > 1 ? 1 : 0,
                        partsBStart = partsBLength > 1 ? 1 : 0;
                    
                    for (var k = partsAStart; k < partsALength; k++) {
                        var partA = bodyA.parts[k],
                            boundsA = partA.bounds;

                        for (var z = partsBStart; z < partsBLength; z++) {
                            var partB = bodyB.parts[z],
                                boundsB = partB.bounds;

                            if (boundsA.min.x > boundsB.max.x || boundsA.max.x < boundsB.min.x
                                || boundsA.max.y < boundsB.min.y || boundsA.min.y > boundsB.max.y) {
                                continue;
                            }

                            var collision = collides(partA, partB, pairs);

                            if (collision) {
                                collisions[collisionIndex++] = collision;
                            }
                        }
                    }
                }
            }
        }

        if (collisions.length !== collisionIndex) {
            collisions.length = collisionIndex;
        }

        return collisions;
    };

    /**
     * Finds all collisions among `detector.bodies` using the detector's
     * broadphase, `detector.broadphase`:
     *
     * - `'sweep'` is upstream's sort-and-sweep, and the default.
     * - `'grid'` indexes static and sleeping bodies once and keeps the index
     *   as bodies come and go, so each step costs about the MOVING bodies, not
     *   the world (see `Detector._collisionsGrid`). It emits collisions in a
     *   different but still deterministic order, so it is a re-baseline of the
     *   simulation, not bit-identical to the sweep.
     *
     * Anything else throws, on every call rather than only at
     * `Detector.create`: the config is a plain field a caller can assign, and a
     * detector quietly falling back to the sweep is the failure this exists to
     * rule out. Two string compares per step are free.
     * @method collisions
     * @param {detector} detector
     * @return {collision[]} collisions
     */
    Detector.collisions = function(detector) {
        var broadphase = detector.broadphase;

        if (broadphase === 'grid') {
            return Detector._collisionsGrid(detector);
        }

        if (broadphase === 'sweep') {
            return Detector._collisionsSweep(detector);
        }

        throw Detector._broadphaseError(broadphase);
    };

    /**
     * Tests a candidate body pair and appends any resulting collision, handling
     * compound multi-part bodies exactly as the sweep does. Returns the new
     * collision index. Shared by the grid path.
     * @private
     * @method _testPair
     */
    Detector._testPair = function(bodyA, bodyB, pairs, collisions, collisionIndex) {
        var partsALength = bodyA.parts.length,
            partsBLength = bodyB.parts.length;

        if (partsALength === 1 && partsBLength === 1) {
            var collision = Collision.collides(bodyA, bodyB, pairs);

            if (collision) {
                collisions[collisionIndex++] = collision;
            }

            return collisionIndex;
        }

        var partsAStart = partsALength > 1 ? 1 : 0,
            partsBStart = partsBLength > 1 ? 1 : 0;

        for (var k = partsAStart; k < partsALength; k++) {
            var partA = bodyA.parts[k],
                partABounds = partA.bounds;

            for (var z = partsBStart; z < partsBLength; z++) {
                var partB = bodyB.parts[z],
                    partBBounds = partB.bounds;

                if (partABounds.min.x > partBBounds.max.x || partABounds.max.x < partBBounds.min.x
                    || partABounds.max.y < partBBounds.min.y || partABounds.min.y > partBBounds.max.y) {
                    continue;
                }

                var partCollision = Collision.collides(partA, partB, pairs);

                if (partCollision) {
                    collisions[collisionIndex++] = partCollision;
                }
            }
        }

        return collisionIndex;
    };

    /**
     * Creates an open-addressing hash table mapping packed cell keys to bucket
     * arrays, replacing `Map` for the grid's cell indexes. Linear probing
     * over two flat parallel arrays: `keys` (Float64Array; the packed cell key
     * `(cx + offset) * stride + (cy + offset)` is always positive within the
     * coordinate contract, so `0` marks an empty slot) and `vals` (the bucket
     * arrays). Keys are never deleted (buckets persist per cell, matching the
     * previous Map behaviour), so no tombstones are needed. Lookup order never
     * affects emission order, so this is purely mechanical: bit-identical.
     * @private
     * @method _createCellTable
     */
    Detector._createCellTable = function() {
        return {
            keys: new Float64Array(2048),
            // pre-filled so the backing store stays packed: a bare
            // `new Array(n)` is HOLEY and every probe read pays for it
            vals: new Array(2048).fill(null),
            mask: 2047,
            count: 0
        };
    };

    /**
     * Looks up the bucket for a packed cell key, or `undefined` when the cell
     * has never been touched. `hash` is the caller-computed cell hash.
     * @private
     * @method _cellGet
     */
    Detector._cellGet = function(table, key, hash) {
        var keys = table.keys,
            mask = table.mask,
            probe = hash & mask,
            stored = keys[probe];
        while (stored !== key && stored !== 0) {
            probe = (probe + 1) & mask;
            stored = keys[probe];
        }
        if (stored === key) {
            return table.vals[probe];
        }
        return undefined;
    };

    /**
     * Computes the hash for a cell from its OFFSET coordinates (the
     * `cx + keyOffset` / `cy + keyOffset` values, so a rehash can re-derive it
     * from the packed key alone).
     * @private
     * @method _cellHash
     */
    Detector._cellHash = function(cxOffset, cyOffset) {
        // Fibonacci-style mixing; the xor-fold spreads high bits into the
        // masked low bits
        var mixed = (Math.imul(cxOffset, 0x9E3779B1) ^ Math.imul(cyOffset, 0x85EBCA77)) | 0;
        return (mixed ^ (mixed >>> 15)) | 0;
    };

    /**
     * Per-axis cap on the mover cell index (see the insert pass in
     * `_collisionsGrid`): `1 << _maxCellShift` cells, so the flat index is
     * never larger than `1 << (2 * _maxCellShift)` slots. A mover spread wider
     * than this wraps into the same slots, which stays correct because chain
     * entries carry their cell key.
     */
    Detector._maxCellShift = 7;

    /**
     * Returns a `Float64Array` of at least `minLength` holding `existing`'s
     * values. Used to grow a mover's captured static-candidate bounds while its
     * candidate list is being collected.
     * @private
     * @method _growFloats
     */
    Detector._growFloats = function(existing, minLength) {
        var grown = new Float64Array(Math.max(minLength, existing.length * 2));
        grown.set(existing);
        return grown;
    };

    /**
     * Smallest shift `s` (capped at `_maxCellShift`) with `1 << s >= extent`,
     * i.e. the power-of-two axis size that covers `extent` cells.
     * @private
     * @method _cellShiftFor
     */
    Detector._cellShiftFor = function(extent) {
        var maxShift = Detector._maxCellShift,
            shift = 0;

        while (shift < maxShift && (1 << shift) < extent) {
            shift++;
        }

        return shift;
    };

    /**
     * Doubles a cell table's capacity and reinserts every live key (hashes are
     * re-derived from the packed keys). Rare: only on load-factor growth.
     * @private
     * @method _cellTableGrow
     */
    Detector._cellTableGrow = function(table) {
        var oldKeys = table.keys,
            oldVals = table.vals,
            oldCapacity = oldKeys.length,
            newCapacity = oldCapacity * 2,
            newKeys = new Float64Array(newCapacity),
            newVals = new Array(newCapacity).fill(null),
            newMask = newCapacity - 1,
            keyStride = 0x200000;

        for (var slot = 0; slot < oldCapacity; slot++) {
            var liveKey = oldKeys[slot];
            if (liveKey === 0) {
                continue;
            }
            var cxOffset = Math.floor(liveKey / keyStride),
                cyOffset = liveKey - cxOffset * keyStride,
                probe = Detector._cellHash(cxOffset, cyOffset) & newMask;
            while (newKeys[probe] !== 0) {
                probe = (probe + 1) & newMask;
            }
            newKeys[probe] = liveKey;
            newVals[probe] = oldVals[slot];
        }

        table.keys = newKeys;
        table.vals = newVals;
        table.mask = newMask;
    };

    /**
     * Looks up the bucket for a packed cell key, creating (and inserting) an
     * empty bucket when the cell is new. Grows the table at half load.
     * @private
     * @method _cellGetOrCreate
     */
    Detector._cellGetOrCreate = function(table, key, hash) {
        var keys = table.keys,
            mask = table.mask,
            probe = hash & mask,
            stored = keys[probe];
        while (stored !== key && stored !== 0) {
            probe = (probe + 1) & mask;
            stored = keys[probe];
        }
        if (stored === key) {
            return table.vals[probe];
        }

        if ((table.count + 1) * 2 > mask + 1) {
            Detector._cellTableGrow(table);
            keys = table.keys;
            mask = table.mask;
            probe = hash & mask;
            while (keys[probe] !== 0) {
                probe = (probe + 1) & mask;
            }
        }

        var bucket = [];
        keys[probe] = key;
        table.vals[probe] = bucket;
        table.count++;
        return bucket;
    };

    /**
     * Inserts a static body into the cell buckets it occupies, in world order.
     *
     * Bucket contents are kept sorted by `_sWorldIndex` so they read back in the
     * same order a full rebuild (a walk of `detector.bodies`) would produce.
     * Restamping every body's index on each classification walk keeps that key
     * meaningful: `Composite` add and remove preserve the relative order of
     * everything else, so an already-sorted bucket stays sorted across them.
     * @private
     * @method _staticIndexInsert
     */
    Detector._staticIndexInsert = function(g, body, cellSize, invCell, maxCells) {
        var bounds = body.bounds,
            cx0 = Math.floor(bounds.min.x * invCell),
            cx1 = Math.floor(bounds.max.x * invCell),
            cy0 = Math.floor(bounds.min.y * invCell),
            cy1 = Math.floor(bounds.max.y * invCell),
            worldIndex = body._sWorldIndex,
            buckets = body._sBuckets,
            keyOffset = 0x100000,
            keyStride = 0x200000,
            cx,
            cy,
            at;

        if (buckets === null) {
            buckets = body._sBuckets = [];
        } else {
            // popped rather than `length = 0`, as the candidate list in
            // `_collisionsGrid` is: no StoreIC call, capacity kept
            while (buckets.length !== 0) {
                buckets.pop();
            }
        }

        body._sIndexed = true;
        body._sIndexedAt = g.indexed.length;
        g.indexed.push(body);
        g.sFlatValid = false;

        // an oversized static spans too many cells to bucket; it goes on the
        // list every mover scans instead, and holds no buckets (which is what
        // an empty `_sBuckets` means). It needs no cell bookkeeping either:
        // `sOver` is re-scanned by every mover every step, never cached
        if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > maxCells) {
            at = g.sOver.length;
            while (at > 0 && g.sOver[at - 1]._sWorldIndex > worldIndex) {
                at--;
            }
            g.sOver.splice(at, 0, body);
            return;
        }

        // remember the span so unbucketing can report the same cells back
        body._sCx0 = cx0;
        body._sCx1 = cx1;
        body._sCy0 = cy0;
        body._sCy1 = cy1;

        // and report them as changed, so the movers standing over them drop
        // their cached static-candidate lists. Skipped during a full rebuild
        // (`built` is only set at the end of one), which bumps the epoch and so
        // invalidates every cached list at once
        if (g.built) {
            // filled BY INDEX up to `g.changedCount`, never cleared (see the
            // invalidation sweep in `_collisionsGrid`)
            var changed = g.changedCells,
                changedAt = g.changedCount;
            for (cx = cx0; cx <= cx1; cx++) {
                for (cy = cy0; cy <= cy1; cy++) {
                    changed[changedAt++] = cx;
                    changed[changedAt++] = cy;
                }
            }
            g.changedCount = changedAt;
        }

        for (cx = cx0; cx <= cx1; cx++) {
            var keyX = (cx + keyOffset) * keyStride,
                cxOffset = cx + keyOffset;

            for (cy = cy0; cy <= cy1; cy++) {
                // store the body reference, not its index into detector.bodies:
                // any add or remove reorders and shrinks that array, so a
                // stored index can dangle
                var bucket = Detector._cellGetOrCreate(
                    g.sTable, keyX + (cy + keyOffset), Detector._cellHash(cxOffset, cy + keyOffset)
                );

                at = bucket.length;
                while (at > 0 && bucket[at - 1]._sWorldIndex > worldIndex) {
                    at--;
                }

                if (at === bucket.length) {
                    bucket.push(body);
                } else {
                    bucket.splice(at, 0, body);
                }

                buckets.push(bucket);
            }
        }
    };

    /**
     * Removes a static body's reference from every bucket it was inserted into.
     * Splicing (rather than a swap-remove) is what keeps the remaining contents
     * in world order.
     * @private
     * @method _staticIndexUnbucket
     */
    Detector._staticIndexUnbucket = function(g, body) {
        var buckets = body._sBuckets,
            i,
            at;

        g.sFlatValid = false;

        if (buckets === null) {
            return;
        }

        // no buckets means an oversized static, which lives on the list every
        // mover scans instead of in cells
        if (buckets.length === 0) {
            at = g.sOver.indexOf(body);
            if (at !== -1) {
                g.sOver.splice(at, 1);
            }
            return;
        }

        // report the vacated cells from the span the body was BUCKETED at, not
        // from its live bounds: a released tile has already been integrated by
        // `Engine._bodiesUpdate` this step, so its bounds describe where it is
        // now, not the cells it is being pulled out of
        var changed = g.changedCells,
            changedAt = g.changedCount,
            ucx,
            ucy,
            ucx1 = body._sCx1,
            ucy1 = body._sCy1;

        for (ucx = body._sCx0; ucx <= ucx1; ucx++) {
            for (ucy = body._sCy0; ucy <= ucy1; ucy++) {
                changed[changedAt++] = ucx;
                changed[changedAt++] = ucy;
            }
        }

        g.changedCount = changedAt;

        for (i = 0; i < buckets.length; i++) {
            var bucket = buckets[i];
            at = bucket.indexOf(body);
            if (at !== -1) {
                bucket.splice(at, 1);
            }
        }

        // popped rather than `length = 0` (see `_staticIndexInsert`)
        while (buckets.length !== 0) {
            buckets.pop();
        }
    };

    /**
     * Removes a static body from the index entirely: out of the membership
     * list, and out of every bucket it was inserted into.
     * @private
     * @method _staticIndexRemove
     */
    Detector._staticIndexRemove = function(g, body) {
        var indexed = g.indexed,
            slot = body._sIndexedAt;

        // swap-remove from the membership list. Its order carries no meaning
        // (bucket order is what the simulation depends on, and sFlat is rebuilt
        // from the body array), so this stays O(1) and keeps a release off any
        // whole-list walk
        if (slot >= 0 && indexed[slot] === body) {
            var last = indexed[indexed.length - 1];
            indexed[slot] = last;
            last._sIndexedAt = slot;
            indexed.length--;
        }

        body._sIndexed = false;
        body._sIndexedAt = -1;

        Detector._staticIndexUnbucket(g, body);
    };

    /**
     * Builds the static index from scratch. Only runs on the first step and
     * after a cell-size change (which invalidates every bucket key); every other
     * membership change is applied as a difference by `_staticIndexApply`.
     * @private
     * @method _staticIndexRebuild
     */
    Detector._staticIndexRebuild = function(g, bodies, n, cellSize, invCell, maxCells) {
        var table = g.sTable,
            keys = table.keys,
            vals = table.vals,
            i;

        // empty every live bucket. Walking the table (rather than a maintained
        // list of touched buckets) costs one pass over its slots, which is fine
        // for a path this rare and means the incremental path never has to keep
        // such a list in sync
        for (i = 0; i < keys.length; i++) {
            if (keys[i] !== 0) {
                vals[i].length = 0;
            }
        }

        g.sOver.length = 0;
        g.sFlat.length = 0;
        g.sFlatValid = false;
        g.indexed.length = 0;
        // the epoch bump below invalidates every cached candidate list, so
        // per-cell reports from this rebuild would be a pure cost
        g.changedCount = 0;

        for (i = 0; i < n; i++) {
            var body = bodies[i];

            body._sIndexed = false;

            if (!(body.isStatic || body.isSleeping) || body._sMoved === true) {
                continue;
            }

            Detector._staticIndexInsert(g, body, cellSize, invCell, maxCells);
        }

        g.built = true;
        g.epoch += 1;
    };

    /**
     * Applies this step's static membership difference to the index: bodies that
     * left the world or stopped being static are removed, bodies that became
     * static or entered the world are inserted.
     * @private
     * @method _staticIndexApply
     */
    Detector._staticIndexApply = function(g, cellSize, invCell, maxCells, staticCount) {
        var indexed = g.indexed,
            pendingAdd = g.pendingAdd,
            pendingAddLength = pendingAdd.length,
            walkStamp = g.walkStamp,
            i;

        // A static that LEFT the world is the one change no per-body flag can
        // report, and finding it costs a walk of the whole membership list. But
        // it always shows up as a count mismatch first: releases already
        // unindexed themselves during the classification walk, so once this
        // step's insertions land, the membership list should be exactly the
        // statics the walk counted. Only when it is not does anything need
        // searching for.
        if (indexed.length + pendingAddLength !== staticCount) {
            var keep = 0,
                indexedLength = indexed.length;

            for (i = 0; i < indexedLength; i++) {
                var body = indexed[i];

                if (body._sWalk !== walkStamp) {
                    // gone from the world. Removing by hand rather than through
                    // _staticIndexRemove, since this loop is already compacting
                    // the membership list it would swap-remove from
                    Detector._staticIndexUnbucket(g, body);
                    body._sIndexed = false;
                    body._sIndexedAt = -1;
                    continue;
                }

                indexed[keep] = body;
                body._sIndexedAt = keep;
                keep++;
            }

            if (indexed.length !== keep) {
                indexed.length = keep;
            }
        }

        for (i = 0; i < pendingAddLength; i++) {
            Detector._staticIndexInsert(g, pendingAdd[i], cellSize, invCell, maxCells);
        }

        pendingAdd.length = 0;

        // NOTE: no epoch bump. The epoch invalidates EVERY mover's cached
        // static-candidate list, and this path runs on every step of a page
        // being destroyed, which drove that cache's hit rate to zero. The
        // changes are reported per CELL instead (`g.changedCells`), and only the
        // movers standing over one lose their list. The epoch is now bumped
        // only by a full rebuild, where every bucket really does change.
    };

    /**
     * The largest share of a world's bodies that may be movers for the
     * grid broadphase (and so the engine) to read the body journal
     * rather than walk. Above it the full walks run, as before the journal.
     *
     * The journal removes the same work at any share, and the phase timers
     * say so (at the storm bench shape, 45 percent movers, the two
     * classifications cost 21 to 25 us less per update). But there the WHOLE
     * update measured slower, in most runs and in functions the journal never
     * touches (`Pairs.update`, the narrowphase, `Body.update`), by a median 4
     * percent over 32 interleaved runs with the velocity option off, while the
     * same code with the journal never read measured flat. Where the walks
     * dominate, at a few movers in a large static world (the traversal shape,
     * 2.6 percent movers), the update is 24 percent faster. Tests set this to 1
     * to run the journal at every share.
     * @private
     * @property _journalMoverShare
     * @type number
     */
    Detector._journalMoverShare = 0.25;

    /**
     * Starts `world`'s body journal from the full classification walk that
     * just stamped every body in it with `walkStamp` (see
     * Common._journalTouch): that stamp becomes the membership generation, the
     * list starts empty, and the next add's sort key follows the `n` the walk
     * wrote.
     * @private
     * @method _journalStart
     */
    Detector._journalStart = function(g, world, walkStamp, n) {
        var touched = world._touched,
            touchedCount = world._touchedCount;

        // drop the references a switched-off journal may still hold
        for (var i = 0; i < touchedCount; i++) {
            touched[i] = null;
        }

        world._touchedCount = 0;
        world._journalLive = true;
        world._memberGen = walkStamp;
        world._nextOrdinal = n;
        world._journalLength = n;
        world._journalForeignWalks = Common._foreignWalks;
        g.journalUsed = false;
        g.journalWorld = world;
        g.journalGen = walkStamp;
    };

    /**
     * Classifies from `world`'s body journal: the answer the full walk in
     * `_collisionsGrid` gives, from the bodies that changed since the
     * last classification rather than from every body in the world.
     *
     * Each journal entry is re-read against the body's state NOW, so the
     * order and number of its entries do not matter. A member is classified
     * exactly as the walk classifies it, with the same writes. A body that is
     * no longer a member leaves the index, which is exactly what the walk's
     * departure scan does to an indexed body its walk did not stamp; a
     * departure the journal missed would still be found by that scan, since
     * every member carries the walk stamp the scan tests against.
     *
     * The mover list keeps BODY order because `_sWorldIndex` stays increasing
     * along the body array between walks: the walk writes it, each add gives
     * a body going on the end the next ordinal, and a removal keeps the
     * relative order of what remains. The static count is what the walk's
     * count is, every body in the world that is not a mover.
     * @private
     * @method _classifyFromJournal
     * @param {object} g
     * @param {composite} world
     * @param {number} n
     */
    Detector._classifyFromJournal = function(g, world, n) {
        var touched = world._touched,
            touchedCount = world._touchedCount,
            memberGen = world._memberGen,
            movers = g.movers,
            moversLength = movers.length,
            pendingAdd = g.pendingAdd,
            arrivals = g.arrivals,
            indexed = g.indexed,
            // marks this pass's entries, so a body listed twice is classified
            // once and the mover list below can drop every one of them. From
            // the grid's one counter, whose every stamp is fresh (see
            // gridStamp)
            stamp = ++gridStamp,
            staticDirty = false,
            arrivalCount = 0,
            moverCount = 0,
            i;

        pendingAdd.length = 0;

        for (i = 0; i < touchedCount; i++) {
            var body = touched[i];

            touched[i] = null;

            if (body._gsStamp === stamp) {
                continue;
            }

            body._gsStamp = stamp;

            if (body._sOwner !== world || body._sWalk !== memberGen) {
                // no longer a member: what the departure scan does to an
                // indexed body the walk did not stamp. Only a body in THIS
                // index, as the scan only reads this index; the mover list
                // below drops it either way
                if (body._sIndexed && indexed[body._sIndexedAt] === body) {
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
                continue;
            }

            // from here, the full walk's classification of one body, write for
            // write (see there)
            var isStaticNow = (body.isStatic || body.isSleeping) && body._sMoved !== true;

            if (body._sDeparted) {
                body._sDeparted = false;
                body._scEpoch = -1;
                if (body._sIndexed) {
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
            }

            if (body._sPrev !== isStaticNow) {
                body._sPrev = isStaticNow;
                body._scEpoch = -1;
                staticDirty = true;
            }

            if (isStaticNow) {
                if (!body._sIndexed) {
                    pendingAdd.push(body);
                    staticDirty = true;
                }
            } else {
                arrivals[arrivalCount++] = body;
                if (body._sIndexed) {
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
            }
        }

        world._touchedCount = 0;

        if (touchedCount > 0) {
            // drop every body this pass read from the mover list, keeping the
            // rest in order, then merge the ones that are movers now back in by
            // their sort key
            for (i = 0; i < moversLength; i++) {
                var kept = movers[i];
                if (kept._gsStamp !== stamp) {
                    movers[moverCount++] = kept;
                }
            }

            // arrivals are few: insertion sort by the key
            for (i = 1; i < arrivalCount; i++) {
                var arriving = arrivals[i],
                    arrivingKey = arriving._sWorldIndex,
                    at = i;
                while (at > 0 && arrivals[at - 1]._sWorldIndex > arrivingKey) {
                    arrivals[at] = arrivals[at - 1];
                    at--;
                }
                arrivals[at] = arriving;
            }

            var total = moverCount + arrivalCount,
                from = moverCount - 1,
                take = arrivalCount - 1,
                write = total - 1;

            // grown by push so the list stays packed, then merged from the end
            while (movers.length < total) {
                movers.push(null);
            }

            while (take >= 0) {
                var arrival = arrivals[take];
                if (from >= 0 && movers[from]._sWorldIndex > arrival._sWorldIndex) {
                    movers[write--] = movers[from--];
                } else {
                    movers[write--] = arrival;
                    arrivals[take--] = null;
                }
            }

            if (movers.length !== total) {
                movers.length = total;
            }
        }

        g.staticCount = n - movers.length;
        g.classifyDirty = staticDirty;
    };

    /**
     * Builds `Engine.update`'s mover list (every body in `world` that is
     * neither static nor sleeping, in body order) into `moverBodies` from
     * what the grid classification already knows, instead of walking
     * every body, and returns whether it could.
     *
     * The detector's mover list is exact for the world as its last
     * classification saw it, and every change since is in the world's body
     * journal, not yet read (see _classifyFromJournal). A body not in the
     * journal keeps its role, so the engine's movers among those are the
     * detector's movers that are neither static nor sleeping (the detector
     * also counts a resting body promoted by a move, `_sMoved`); each body in
     * the journal is read as it is now, and merged in by `_sWorldIndex` like
     * the detector's own. The journal is only read here, never emptied: the
     * detector reads it later in the same update.
     *
     * It can only when the journal describes every change since that
     * classification, which are the conditions under which the detector reads
     * it itself, and when `world.bodies` is still the array that
     * classification read. The journal describes the WORLD as it is now, and
     * `Engine.update` steps the array it took at its start: a listener that
     * adds or removes a body during the update (a `sleepStart` listener,
     * say, which runs before this) gives the world a fresh array the update
     * does not step, and a caller that replaces `world.bodies` without
     * signalling changes the world under a journal that never saw it. Either
     * leaves the world an array the last classification never read, and the
     * update then walks. Outside those, the array keeps its identity (an add
     * or a remove between updates edits it in place), so the test costs the
     * common case nothing.
     * @private
     * @method _moversFromJournal
     * @param {detector} detector
     * @param {composite} world
     * @param {body[]} moverBodies
     * @return {boolean}
     */
    Detector._moversFromJournal = function(detector, world, moverBodies) {
        var g = detector._sgrid;

        if (g === undefined || g === null || !g.built || g.journalWorld !== world
            || g.classifyBodies !== world.bodies
            || world._journalLive !== true || g.journalGen !== world._memberGen
            || world._journalLength !== world.bodies.length
            || world._journalForeignWalks !== Common._foreignWalks) {
            return false;
        }

        var touched = world._touched,
            touchedCount = world._touchedCount,
            memberGen = world._memberGen,
            movers = g.movers,
            moversLength = movers.length,
            arrivals = g.arrivals,
            stamp = ++gridStamp,
            arrivalCount = 0,
            moverCount = 0,
            i;

        for (i = 0; i < touchedCount; i++) {
            var body = touched[i];

            if (body._gsStamp === stamp) {
                continue;
            }

            body._gsStamp = stamp;

            if (body._sOwner === world && body._sWalk === memberGen
                && !(body.isStatic || body.isSleeping)) {
                arrivals[arrivalCount++] = body;
            }
        }

        for (i = 0; i < moversLength; i++) {
            var kept = movers[i];
            if (kept._gsStamp !== stamp && !(kept.isStatic || kept.isSleeping)) {
                moverBodies[moverCount++] = kept;
            }
        }

        // arrivals are few: insertion sort by the key
        for (i = 1; i < arrivalCount; i++) {
            var arriving = arrivals[i],
                arrivingKey = arriving._sWorldIndex,
                at = i;
            while (at > 0 && arrivals[at - 1]._sWorldIndex > arrivingKey) {
                arrivals[at] = arrivals[at - 1];
                at--;
            }
            arrivals[at] = arriving;
        }

        var total = moverCount + arrivalCount,
            from = moverCount - 1,
            take = arrivalCount - 1,
            write = total - 1;

        // grown by push so the list stays packed, then merged from the end
        while (moverBodies.length < total) {
            moverBodies.push(null);
        }

        while (take >= 0) {
            var arrival = arrivals[take];
            if (from >= 0 && moverBodies[from]._sWorldIndex > arrival._sWorldIndex) {
                moverBodies[write--] = moverBodies[from--];
            } else {
                moverBodies[write--] = arrival;
                arrivals[take--] = null;
            }
        }

        if (moverBodies.length !== total) {
            moverBodies.length = total;
        }

        return true;
    };

    /**
     * Stamps every body in `bodies` with `walkStamp` and makes `liveWorld` its
     * owner, the check a full walk runs before it restarts the world's body
     * journal, and returns whether the array holds any body twice (which no
     * journal can describe). A body the world's last walk stamped (`ownedGen`)
     * is owned by it already (see Composite._ownedGen), so for every body but
     * the few that came in since this is one comparison and `_sOwner`, which
     * lies past the cache line the walk touches, is never read. A body taken
     * from a composite whose journal held it switches that journal off.
     * @private
     * @method _claimBodies
     * @param {body[]} bodies
     * @param {number} n
     * @param {composite} liveWorld
     * @param {number} ownedGen
     * @param {number} walkStamp
     * @return {boolean}
     */
    Detector._claimBodies = function(bodies, n, liveWorld, ownedGen, walkStamp) {
        var duplicate = false;

        for (var i = 0; i < n; i++) {
            var body = bodies[i],
                lastWalk = body._sWalk;

            if (lastWalk !== ownedGen) {
                if (lastWalk === walkStamp) {
                    // seen already in this pass: the array holds it twice
                    duplicate = true;
                } else {
                    // not known to be owned by this world (it came in by a
                    // direct edit, say)
                    var owner = body._sOwner;
                    if (owner !== liveWorld) {
                        if (owner !== null) {
                            owner._journalLive = false;
                        }
                        body._sOwner = liveWorld;
                    }
                }
            }

            body._sWalk = walkStamp;
        }

        return duplicate;
    };

    /**
     * The full classification walk of `_collisionsGrid`: every body in
     * `bodies` classified as a mover or a static, the static index told what
     * changed, and the body journal restarted from the walk when it can be.
     * Writes `g.movers`, `g.pendingAdd`, `g.staticCount`, and in
     * `g.classifyDirty` whether the static set changed. The fallback to the
     * body journal's own pass, `_classifyFromJournal`, which writes the same.
     * @private
     * @method _classifyWalk
     * @param {object} g
     * @param {body[]} bodies
     * @param {number} n
     * @param {composite|null} world the world `Engine.update` named, if any
     * @param {composite|null} liveWorld `world` when `bodies` is its own array
     */
    Detector._classifyWalk = function(g, bodies, n, world, liveWorld) {
        var movers = g.movers,
            staticDirty = false,
            staticCount,
            i;

        // `movers` is filled BY INDEX and trimmed once below, rather than
        // cleared with `movers.length = 0` and re-pushed. Clearing to zero
        // drops the backing store, so every rebuild regrows it from empty
        // and allocates; writing in place reuses it. This is the idiom the
        // engine's own mover classification already uses (`Engine.update`)
        var moverCount = 0,
            duplicate = false;
        staticCount = 0;

        // this walk is also where the static index learns what changed, so
        // it stamps every body it sees. A body still in the index whose
        // stamp is stale on the next pass has LEFT the world, which is the
        // one kind of change no per-body flag can report. The stamp is
        // unique across every detector, since it also serves as the body
        // journal's membership generation (see Common._journalTouch)
        var walkStamp = g.walkStamp = ++Common._walkStamp,
            ownedGen = liveWorld !== null ? liveWorld._ownedGen : 0,
            // whether this walk checks the world for a body journal
            // to start (no body twice, every body owned by the world): only
            // where the journal would be read (see Detector._journalMoverShare)
            verify = liveWorld !== null && movers.length <= n * Detector._journalMoverShare,
            pendingAdd = g.pendingAdd;
        pendingAdd.length = 0;

        // A journal switched off before it was ever read is the mark
        // of a caller that edits the body array directly and signals
        // `Composite.setModified` on every update, for whom the check
        // is a pure cost; after each such journal the check waits for
        // twice as many walks, up to 63
        if (verify) {
            if (g.journalWorld === liveWorld) {
                g.journalFailures = g.journalUsed ? 0 : Math.min(g.journalFailures + 1, 6);
                g.journalSkip = (1 << g.journalFailures) - 1;
            }
            if (g.journalSkip > 0) {
                g.journalSkip--;
                verify = false;
            }
        }

        // a walk of any array that is not its world's own replaces
        // stamps some journal may count on, which is recorded once here
        // rather than looked up per body (see Common._foreignWalks)
        if (liveWorld === null) {
            Common._foreignWalks++;
        }

        // the check is a pass of its own, ahead of the walk, so the walk below
        // is the same loop as before the journal. Folded into the walk as a
        // branch, it measured 2 to 3 percent slower on a whole traversal step
        // even on the updates where the branch was never taken
        if (verify) {
            duplicate = Detector._claimBodies(bodies, n, liveWorld, ownedGen, walkStamp);
        }

        for (i = 0; i < n; i++) {
            var body = bodies[i],
                // a resting body a setter moved after it was indexed (e.g. an
                // inner-scroll surface that is static but moves each tick, see
                // Body._promoteIfIndexed) is a mover, so it is re-bucketed
                // every step and never goes stale in the static index
                isStaticNow = (body.isStatic || body.isSleeping) && body._sMoved !== true;

            body._sWalk = walkStamp;
            body._sWorldIndex = i;

            // removed from the world and added back before this walk ran,
            // so it is still indexed but may now sit at a different place in
            // the body array. Drop it from the index and let the pass below
            // re-insert it at its new position, or bucket order would no
            // longer match the order a full rebuild produces
            if (body._sDeparted) {
                body._sDeparted = false;
                // out of the world it was in no mover index, so the
                // per-cell invalidation sweep could not reach it
                body._scEpoch = -1;
                if (body._sIndexed) {
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
            }

            if (body._sPrev !== isStaticNow) {
                body._sPrev = isStaticNow;
                // same reason: while it was static it was not a mover, so
                // any cell that changed under it went unreported to it
                body._scEpoch = -1;
                staticDirty = true;
            }

            if (isStaticNow) {
                staticCount++;
                if (!body._sIndexed) {
                    pendingAdd.push(body);
                    staticDirty = true;
                }
            } else {
                movers[moverCount++] = body;
                if (body._sIndexed) {
                    // released into a mover: unindex it here, so the apply
                    // pass below never has to walk the membership list
                    // looking for it
                    Detector._staticIndexRemove(g, body);
                    staticDirty = true;
                }
            }
        }

        // the trim is NOT optional. The ONE read of `movers.length` below
        // (snapshotted into `moversLength`) is what bounds every consumer
        // of it, so a slot left over from a longer previous list is read
        // as a live mover. Held by Detector.spec's shrinking-mover-set
        // test, which is the only gate that can see it: every other one
        // either builds a fresh detector per scene or only ever shrinks
        // the STATIC set
        if (movers.length !== moverCount) {
            movers.length = moverCount;
        }

        g.staticCount = staticCount;

        // every body in the world is now stamped by this walk and owned
        // by the world. Start the body journal from the walk, when it
        // walked a flat world's own array and found no body twice;
        // otherwise the world's journal no longer matches the stamps
        // this walk wrote
        if (verify) {
            liveWorld._ownedGen = walkStamp;
        }

        if (verify && !duplicate) {
            Detector._journalStart(g, liveWorld, walkStamp, n);
        } else {
            if (world !== null) {
                world._journalLive = false;
            }
            g.journalWorld = null;
        }

        g.classifyDirty = staticDirty;
    };

    /**
     * The grid broadphase (`detector.broadphase === 'grid'`): a uniform grid
     * with a static index. The static field (intact page) is bucketed ONCE and
     * reused; only dynamic bodies (movers) are re-bucketed each step, and only
     * movers drive candidate generation. Static-static pairs are never visited (no resolved collision
     * can be static-static), so a calm page costs ~O(movers) per step instead of
     * O(all bodies) like the sweep. Re-baseline: emission order differs from the
     * sweep but is deterministic.
     *
     * The static index is rebuilt only when the static membership changes
     * (detected per body via a cached `_sPrev` flag plus a `staticCount` guard),
     * e.g. on release. A resting body that MOVES while staying at rest (an
     * inner-scroll surface) is promoted to a mover by the `Body` setter that
     * moved it, once the index holds it (see Body._promoteIfIndexed), and is a
     * mover from then on; nothing has to tag it.
     *
     * The static buckets (and the oversized-static list) hold body REFERENCES,
     * not indices into `detector.bodies`. The index outlives a step, but Matter
     * changes `detector.bodies` on any add or remove (a flat world's own array,
     * edited in place), which reorders and shrinks it. Since the rebuild
     * fires only on static-membership changes, a stored index could point at the
     * wrong body or past the array end on a later step; a reference cannot.
     *
     * The consumer greps its built bundle for this function's NAME to prove it
     * shipped this fork rather than upstream, so renaming it breaks that
     * build, loudly and on purpose.
     *
     * Every per-body field this path writes (`_sPrev`, `_gsStamp`,
     * `_sMoved`, `_sc*`, `_s*` index membership) is pre-declared in
     * `Body.create`; see the rule there before introducing a new one (a lazily
     * added field splits body hidden classes and slows the whole engine,
     * measured 1.3-4.8x).
     *
     * Because that state lives on the BODY rather than on the detector, a body
     * belongs to one grid detector at a time. Sharing bodies between two
     * engines was already unsupported here (the candidate cache and the
     * broadphase stamps have the same constraint); the static index membership
     * simply makes it explicit.
     * @private
     * @method _collisionsGrid
     * @param {detector} detector
     * @return {collision[]} collisions
     */
    Detector._collisionsGrid = function(detector) {
        var bodies = detector.bodies,
            n = bodies.length,
            pairs = detector.pairs,
            canCollide = Detector.canCollide,
            collisions = detector.collisions,
            collisionIndex = 0,
            cellSize = detector.cellSize,
            invCell = 1 / cellSize,
            keyOffset = 0x100000,
            keyStride = 0x200000,
            maxCells = 24,
            i, cx, cy, u, key;

        var g = detector._sgrid;
        if (!g) {
            g = detector._sgrid = {
                // static index: an open-addressing cell table (see
                // _createCellTable) holding body REFERENCES per cell, kept in
                // world order, and maintained as a difference across steps
                // (see _staticIndexApply) rather than rebuilt
                sTable: Detector._createCellTable(), sOver: [], sFlat: [],
                // every body currently in the index, so a departure from the
                // world (which no per-body flag can report) is found by
                // scanning for a stale walk stamp; plus this step's insertions
                indexed: [], pendingAdd: [], walkStamp: 0,
                // the world whose body journal this index follows, and the
                // stamp of the full walk that started it (see
                // _classifyFromJournal); the journal pass's scratch list of
                // bodies joining the movers, and whether it changed the statics
                journalWorld: null, journalGen: -1, arrivals: [], classifyDirty: false,
                // whether the journal this index started has been read since,
                // and the back-off for one that keeps being switched off unread
                // (see the full walk below)
                journalUsed: false, journalFailures: 0, journalSkip: 0,
                // sFlat is the flat list of non-oversized statics that only an
                // OVERSIZED MOVER reads, so it is rebuilt lazily, on the rare
                // steps one exists, instead of maintained on every change
                sFlatValid: false,
                movers: [], built: false, indexedStaticCount: -1,
                // classification cache: the movers list and static count are
                // only recomputed when the body set or any body's
                // moving-vs-resting role actually changed
                classifyBodies: null, classifyLength: -1, classifyEpoch: -1,
                classifySetEpoch: -1,
                staticCount: 0,
                // mover cell index, rebuilt every step: per-cell chain heads
                // over a flat entry list (`dNext` / `dItem` / `dKey`) addressed
                // by arithmetic over the movers' bounding cell rectangle, plus
                // the per-mover cell spans `dSpan` shared by its two passes.
                // Reused buffers, so the steady state does not allocate
                dHead: new Int32Array(0), dNext: new Int32Array(0),
                dItem: new Int32Array(0), dKey: new Float64Array(0),
                dSpan: new Float64Array(0), dOver: [],
                // the movers' own bounds and visited stamps, flattened off the
                // body objects so the generation pass tests candidates against
                // contiguous memory
                mBounds: new Float64Array(0), mStamp: new Int32Array(0),
                mOver: new Int32Array(0),
                // each mover's FIRST entry index in the chain arrays. Its
                // remaining cells are the following slots, in the same order
                // both passes walk them, which is what lets the generation pass
                // start a chain walk past its own entry (see below)
                mEntry: new Int32Array(0),
                // static-index build epoch: bumped on every full REBUILD (where
                // every bucket changes) so each mover's cached static-candidate
                // list can be validated cheaply. An incremental change reports
                // the cells it touched here instead, as flat (cx, cy) pairs
                // consumed once per step by the invalidation sweep below.
                // Only the first `changedCount` values are live (see there)
                epoch: 0, changedCells: [], changedCount: 0,
                // the cell size the index was built at. NaN, which no cell size
                // equals, so the first step checks the detector's like any change
                cellSize: NaN
            };
        }

        var cellHash = Detector._cellHash,
            cellGet = Detector._cellGet,
            cellGetOrCreate = Detector._cellGetOrCreate;

        // a cell-size change invalidates every bucket key, including the
        // persistent static index built under the old size; force a rebuild
        // (without this, live cell-size tuning queries stale static buckets
        // and silently misses mover-vs-static collisions). A cell size is
        // checked here, where one is first seen (the first step included, as
        // the seed is NaN), so a bad one assigned to `detector.cellSize`
        // throws rather than indexing nothing or looping forever
        if (g.cellSize !== cellSize) {
            if (!Detector._isCellSize(cellSize)) {
                throw Detector._cellSizeError(cellSize);
            }
            g.cellSize = cellSize;
            g.built = false;
        }

        // 1) classify bodies into movers (dynamic) vs static, detecting any
        // change to the static set (release, add, remove) so the static index
        // is only rebuilt when it actually changed.
        //
        // This walk touches every body in the world, and on a dense static page
        // (thousands of intact tiles) it is memory-bound and one of the largest
        // single costs in the step, while its ANSWER almost never changes: the
        // mover set only moves when the body set changes (add / remove, each of
        // which bumps Common._bodySetEpoch) or when some body's
        // moving-vs-resting role flips (`Body.setStatic`, `Sleeping.set`, and
        // a setter promoting a moved indexed resting body, each of which bumps
        // the static epoch). So cache the result and rebuild only on those
        // signals.
        //
        // And when it has to be rebuilt, the change is usually a handful of
        // bodies in a world of thousands, which is where the body journal comes
        // in (see Common._journalTouch): for a flat world stepped by an engine,
        // the rebuild classifies just the bodies the journal records
        // (`_classifyFromJournal`), and the full walk below runs only when the
        // journal cannot describe the change.
        //
        // The body-set signal is that epoch AND the identity and length of
        // `detector.bodies`, rather than a flag set by `setBodies`. The epoch
        // is what sees a change to `world.bodies` in place (the array
        // `Engine.update` hands over for a flat world, whose identity never
        // changes), including one made between updates and read by a direct
        // call here; the identity and length keep a caller that assigns the
        // array directly correct. The cached movers list describes the array,
        // so a stale one keeps a body that left it or misses one that joined.
        var movers = g.movers,
            staticDirty = !g.built,
            staticCount = g.staticCount,
            classifyEpoch = Common._bodyStaticEpoch,
            classifySetEpoch = Common._bodySetEpoch;

        if (g.classifyBodies !== bodies || g.classifyLength !== n || g.classifyEpoch !== classifyEpoch
            || g.classifySetEpoch !== classifySetEpoch) {
            // whether this is the array the last classification read. A flat
            // world keeps its array through every add and remove made between
            // updates; a new one is a copy a listener's change made during an
            // update (which the journal recorded), or an array a caller put in
            // the world's place without a signal (which the journal cannot
            // have seen, and which keeps its length if it swapped a body). The
            // two look alike from here, so a new array is walked: one walk
            // after a listener's change, none in a world changed between updates
            var sameArray = g.classifyBodies === bodies;
            g.classifyBodies = bodies;
            g.classifyLength = n;
            g.classifyEpoch = classifyEpoch;
            g.classifySetEpoch = classifySetEpoch;

            // the world whose body array this is, when `Engine.update` handed
            // it over as the world's own (see Detector.setBodies). Only then can
            // the world's body journal say what changed in it, and the
            // classification reads that instead of walking every body
            // (a detector made as a plain object rather than by
            // Detector.create has no `_world` at all, and is used on its own)
            var world = detector._world === undefined ? null : detector._world,
                liveWorld = world !== null && world.bodies === bodies ? world : null;

            // the journal is read only while it describes every change since
            // this index's last full walk: started by that walk, still live,
            // over the same array, and accounting for the array's length (a
            // caller that edits the array without signalling changes that first)
            if (liveWorld !== null && sameArray && g.built && liveWorld._journalLive === true
                && g.journalWorld === liveWorld && g.journalGen === liveWorld._memberGen
                && liveWorld._journalLength === n && liveWorld._journalForeignWalks === Common._foreignWalks
                && movers.length <= n * Detector._journalMoverShare) {
                Detector._classifyFromJournal(g, liveWorld, n);
                g.journalUsed = true;
                staticCount = g.staticCount;
                if (g.classifyDirty) {
                    staticDirty = true;
                }
            } else {
                Detector._classifyWalk(g, bodies, n, world, liveWorld);
                staticCount = g.staticCount;
                if (g.classifyDirty) {
                    staticDirty = true;
                }
            }

            // A change in static count means a static body was added to or
            // removed from the world (windowing add/remove, etc.). A removal is
            // invisible to every per-body flag above, so the count is what says
            // the indexed list needs re-scanning for departures.
            if (staticCount !== g.indexedStaticCount) {
                staticDirty = true;
            }
        }

        // 2) maintain the persistent static index.
        //
        // The index is only ever WRONG for the statics that actually changed:
        // one released tile, one windowed add or remove. Everything else sits in
        // exactly the buckets it was already in. So instead of clearing every
        // bucket and re-filling it from a full walk of the world, apply just the
        // difference.
        //
        // This is what makes destruction affordable. A full rebuild is triggered
        // by ANY static membership change, which on a page being actively
        // destroyed is EVERY step, and it costs a cell-span computation plus a
        // hash and probe of a table far larger than L2 for every (static, cell)
        // pair in the world. Measured on `bench/profile-churn.js` it was 781us
        // of a 1427us step, with the answer already correct for 99.8% of the
        // statics it recomputed.
        //
        // Bucket contents stay in `detector.bodies` order (the order a full
        // rebuild produces, and so the candidate emission order the simulation
        // is baselined on) because inserts go in at the position given by
        // `_sWorldIndex`, restamped for every body by the classification walk
        // above whenever the body array can have changed. Removals splice, which
        // preserves the order of what remains.
        if (staticDirty && !g.built) {
            Detector._staticIndexRebuild(g, bodies, n, cellSize, invCell, maxCells);
        } else if (staticDirty) {
            Detector._staticIndexApply(g, cellSize, invCell, maxCells, staticCount);

            // Safety net. `indexed` should hold exactly the bodies counted as
            // static by the walk above; if the two ever disagree, some mutation
            // reached the world by a route this pass cannot see, so fall back to
            // a full rebuild on the next step rather than querying a wrong
            // index (which would silently drop collisions).
            if (g.indexed.length !== staticCount) {
                g.built = false;
            }
        }

        g.indexedStaticCount = staticCount;

        // 3) rebuild the mover cell index each step.
        //
        // Unlike the static index this one is thrown away and rebuilt every
        // step, so its per-insert cost is paid ~movers * cellsPerMover times per
        // step and was one of the larger single costs in a calm scene. It is
        // therefore NOT a hash table: the movers of one step occupy a small
        // bounding rectangle of cells, so the index is a flat array of per-cell
        // chain heads addressed by plain arithmetic, with the chains threaded
        // through parallel entry arrays. No hashing, no probing, no per-cell
        // bucket array, no touched-key list.
        //
        // The rectangle is masked to a power of two per axis and capped, so a
        // pathological spread (one mover at the top of a very long page, one at
        // the bottom) wraps into the same slots instead of allocating a huge
        // grid; each entry therefore carries its packed cell key and chain walks
        // verify it. Unwrapped (the normal case) every check passes.
        var dOver = g.dOver,
            moversLength = movers.length;
        dOver.length = 0;

        // pass A: per-mover cell span, oversize classification, and the bounding
        // cell rectangle. Spans are kept in a scratch array so the insert pass
        // does not recompute them. It must hold floats: a body with NaN bounds
        // yields a NaN span whose cell loops iterate zero times, and coercing
        // that to an integer would index real cells instead.
        var dSpan = g.dSpan,
            mBounds = g.mBounds,
            mStamp = g.mStamp,
            mOver = g.mOver,
            mEntry = g.mEntry;

        if (dSpan.length < moversLength * 4) {
            var moverCapacity = (moversLength + 16) * 2;
            dSpan = g.dSpan = new Float64Array(moverCapacity * 4);
            // the movers' own bounds, flattened. The generation pass below runs
            // every bounds test against these instead of chasing
            // body -> bounds -> min / max, so it reaches a body object only for
            // a candidate that survives its bounds test
            mBounds = g.mBounds = new Float64Array(moverCapacity * 4);
            // the visited stamp that dedups a mover reached through several
            // cells, likewise flattened off the body
            mStamp = g.mStamp = new Int32Array(moverCapacity);
            mOver = g.mOver = new Int32Array(moverCapacity);
            mEntry = g.mEntry = new Int32Array(moverCapacity);
        }

        var minCx = Infinity,
            maxCx = -Infinity,
            minCy = Infinity,
            maxCy = -Infinity,
            dEntryCount = 0,
            mIns,
            spanBase;

        for (mIns = 0; mIns < moversLength; mIns++) {
            var dbody = movers[mIns],
                dBounds = dbody.bounds,
                dMinX = dBounds.min.x,
                dMaxX = dBounds.max.x,
                dMinY = dBounds.min.y,
                dMaxY = dBounds.max.y,
                dcx0 = Math.floor(dMinX * invCell),
                dcx1 = Math.floor(dMaxX * invCell),
                dcy0 = Math.floor(dMinY * invCell),
                dcy1 = Math.floor(dMaxY * invCell);

            spanBase = mIns * 4;
            mBounds[spanBase] = dMinX;
            mBounds[spanBase + 1] = dMaxX;
            mBounds[spanBase + 2] = dMinY;
            mBounds[spanBase + 3] = dMaxY;
            mStamp[mIns] = -1;

            if ((dcx1 - dcx0 + 1) * (dcy1 - dcy0 + 1) > maxCells) {
                mOver[mIns] = 1;
                dOver.push(mIns);
                // an unwalkable span, so the insert pass skips this mover
                // without having to re-read the oversize flag
                dSpan[spanBase] = NaN;
                continue;
            }

            mOver[mIns] = 0;
            dSpan[spanBase] = dcx0;
            dSpan[spanBase + 1] = dcx1;
            dSpan[spanBase + 2] = dcy0;
            dSpan[spanBase + 3] = dcy1;

            // NaN spans fail every comparison, so they neither widen the
            // rectangle nor contribute entries, matching the zero cell loops
            // they produce below
            if (dcx0 < minCx) { minCx = dcx0; }
            if (dcx1 > maxCx) { maxCx = dcx1; }
            if (dcy0 < minCy) { minCy = dcy0; }
            if (dcy1 > maxCy) { maxCy = dcy1; }
            dEntryCount += (dcx1 - dcx0 + 1) * (dcy1 - dcy0 + 1) || 0;
        }

        var dShiftW = 0,
            dShiftH = 0;

        if (dEntryCount > 0) {
            dShiftW = Detector._cellShiftFor(maxCx - minCx + 1);
            dShiftH = Detector._cellShiftFor(maxCy - minCy + 1);
        }

        var dMaskW = (1 << dShiftW) - 1,
            dMaskH = (1 << dShiftH) - 1,
            dSlots = 1 << (dShiftW + dShiftH),
            dHead = g.dHead,
            dNext = g.dNext,
            dItem = g.dItem,
            dKeyArr = g.dKey;

        if (dHead.length < dSlots) {
            dHead = g.dHead = new Int32Array(dSlots);
        }
        if (dNext.length < dEntryCount) {
            var entryCapacity = (dEntryCount + 64) * 2;
            dNext = g.dNext = new Int32Array(entryCapacity);
            dItem = g.dItem = new Int32Array(entryCapacity);
            dKeyArr = g.dKey = new Float64Array(entryCapacity);
        }

        dHead.fill(-1, 0, dSlots);

        // pass B: insert. Walked in DESCENDING mover order and pushed onto the
        // front of each chain, so a chain reads back in ascending mover order,
        // exactly the order the previous per-cell bucket arrays produced.
        var dEntry = 0;
        for (mIns = moversLength - 1; mIns >= 0; mIns--) {
            // where this mover's own entries start. A mover with a NaN span
            // contributes none, and the value is then never read (its cell
            // loops iterate zero times in the generation pass too)
            mEntry[mIns] = dEntry;
            spanBase = mIns * 4;
            var iSpanCx1 = dSpan[spanBase + 1],
                iSpanCy0 = dSpan[spanBase + 2],
                iSpanCy1 = dSpan[spanBase + 3];

            for (cx = dSpan[spanBase]; cx <= iSpanCx1; cx++) {
                var iKeyX = (cx + keyOffset) * keyStride,
                    iSlotX = (cx - minCx) & dMaskW;

                for (cy = iSpanCy0; cy <= iSpanCy1; cy++) {
                    var iSlot = iSlotX | (((cy - minCy) & dMaskH) << dShiftW);
                    dKeyArr[dEntry] = iKeyX + (cy + keyOffset);
                    // the mover's ORDINAL in `movers`, not its index in
                    // `bodies`: it addresses the flat mover arrays directly and
                    // orders identically (movers are collected in body order)
                    dItem[dEntry] = mIns;
                    dNext[dEntry] = dHead[iSlot];
                    dHead[iSlot] = dEntry;
                    dEntry++;
                }
            }
        }

        // 3b) invalidate the static-candidate cache of every mover standing over
        // a cell whose static occupants changed this step.
        //
        // A mover's cached list is built from exactly the cells in its span, so
        // the mover index just built is the reverse lookup this needs: resolve
        // each reported cell to its chain and stamp the movers on it. A cell
        // outside the movers' bounding rectangle wraps to some slot whose
        // entries all fail the key test, which is the right answer (no mover
        // covers it). Typical cost is a few dozen cells against the thousands of
        // list rebuilds the old global epoch bump forced.
        //
        // `changedCells` is filled BY INDEX and bounded by `g.changedCount`,
        // never by its length, so a step's reports are dropped by zeroing the
        // count: no length store (a StoreIC call in TurboFan) and no backing
        // store dropped and regrown every step. Slots past the count are stale
        // cells from a longer earlier step and nothing reads them
        var changedCells = g.changedCells,
            changedLength = g.changedCount;

        if (changedLength > 0) {
            if (dEntryCount > 0) {
                for (i = 0; i < changedLength; i += 2) {
                    var dcx = changedCells[i],
                        dcy = changedCells[i + 1],
                        dcKey = (dcx + keyOffset) * keyStride + (dcy + keyOffset),
                        dcSlot = ((dcx - minCx) & dMaskW) | (((dcy - minCy) & dMaskH) << dShiftW);

                    for (var dce = dHead[dcSlot]; dce !== -1; dce = dNext[dce]) {
                        if (dKeyArr[dce] !== dcKey) {
                            continue;
                        }
                        movers[dItem[dce]]._scEpoch = -1;
                    }
                }
            }

            g.changedCount = 0;
        }

        // 4) candidate generation: each mover is an outer body; pair it with
        // static occupants (mover-static) and higher-index movers (mover-mover).
        // No static body is ever an outer, so static-static is never generated.
        var sOver = g.sOver,
            sOverLength = sOver.length,
            sFlat = g.sFlat,
            dOverLength = dOver.length;

        // sFlat is read by nothing but the oversized-mover branch below, so it
        // is built here, only on a step that actually has one, rather than
        // being kept in sync by every index change. It is built in body order,
        // which is the order the branch needs
        if (dOverLength > 0 && !g.sFlatValid) {
            sFlat.length = 0;
            for (i = 0; i < n; i++) {
                var flatBody = bodies[i];
                if (flatBody._sIndexed && flatBody._sBuckets.length > 0) {
                    sFlat.push(flatBody);
                }
            }
            g.sFlatValid = true;
        }

        var sFlatLength = sFlat.length;
        for (var mGen = 0; mGen < moversLength; mGen++) {
            var mBoundsBase = mGen * 4,
                m = movers[mGen],
                mMinX = mBounds[mBoundsBase], mMaxX = mBounds[mBoundsBase + 1],
                mMinY = mBounds[mBoundsBase + 2], mMaxY = mBounds[mBoundsBase + 3],
                mFilter = m.collisionFilter,
                // a moved static promoted to a mover must still not generate
                // static-static pairs (the sweep skips those)
                mStatic = m.isStatic || m.isSleeping,
                localStamp = ++gridStamp,
                mIsOver = mOver[mGen] === 1;

            // Oversized mover: its bounds span more than maxCells cells, so it
            // was NOT inserted into the dynamic index. Walking its full cell
            // span here is unbounded: a runaway-velocity body can span thousands
            // of cells, and an Infinity bound makes `mcx1`/`mcy1` Infinity, so
            // `for (cx = ...; cx <= Infinity; cx++)` would never terminate (the
            // hang this guard fixes). Scan the flat
            // static list for normal statics it overlaps, a bounded O(statics).
            // Normal movers find THIS body via their own oversized pass (it is
            // in dOver); oversized statics/movers are handled by the sOver/dOver
            // passes below. Skipped for a static (promoted, moving) mover, since
            // static-static never resolves.
            if (mIsOver) {
                // not in the mover index, so the sweep above cannot reach it;
                // drop its cached list rather than let it survive an oversized
                // spell and validate against cells that changed meanwhile
                m._scEpoch = -1;

                if (!mStatic) {
                    for (var sfi = 0; sfi < sFlatLength; sfi++) {
                        var fsBody = sFlat[sfi],
                            fsBounds = fsBody.bounds;
                        if (mMaxX < fsBounds.min.x || mMinX > fsBounds.max.x || mMaxY < fsBounds.min.y || mMinY > fsBounds.max.y) {
                            continue;
                        }
                        if (!canCollide(mFilter, fsBody.collisionFilter)) {
                            continue;
                        }
                        collisionIndex = Detector._testPair(m, fsBody, pairs, collisions, collisionIndex);
                    }
                }
            } else {
                // the insert pass already floored this mover's cell span from
                // the same flattened bounds, so reuse it (an oversized mover's
                // span slots are unusable, but that branch never reads them)
                var mcx0 = dSpan[mBoundsBase],
                    mcx1 = dSpan[mBoundsBase + 1],
                    mcy0 = dSpan[mBoundsBase + 2],
                    mcy1 = dSpan[mBoundsBase + 3];

                // static-candidate cache: while this mover's cell span, its
                // static-vs-static role and the static index are all
                // unchanged, the set of statics sharing cells with it cannot
                // change either, so the per-cell static bucket lookups are
                // skipped and the cached candidate list is re-tested directly
                // (bounds overlap and collision filters are still evaluated
                // every step). Resting debris hits this cache nearly every
                // step; a fast mover (bullet) misses and pays the same fused
                // walk it always did. Emission order is movers-then-statics on
                // BOTH paths so a cache hit and a miss produce the identical
                // collision order (a cache-state-dependent order would fork
                // trajectories).
                var scList = m._scList,
                    scValid = scList !== null
                        && m._scEpoch === g.epoch
                        && m._scStatic === mStatic
                        && m._scCx0 === mcx0 && m._scCx1 === mcx1
                        && m._scCy0 === mcy0 && m._scCy1 === mcy1;

                if (!scValid) {
                    if (scList === null) {
                        scList = m._scList = [];
                    }
                    // popped, not `scList.length = 0`: TurboFan compiles a length
                    // store to a StoreIC call, and a store to zero also drops the
                    // backing store the pushes below then regrow. The inlined pop
                    // loop has neither. 291 of these per storm step
                    while (scList.length !== 0) {
                        scList.pop();
                    }
                    if (m._scBounds === null) {
                        m._scBounds = new Float64Array(32);
                    }
                    m._scEpoch = g.epoch;
                    m._scStatic = mStatic;
                    m._scCx0 = mcx0;
                    m._scCx1 = mcx1;
                    m._scCy0 = mcy0;
                    m._scCy1 = mcy1;
                }

                // this mover's own chain entry for the cell about to be walked.
                // Pass B inserted movers in DESCENDING ordinal and head-pushed,
                // so a chain reads back ASCENDING and everything at or before
                // this mover's own entry is rejected by the `dj <= mGen` test
                // below. Starting at `dNext[own]` therefore emits the identical
                // subsequence in the identical order while skipping the whole
                // lower prefix, and costs no `dHead` load: the mover's entries
                // are contiguous from `mEntry[mGen]` in the same cell order
                // this loop walks
                var selfEntry = mEntry[mGen];

                for (cx = mcx0; cx <= mcx1; cx++) {
                    var mKeyX = (cx + keyOffset) * keyStride,
                        mCxOffset = cx + keyOffset;

                    for (cy = mcy0; cy <= mcy1; cy++) {
                        var cyOffset = cy + keyOffset;
                        key = mKeyX + cyOffset;

                        // collect static candidates on a cache miss (tested
                        // from the list after the walk; skipped when the outer
                        // body is itself static, as a promoted moving static vs
                        // the static page is static-static and never resolves).
                        // The cell hash is only needed here, so a mover holding
                        // its cached list pays no hashing at all
                        if (!scValid) {
                            var sOcc = mStatic ? undefined : cellGet(g.sTable, key, cellHash(mCxOffset, cyOffset));
                            if (sOcc !== undefined) {
                                for (var si = 0; si < sOcc.length; si++) {
                                    var sBody = sOcc[si];
                                    if (sBody._gsStamp === localStamp) {
                                        continue;
                                    }
                                    sBody._gsStamp = localStamp;

                                    // capture the candidate's bounds alongside
                                    // it, so the per-step test loop never
                                    // dereferences a static that misses
                                    var scSlot = scList.length * 4,
                                        scStore = m._scBounds;
                                    if (scStore.length <= scSlot) {
                                        scStore = m._scBounds = Detector._growFloats(scStore, scSlot + 4);
                                    }
                                    var scSourceBounds = sBody.bounds;
                                    scStore[scSlot] = scSourceBounds.min.x;
                                    scStore[scSlot + 1] = scSourceBounds.max.x;
                                    scStore[scSlot + 2] = scSourceBounds.min.y;
                                    scStore[scSlot + 3] = scSourceBounds.max.y;
                                    scList.push(sBody);
                                }
                            }
                        }

                        // mover vs mover (dedup by ordinal, so emit only once).
                        // Chain entries carry their cell key because the slot
                        // address wraps on a pathological mover spread. Every
                        // test here reads the flat mover arrays, so a candidate
                        // that fails costs no body access at all
                        for (var dgi = dNext[selfEntry++]; dgi !== -1; dgi = dNext[dgi]) {
                            if (dKeyArr[dgi] !== key) {
                                continue;
                            }
                            var dj = dItem[dgi];
                            // still required: two of THIS mover's own cells can
                            // alias to one slot, putting an earlier entry of its
                            // own ahead of it in the chain
                            if (dj <= mGen || mStamp[dj] === localStamp) {
                                continue;
                            }
                            mStamp[dj] = localStamp;
                            var dBoundsBase = dj * 4;
                            if (mMaxX < mBounds[dBoundsBase] || mMinX > mBounds[dBoundsBase + 1]
                                || mMaxY < mBounds[dBoundsBase + 2] || mMinY > mBounds[dBoundsBase + 3]) {
                                continue;
                            }
                            var dBody = movers[dj];
                            if (mStatic && (dBody.isStatic || dBody.isSleeping)) {
                                continue;
                            }
                            if (!canCollide(mFilter, dBody.collisionFilter)) {
                                continue;
                            }
                            collisionIndex = Detector._testPair(m, dBody, pairs, collisions, collisionIndex);
                        }
                    }
                }

                // mover vs its static candidates (cached or just collected).
                // Their bounds were captured with the list: a body in the static
                // index does not move (a setter that moves one promotes it to
                // a mover instead, see Body._promoteIfIndexed), so
                // the test runs off contiguous memory and only a candidate that
                // overlaps is ever dereferenced
                if (!mStatic) {
                    var scBounds = m._scBounds;
                    for (var sci = 0, scListLength = scList.length; sci < scListLength; sci++) {
                        var scBase = sci * 4;
                        if (mMaxX < scBounds[scBase] || mMinX > scBounds[scBase + 1]
                            || mMaxY < scBounds[scBase + 2] || mMinY > scBounds[scBase + 3]) {
                            continue;
                        }
                        var scBody = scList[sci];
                        if (!canCollide(mFilter, scBody.collisionFilter)) {
                            continue;
                        }
                        collisionIndex = Detector._testPair(m, scBody, pairs, collisions, collisionIndex);
                    }
                }
            }

            // mover vs oversized statics (walls, big images: not bucketed).
            // Skipped when the outer body is itself static (static-static).
            if (!mStatic) {
                for (var soi = 0; soi < sOverLength; soi++) {
                    var soBody = sOver[soi],
                        soBounds = soBody.bounds;
                    if (mMaxX < soBounds.min.x || mMinX > soBounds.max.x || mMaxY < soBounds.min.y || mMinY > soBounds.max.y) {
                        continue;
                    }
                    if (!canCollide(mFilter, soBody.collisionFilter)) {
                        continue;
                    }
                    collisionIndex = Detector._testPair(m, soBody, pairs, collisions, collisionIndex);
                }
            }

            // mover vs oversized movers. The ordinal dedup (emit an
            // oversized-oversized pair once, from the lower-ordinal outer)
            // applies ONLY when the outer is itself oversized. A non-oversized
            // mover never appears in dOver, so the pair is emitted here exactly
            // once with it as the outer; without the oversize guard a normal
            // mover ordered after an oversized one would wrongly skip the pair,
            // and it would be lost entirely (the oversized mover no longer
            // cell-walks to find normal movers).
            for (var doi = 0; doi < dOverLength; doi++) {
                var doOrdinal = dOver[doi];
                if (mIsOver && doOrdinal <= mGen) {
                    continue;
                }
                var doBoundsBase = doOrdinal * 4;
                if (mMaxX < mBounds[doBoundsBase] || mMinX > mBounds[doBoundsBase + 1]
                    || mMaxY < mBounds[doBoundsBase + 2] || mMinY > mBounds[doBoundsBase + 3]) {
                    continue;
                }
                var doBody = movers[doOrdinal];
                if (mStatic && (doBody.isStatic || doBody.isSleeping)) {
                    continue;
                }
                if (!canCollide(mFilter, doBody.collisionFilter)) {
                    continue;
                }
                collisionIndex = Detector._testPair(m, doBody, pairs, collisions, collisionIndex);
            }
        }

        if (collisions.length !== collisionIndex) {
            collisions.length = collisionIndex;
        }

        return collisions;
    };

    /**
     * Returns `true` if both supplied collision filters will allow a collision to occur.
     * See `body.collisionFilter` for more information.
     * @method canCollide
     * @param {} filterA
     * @param {} filterB
     * @return {bool} `true` if collision can occur
     */
    Detector.canCollide = function(filterA, filterB) {
        if (filterA.group === filterB.group && filterA.group !== 0)
            return filterA.group > 0;

        return (filterA.mask & filterB.category) !== 0 && (filterB.mask & filterA.category) !== 0;
    };

    /**
     * The comparison function used in the broadphase algorithm.
     * Returns the signed delta of the bodies bounds on the x-axis.
     * @private
     * @method _sortCompare
     * @param {body} bodyA
     * @param {body} bodyB
     * @return {number} The signed delta used for sorting
     */
    Detector._compareBoundsX = function(bodyA, bodyB) {
        return bodyA.bounds.min.x - bodyB.bounds.min.x;
    };

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * The array of `Matter.Body` between which the detector finds collisions.
     * 
     * _Note:_ The order of bodies in this array _is not fixed_ and will be continually managed by the detector.
     * @property bodies
     * @type body[]
     * @default []
     */

    /**
     * The array of `Matter.Collision` found in the last call to `Detector.collisions` on this detector.
     * @property collisions
     * @type collision[]
     * @default []
     */

    /**
     * Optional. A `Matter.Pairs` object from which previous collision objects may be reused. Intended for internal `Matter.Engine` usage.
     * @property pairs
     * @type {pairs|null}
     * @default null
     */

    /**
     * The broadphase `Detector.collisions` runs: `'sweep'` (upstream's sort and
     * sweep) or `'grid'` (a static index, for worlds of mostly static bodies).
     * Anything else throws. It may be changed between updates.
     * @property broadphase
     * @type string
     * @default 'sweep'
     */

    /**
     * The grid broadphase's cell size in pixels: a finite number above `0`,
     * tuned to roughly the typical static body's size. It may be changed
     * between updates, which rebuilds the grid's static index once.
     * @property cellSize
     * @type number
     * @default 32
     */

})();
