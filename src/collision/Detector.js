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
     * `_gridDynamic`, `_sc*`) is pre-declared in `Body.create`; see the rule
     * there before introducing a new one (a lazily added field splits body
     * hidden classes and slows the whole engine, measured 1.3-4.8x).
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
                // _createCellTable) whose used list holds BUCKET REFERENCES so
                // the rebuild reset loop clears them without any table lookups
                sTable: Detector._createCellTable(), sUsed: [], sOver: [], sFlat: [],
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
                // static-index build epoch: bumped on every rebuild so each
                // mover's cached static-candidate list can be validated cheaply
                epoch: 0,
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

            for (i = 0; i < n; i++) {
                var body = bodies[i],
                    // a body tagged `_gridDynamic` (e.g. an inner-scroll surface
                    // that is static but moves each tick) is treated as a mover so
                    // it is re-bucketed every step and never goes stale in the
                    // static index
                    isStaticNow = (body.isStatic || body.isSleeping) && body._gridDynamic !== true;
                if (body._sPrev !== isStaticNow) {
                    body._sPrev = isStaticNow;
                    staticDirty = true;
                }
                if (isStaticNow) {
                    staticCount++;
                } else {
                    movers.push(i);
                }
            }

            g.staticCount = staticCount;
        }

        // A change in static count means a static body was added to or removed
        // from the world (windowing add/remove, etc.). The _sPrev check cannot
        // see a body that has LEFT detector.bodies, so this count guards against
        // a stale index entry for a removed static. Dynamic churn (bullets,
        // debris, shatter children) does not change the static count, so normal
        // play does not force a needless rebuild.
        if (staticCount !== g.indexedStaticCount) {
            staticDirty = true;
        }

        // 2) (re)build the persistent static index only when membership changed
        if (staticDirty) {
            var sTable = g.sTable,
                sUsed = g.sUsed,
                sUsedLength = sUsed.length;
            for (u = 0; u < sUsedLength; u++) {
                sUsed[u].length = 0;
            }
            sUsed.length = 0;
            g.sOver.length = 0;
            // flat list of non-oversized statics, rebuilt with the index. An
            // oversized mover scans this instead of walking its (unbounded)
            // cell span; see the candidate-generation pass below.
            g.sFlat.length = 0;
            for (i = 0; i < n; i++) {
                var sb = bodies[i];
                if (!(sb.isStatic || sb.isSleeping) || sb._gridDynamic === true) {
                    continue;
                }
                var sBounds = sb.bounds,
                    scx0 = Math.floor(sBounds.min.x * invCell),
                    scx1 = Math.floor(sBounds.max.x * invCell),
                    scy0 = Math.floor(sBounds.min.y * invCell),
                    scy1 = Math.floor(sBounds.max.y * invCell);
                if ((scx1 - scx0 + 1) * (scy1 - scy0 + 1) > maxCells) {
                    g.sOver.push(sb);
                    continue;
                }
                g.sFlat.push(sb);
                for (cx = scx0; cx <= scx1; cx++) {
                    var sKeyX = (cx + keyOffset) * keyStride,
                        sCxOffset = cx + keyOffset;
                    for (cy = scy0; cy <= scy1; cy++) {
                        key = sKeyX + (cy + keyOffset);
                        var sBucket = cellGetOrCreate(sTable, key, cellHash(sCxOffset, cy + keyOffset));
                        if (sBucket.length === 0) {
                            sUsed.push(sBucket);
                        }
                        // store the body reference, not its index into
                        // detector.bodies: the static index persists across
                        // steps, but Matter re-slices detector.bodies on
                        // world.isModified (add/remove of ANY body), which
                        // reorders/shrinks the array. The dirty-check only
                        // rebuilds on static-membership changes, so a stored
                        // index can dangle into a shifted array (or past its
                        // end) and read undefined. A body ref stays valid.
                        sBucket.push(sb);
                    }
                }
            }
            g.built = true;
            g.indexedStaticCount = staticCount;
            g.epoch += 1;
        }

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
        var dSpan = g.dSpan;
        if (dSpan.length < moversLength * 4) {
            dSpan = g.dSpan = new Float64Array((moversLength * 4 + 64) * 2);
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
                dcx0 = Math.floor(dBounds.min.x * invCell),
                dcx1 = Math.floor(dBounds.max.x * invCell),
                dcy0 = Math.floor(dBounds.min.y * invCell),
                dcy1 = Math.floor(dBounds.max.y * invCell);

            spanBase = mIns * 4;

            if ((dcx1 - dcx0 + 1) * (dcy1 - dcy0 + 1) > maxCells) {
                dbody._ovD = true;
                dOver.push(di);
                // an unwalkable span, so the insert pass skips this mover
                // without having to re-read `_ovD`
                dSpan[spanBase] = NaN;
                continue;
            }

            dbody._ovD = false;
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
            spanBase = mIns * 4;
            var iSpanCx1 = dSpan[spanBase + 1],
                iSpanCy0 = dSpan[spanBase + 2],
                iSpanCy1 = dSpan[spanBase + 3],
                iMover = movers[mIns];

            for (cx = dSpan[spanBase]; cx <= iSpanCx1; cx++) {
                var iKeyX = (cx + keyOffset) * keyStride,
                    iSlotX = (cx - minCx) & dMaskW;

                for (cy = iSpanCy0; cy <= iSpanCy1; cy++) {
                    var iSlot = iSlotX | (((cy - minCy) & dMaskH) << dShiftW);
                    dKeyArr[dEntry] = iKeyX + (cy + keyOffset);
                    dItem[dEntry] = iMover;
                    dNext[dEntry] = dHead[iSlot];
                    dHead[iSlot] = dEntry;
                    dEntry++;
                }
            }
        }

        // 4) candidate generation: each mover is an outer body; pair it with
        // static occupants (mover-static) and higher-index movers (mover-mover).
        // No static body is ever an outer, so static-static is never generated.
        var sOver = g.sOver,
            sOverLength = sOver.length,
            sFlat = g.sFlat,
            sFlatLength = sFlat.length,
            dOverLength = dOver.length;
        for (var mGen = 0; mGen < moversLength; mGen++) {
            var ii = movers[mGen],
                m = bodies[ii],
                mBounds = m.bounds,
                mMinX = mBounds.min.x, mMaxX = mBounds.max.x,
                mMinY = mBounds.min.y, mMaxY = mBounds.max.y,
                mFilter = m.collisionFilter,
                // a tagged moving-static surface is a mover here but must still
                // not generate static-static pairs (the sweep skips those)
                mStatic = m.isStatic || m.isSleeping,
                localStamp = ++g.stamp,
                mcx0 = Math.floor(mMinX * invCell),
                mcx1 = Math.floor(mMaxX * invCell),
                mcy0 = Math.floor(mMinY * invCell),
                mcy1 = Math.floor(mMaxY * invCell);

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
            if (m._ovD) {
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
                    m._scEpoch = g.epoch;
                    m._scStatic = mStatic;
                    m._scCx0 = mcx0;
                    m._scCx1 = mcx1;
                    m._scCy0 = mcy0;
                    m._scCy1 = mcy1;
                }

                for (cx = mcx0; cx <= mcx1; cx++) {
                    var mKeyX = (cx + keyOffset) * keyStride,
                        mCxOffset = cx + keyOffset,
                        mSlotX = (cx - minCx) & dMaskW;

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
                                    scList.push(sBody);
                                }
                            }
                        }

                        // mover vs mover (dedup by index, so emit only once).
                        // Chain entries carry their cell key because the slot
                        // address wraps on a pathological mover spread
                        for (var dgi = dHead[mSlotX | (((cy - minCy) & dMaskH) << dShiftW)]; dgi !== -1; dgi = dNext[dgi]) {
                            if (dKeyArr[dgi] !== key) {
                                continue;
                            }
                            var dj = dItem[dgi];
                            if (dj <= ii) {
                                continue;
                            }
                            var dBody = bodies[dj];
                            if (dBody._gsStamp === localStamp) {
                                continue;
                            }
                            dBody._gsStamp = localStamp;
                            if (mStatic && (dBody.isStatic || dBody.isSleeping)) {
                                continue;
                            }
                            var dbnd = dBody.bounds;
                            if (mMaxX < dbnd.min.x || mMinX > dbnd.max.x || mMaxY < dbnd.min.y || mMinY > dbnd.max.y) {
                                continue;
                            }
                            if (!canCollide(mFilter, dBody.collisionFilter)) {
                                continue;
                            }
                            collisionIndex = Detector._testPair(m, dBody, pairs, collisions, collisionIndex);
                        }
                    }
                }

                // mover vs its static candidates (cached or just collected)
                if (!mStatic) {
                    for (var sci = 0, scListLength = scList.length; sci < scListLength; sci++) {
                        var scBody = scList[sci],
                            scBounds = scBody.bounds;
                        if (mMaxX < scBounds.min.x || mMinX > scBounds.max.x || mMaxY < scBounds.min.y || mMinY > scBounds.max.y) {
                            continue;
                        }
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

            // mover vs oversized movers. The index dedup (emit an
            // oversized-oversized pair once, from the lower-index outer) applies
            // ONLY when the outer is itself oversized. A non-oversized mover
            // never appears in dOver, so the pair is emitted here exactly once
            // with it as the outer; without the `m._ovD` guard a normal mover
            // whose index is higher than an oversized mover's would wrongly skip
            // the pair, and it would be lost entirely (the oversized mover no
            // longer cell-walks to find normal movers).
            for (var doi = 0; doi < dOverLength; doi++) {
                var doIdx = dOver[doi];
                if (m._ovD && doIdx <= ii) {
                    continue;
                }
                var doBody = bodies[doIdx],
                    doBounds = doBody.bounds;
                if (mStatic && (doBody.isStatic || doBody.isSleeping)) {
                    continue;
                }
                if (mMaxX < doBounds.min.x || mMinX > doBounds.max.x || mMaxY < doBounds.min.y || mMinY > doBounds.max.y) {
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
