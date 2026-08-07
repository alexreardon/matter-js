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
     * Creates a new collision detector.
     * @method create
     * @param {} options
     * @return {detector} A new collision detector
     */
    Detector.create = function(options) {
        var defaults = {
            bodies: [],
            collisions: [],
            pairs: null
        };

        return Common.extend(defaults, options);
    };

    /**
     * Sets the list of bodies in the detector.
     * @method setBodies
     * @param {detector} detector
     * @param {body[]} bodies
     */
    Detector.setBodies = function(detector, bodies) {
        detector.bodies = bodies.slice(0);
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
     * Tags a body as grid-dynamic, meaning the `gridStatic` broadphase treats it
     * as a mover (re-indexed every step) even while `isStatic` is `true`. This is
     * what a static body that MOVES (an inner-scroll surface tracking the page)
     * needs, since the persistent static index would otherwise hold it at its
     * old position.
     *
     * Use this rather than assigning `body._gridDynamic` directly: the flag
     * changes the body's moving-vs-resting role, so it has to invalidate the
     * cached mover lists (see `Common._bodyStaticEpoch`). Repeat calls with the
     * flag already set are free, so a caller may re-tag every step.
     * @method setGridDynamic
     * @param {body} body
     * @param {bool} [isGridDynamic=true]
     */
    Detector.setGridDynamic = function(body, isGridDynamic) {
        var flag = isGridDynamic !== false;

        if (body._gridDynamic === flag) {
            return;
        }

        body._gridDynamic = flag;
        Common._bodyStaticEpoch++;
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
     * Default broadphase mode. `'sweep'` is the classic sort-and-sweep (the
     * baseline). `'grid'` uses a uniform spatial grid that stays robust on the
     * dense, column-aligned static fields page-destroyer produces. The grid
     * emits collisions in a different but still deterministic order, so it is a
     * re-baseline of the simulation, not bit-identical to the sweep.
     */
    Detector._mode = 'sweep';

    /**
     * Uniform grid cell size in pixels (grid mode only). Tunable per workload.
     */
    Detector._cellSize = 32;

    /**
     * Finds all collisions among `detector.bodies` using the configured
     * broadphase mode (`Detector._mode`).
     * @method collisions
     * @param {detector} detector
     * @return {collision[]} collisions
     */
    Detector.collisions = function(detector) {
        if (Detector._mode === 'gridStatic') {
            return Detector._collisionsGridStatic(detector);
        }

        if (Detector._mode === 'grid') {
            return Detector._collisionsGrid(detector);
        }

        return Detector._collisionsSweep(detector);
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
     * Uniform-grid broadphase. Buckets every body into fixed-size cells, then
     * generates candidate pairs only from shared cells. Alloc-light: bucket
     * arrays and the touched-key list are reused across frames; dedup uses a
     * per-body visited stamp; a body spanning more than `maxCells` cells goes in
     * an oversized overflow list tested against all others. Deterministic
     * emission order (outer body-array order, then cell scan order).
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
            cellSize = Detector._cellSize || 32,
            invCell = 1 / cellSize;

        var grid = detector._grid;
        if (!grid) {
            grid = detector._grid = {
                buckets: new Map(),
                usedKeys: [],
                oversized: [],
                stamp: 1
            };
        }

        var buckets = grid.buckets,
            usedKeys = grid.usedKeys,
            oversized = grid.oversized,
            usedKeysLength = usedKeys.length,
            i, cx, cy, u;

        // reset frame: empty only the buckets touched last frame (keep the array
        // objects in the Map for reuse, so steady state does not allocate)
        for (u = 0; u < usedKeysLength; u++) {
            var stale = buckets.get(usedKeys[u]);
            if (stale !== undefined) {
                stale.length = 0;
            }
        }
        usedKeys.length = 0;
        oversized.length = 0;

        // a body spanning more than this many cells is tested against all others
        var maxCells = 24,
            // integer cell-key packing; offset keeps negative cells non-negative.
            // Safe while |cell index| < 2^20 (coords within ~+/-16M px at 16px).
            keyOffset = 0x100000,
            keyStride = 0x200000;

        // insert pass
        for (i = 0; i < n; i++) {
            var body = bodies[i],
                bounds = body.bounds,
                cx0 = Math.floor(bounds.min.x * invCell),
                cx1 = Math.floor(bounds.max.x * invCell),
                cy0 = Math.floor(bounds.min.y * invCell),
                cy1 = Math.floor(bounds.max.y * invCell);

            if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > maxCells) {
                body._ov = true;
                oversized.push(i);
                continue;
            }
            body._ov = false;

            for (cx = cx0; cx <= cx1; cx++) {
                var keyX = (cx + keyOffset) * keyStride;
                for (cy = cy0; cy <= cy1; cy++) {
                    var key = keyX + (cy + keyOffset),
                        bucket = buckets.get(key);

                    if (bucket === undefined) {
                        bucket = [];
                        buckets.set(key, bucket);
                    }
                    if (bucket.length === 0) {
                        usedKeys.push(key);
                    }
                    bucket.push(i);
                }
            }
        }

        // candidate generation: each body pairs with higher-index bodies sharing
        // a cell (the visited stamp dedups bodies found via multiple cells)
        for (i = 0; i < n; i++) {
            var bodyA = bodies[i];
            if (bodyA._ov) {
                continue;
            }

            var boundsA = bodyA.bounds,
                aMinX = boundsA.min.x, aMaxX = boundsA.max.x,
                aMinY = boundsA.min.y, aMaxY = boundsA.max.y,
                aStatic = bodyA.isStatic || bodyA.isSleeping,
                filterA = bodyA.collisionFilter,
                localStamp = ++grid.stamp,
                acx0 = Math.floor(aMinX * invCell),
                acx1 = Math.floor(aMaxX * invCell),
                acy0 = Math.floor(aMinY * invCell),
                acy1 = Math.floor(aMaxY * invCell);

            for (cx = acx0; cx <= acx1; cx++) {
                var akX = (cx + keyOffset) * keyStride;
                for (cy = acy0; cy <= acy1; cy++) {
                    var occupants = buckets.get(akX + (cy + keyOffset));
                    if (occupants === undefined) {
                        continue;
                    }

                    for (var oi = 0; oi < occupants.length; oi++) {
                        var j = occupants[oi];
                        if (j <= i) {
                            continue;
                        }

                        var bodyB = bodies[j];
                        if (bodyB._stamp === localStamp) {
                            continue;
                        }
                        bodyB._stamp = localStamp;

                        if (aStatic && (bodyB.isStatic || bodyB.isSleeping)) {
                            continue;
                        }

                        var boundsB = bodyB.bounds;
                        if (aMaxX < boundsB.min.x || aMinX > boundsB.max.x
                            || aMaxY < boundsB.min.y || aMinY > boundsB.max.y) {
                            continue;
                        }

                        if (!canCollide(filterA, bodyB.collisionFilter)) {
                            continue;
                        }

                        collisionIndex = Detector._testPair(bodyA, bodyB, pairs, collisions, collisionIndex);
                    }
                }
            }
        }

        // oversized pass: each oversized body tested against all others (deduped
        // oversized-vs-oversized by index). Few of these, so O(oversized * n)
        var oversizedLength = oversized.length;
        for (var oa = 0; oa < oversizedLength; oa++) {
            var ia = oversized[oa],
                ovA = bodies[ia],
                ovBoundsA = ovA.bounds,
                ovStaticA = ovA.isStatic || ovA.isSleeping,
                ovFilterA = ovA.collisionFilter;

            for (var jb = 0; jb < n; jb++) {
                if (jb === ia) {
                    continue;
                }

                var ovB = bodies[jb];
                if (ovB._ov && jb < ia) {
                    continue;
                }
                if (ovStaticA && (ovB.isStatic || ovB.isSleeping)) {
                    continue;
                }

                var ovBoundsB = ovB.bounds;
                if (ovBoundsA.max.x < ovBoundsB.min.x || ovBoundsA.min.x > ovBoundsB.max.x
                    || ovBoundsA.max.y < ovBoundsB.min.y || ovBoundsA.min.y > ovBoundsB.max.y) {
                    continue;
                }
                if (!canCollide(ovFilterA, ovB.collisionFilter)) {
                    continue;
                }

                collisionIndex = Detector._testPair(ovA, ovB, pairs, collisions, collisionIndex);
            }
        }

        if (collisions.length !== collisionIndex) {
            collisions.length = collisionIndex;
        }

        return collisions;
    };

    /**
     * Creates an open-addressing hash table mapping packed cell keys to bucket
     * arrays, replacing `Map` for the gridStatic cell indexes. Linear probing
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
            vals: new Array(2048),
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
     * `_collisionsGridStatic`): `1 << _maxCellShift` cells, so the flat index is
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
            newVals = new Array(newCapacity),
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
            buckets.length = 0;
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
            var changed = g.changedCells;
            for (cx = cx0; cx <= cx1; cx++) {
                for (cy = cy0; cy <= cy1; cy++) {
                    changed.push(cx, cy);
                }
            }
        }

        for (cx = cx0; cx <= cx1; cx++) {
            var keyX = (cx + keyOffset) * keyStride,
                cxOffset = cx + keyOffset;

            for (cy = cy0; cy <= cy1; cy++) {
                // store the body reference, not its index into detector.bodies:
                // Matter re-slices that array on world.isModified, which
                // reorders and shrinks it, so a stored index can dangle
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
            ucx,
            ucy,
            ucx1 = body._sCx1,
            ucy1 = body._sCy1;

        for (ucx = body._sCx0; ucx <= ucx1; ucx++) {
            for (ucy = body._sCy0; ucy <= ucy1; ucy++) {
                changed.push(ucx, ucy);
            }
        }

        for (i = 0; i < buckets.length; i++) {
            var bucket = buckets[i];
            at = bucket.indexOf(body);
            if (at !== -1) {
                bucket.splice(at, 1);
            }
        }

        buckets.length = 0;
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
        g.changedCells.length = 0;

        for (i = 0; i < n; i++) {
            var body = bodies[i];

            body._sIndexed = false;

            if (!(body.isStatic || body.isSleeping) || body._gridDynamic === true) {
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
     * Static-index uniform-grid broadphase. The win over `_collisionsGrid`: the
     * static field (intact page) is bucketed ONCE and reused; only dynamic
     * bodies (movers) are re-bucketed each step, and only movers drive candidate
     * generation. Static-static pairs are never visited (no resolved collision
     * can be static-static), so a calm page costs ~O(movers) per step instead of
     * O(all bodies) like the sweep. Re-baseline: emission order differs from the
     * sweep but is deterministic.
     *
     * The static index is rebuilt only when the static membership changes
     * (detected per body via a cached `_sPrev` flag plus a `staticCount` guard),
     * e.g. on release. A static body that MOVES while staying static (inner-scroll
     * surfaces) is not handled here and must be treated as a mover by the caller;
     * the page-destroyer integration does this.
     *
     * The static buckets (and the oversized-static list) hold body REFERENCES,
     * not indices into `detector.bodies`. The index outlives a step, but Matter
     * re-slices `detector.bodies` from `Composite.allBodies` on `world.isModified`
     * (any add/remove), which reorders and shrinks that array. Since the rebuild
     * fires only on static-membership changes, a stored index could point at the
     * wrong body or past the array end on a later step; a reference cannot.
     *
     * Every per-body field this path writes (`_sPrev`, `_gsStamp`, `_ovD`,
     * `_gridDynamic`, `_sc*`, `_s*` index membership) is pre-declared in
     * `Body.create`; see the rule there before introducing a new one (a lazily
     * added field splits body hidden classes and slows the whole engine,
     * measured 1.3-4.8x).
     *
     * Because that state lives on the BODY rather than on the detector, a body
     * belongs to one gridStatic detector at a time. Sharing bodies between two
     * engines was already unsupported here (the candidate cache and the
     * broadphase stamps have the same constraint); the static index membership
     * simply makes it explicit.
     * @private
     * @method _collisionsGridStatic
     * @param {detector} detector
     * @return {collision[]} collisions
     */
    Detector._collisionsGridStatic = function(detector) {
        var bodies = detector.bodies,
            n = bodies.length,
            pairs = detector.pairs,
            canCollide = Detector.canCollide,
            collisions = detector.collisions,
            collisionIndex = 0,
            cellSize = Detector._cellSize || 32,
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
                // sFlat is the flat list of non-oversized statics that only an
                // OVERSIZED MOVER reads, so it is rebuilt lazily, on the rare
                // steps one exists, instead of maintained on every change
                sFlatValid: false,
                movers: [], stamp: 1, built: false, indexedStaticCount: -1,
                // classification cache: the movers list and static count are
                // only recomputed when the body set or any body's
                // moving-vs-resting role actually changed
                classifyBodies: null, classifyLength: -1, classifyEpoch: -1,
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
                // consumed once per step by the invalidation sweep below
                epoch: 0, changedCells: [],
                cellSize: 0
            };
        }

        var cellHash = Detector._cellHash,
            cellGet = Detector._cellGet,
            cellGetOrCreate = Detector._cellGetOrCreate;

        // a cell-size change invalidates every bucket key, including the
        // persistent static index built under the old size; force a rebuild
        // (without this, live cell-size tuning queries stale static buckets
        // and silently misses mover-vs-static collisions)
        if (g.cellSize !== cellSize) {
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
        // mover set only moves when the body set changes (add / remove, which
        // hands the detector a NEW array via `Detector.setBodies`) or when some
        // body's moving-vs-resting role flips (`Body.setStatic`,
        // `Sleeping.set`, `Detector.setGridDynamic`, each of which bumps the
        // epoch). So cache the result and rebuild only on those signals.
        //
        // The body-set signal is the identity and length of `detector.bodies`
        // rather than a flag set by `setBodies`, so a caller that assigns the
        // array directly (rather than through the setter) is still correct:
        // the cached movers list holds INDICES into it, and a stale index can
        // read past the end of a shrunken array.
        var movers = g.movers,
            staticDirty = !g.built,
            staticCount = g.staticCount,
            classifyEpoch = Common._bodyStaticEpoch;

        if (g.classifyBodies !== bodies || g.classifyLength !== n || g.classifyEpoch !== classifyEpoch) {
            g.classifyBodies = bodies;
            g.classifyLength = n;
            g.classifyEpoch = classifyEpoch;
            movers.length = 0;
            staticCount = 0;

            // this walk is also where the static index learns what changed, so
            // it stamps every body it sees. A body still in the index whose
            // stamp is stale on the next pass has LEFT the world, which is the
            // one kind of change no per-body flag can report
            var walkStamp = ++g.walkStamp,
                pendingAdd = g.pendingAdd;
            pendingAdd.length = 0;

            for (i = 0; i < n; i++) {
                var body = bodies[i],
                    // a body tagged `_gridDynamic` (e.g. an inner-scroll surface
                    // that is static but moves each tick) is treated as a mover so
                    // it is re-bucketed every step and never goes stale in the
                    // static index
                    isStaticNow = (body.isStatic || body.isSleeping) && body._gridDynamic !== true;

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
                    movers.push(i);
                    if (body._sIndexed) {
                        // released into a mover: unindex it here, so the apply
                        // pass below never has to walk the membership list
                        // looking for it
                        Detector._staticIndexRemove(g, body);
                        staticDirty = true;
                    }
                }
            }

            g.staticCount = staticCount;

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
            var di = movers[mIns],
                dbody = bodies[di],
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
                dbody._ovD = true;
                mOver[mIns] = 1;
                dOver.push(mIns);
                // an unwalkable span, so the insert pass skips this mover
                // without having to re-read the oversize flag
                dSpan[spanBase] = NaN;
                continue;
            }

            dbody._ovD = false;
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
        var changedCells = g.changedCells,
            changedLength = changedCells.length;

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
                        bodies[movers[dItem[dce]]]._scEpoch = -1;
                    }
                }
            }

            changedCells.length = 0;
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
                m = bodies[movers[mGen]],
                mMinX = mBounds[mBoundsBase], mMaxX = mBounds[mBoundsBase + 1],
                mMinY = mBounds[mBoundsBase + 2], mMaxY = mBounds[mBoundsBase + 3],
                mFilter = m.collisionFilter,
                // a tagged moving-static surface is a mover here but must still
                // not generate static-static pairs (the sweep skips those)
                mStatic = m.isStatic || m.isSleeping,
                localStamp = ++g.stamp,
                mIsOver = mOver[mGen] === 1;

            // Oversized mover: its bounds span more than maxCells cells, so it
            // was NOT inserted into the dynamic index. Walking its full cell
            // span here is unbounded: a runaway-velocity body can span thousands
            // of cells, and an Infinity bound makes `mcx1`/`mcy1` Infinity, so
            // `for (cx = ...; cx <= Infinity; cx++)` would never terminate (the
            // hang this guard fixes). Mirror _collisionsGrid: scan the flat
            // static list for normal statics it overlaps, a bounded O(statics).
            // Normal movers find THIS body via their own oversized pass (it is
            // in dOver); oversized statics/movers are handled by the sOver/dOver
            // passes below. Skipped for a static (tagged moving) mover, since
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
                    scList.length = 0;
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
                        // body is itself static, as a tagged moving surface vs
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
                            var dBody = bodies[movers[dj]];
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
                // index does not move (one that does must be tagged with
                // Detector.setGridDynamic, which makes it a mover instead), so
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
                var doBody = bodies[movers[doOrdinal]];
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

})();
