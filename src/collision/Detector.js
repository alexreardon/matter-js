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
     * Static-index uniform-grid broadphase. The win over `_collisionsGrid`: the
     * static field (intact page) is bucketed ONCE and reused; only dynamic
     * bodies (movers) are re-bucketed each step, and only movers drive candidate
     * generation. Static-static pairs are never visited (no resolved collision
     * can be static-static), so a calm page costs ~O(movers) per step instead of
     * O(all bodies) like the sweep. Re-baseline: emission order differs from the
     * sweep but is deterministic.
     *
     * The static index is rebuilt only when the static membership changes
     * (detected per body via a cached `_sPrev` flag), e.g. on release. A static
     * body that MOVES while staying static (inner-scroll surfaces) is not handled
     * here and must be treated as a mover by the caller; the page-destroyer
     * integration does this.
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
                sBuckets: new Map(), sUsed: [], sOver: [],
                dBuckets: new Map(), dUsed: [], dOver: [],
                movers: [], stamp: 1, built: false, indexedStaticCount: -1
            };
        }

        // 1) classify bodies into movers (dynamic) vs static, detecting any
        // change to the static set (release, add, remove) so the static index
        // is only rebuilt when it actually changed
        var movers = g.movers;
        movers.length = 0;
        var staticDirty = !g.built;
        var staticCount = 0;
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
            var sBuckets = g.sBuckets,
                sUsed = g.sUsed,
                sUsedLength = sUsed.length;
            for (u = 0; u < sUsedLength; u++) {
                var staleS = sBuckets.get(sUsed[u]);
                if (staleS !== undefined) {
                    staleS.length = 0;
                }
            }
            sUsed.length = 0;
            g.sOver.length = 0;
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
                    g.sOver.push(i);
                    continue;
                }
                for (cx = scx0; cx <= scx1; cx++) {
                    var sKeyX = (cx + keyOffset) * keyStride;
                    for (cy = scy0; cy <= scy1; cy++) {
                        key = sKeyX + (cy + keyOffset);
                        var sBucket = sBuckets.get(key);
                        if (sBucket === undefined) {
                            sBucket = [];
                            sBuckets.set(key, sBucket);
                        }
                        if (sBucket.length === 0) {
                            sUsed.push(key);
                        }
                        sBucket.push(i);
                    }
                }
            }
            g.built = true;
            g.indexedStaticCount = staticCount;
        }

        // 3) rebuild the dynamic index each step from the movers
        var dBuckets = g.dBuckets,
            dUsed = g.dUsed,
            dOver = g.dOver,
            dUsedLength = dUsed.length,
            moversLength = movers.length;
        for (u = 0; u < dUsedLength; u++) {
            var staleD = dBuckets.get(dUsed[u]);
            if (staleD !== undefined) {
                staleD.length = 0;
            }
        }
        dUsed.length = 0;
        dOver.length = 0;
        for (var mIns = 0; mIns < moversLength; mIns++) {
            var di = movers[mIns],
                dbody = bodies[di],
                dBounds = dbody.bounds,
                dcx0 = Math.floor(dBounds.min.x * invCell),
                dcx1 = Math.floor(dBounds.max.x * invCell),
                dcy0 = Math.floor(dBounds.min.y * invCell),
                dcy1 = Math.floor(dBounds.max.y * invCell);
            if ((dcx1 - dcx0 + 1) * (dcy1 - dcy0 + 1) > maxCells) {
                dbody._ovD = true;
                dOver.push(di);
                continue;
            }
            dbody._ovD = false;
            for (cx = dcx0; cx <= dcx1; cx++) {
                var dKeyX = (cx + keyOffset) * keyStride;
                for (cy = dcy0; cy <= dcy1; cy++) {
                    key = dKeyX + (cy + keyOffset);
                    var dBucket = dBuckets.get(key);
                    if (dBucket === undefined) {
                        dBucket = [];
                        dBuckets.set(key, dBucket);
                    }
                    if (dBucket.length === 0) {
                        dUsed.push(key);
                    }
                    dBucket.push(di);
                }
            }
        }

        // 4) candidate generation: each mover is an outer body; pair it with
        // static occupants (mover-static) and higher-index movers (mover-mover).
        // No static body is ever an outer, so static-static is never generated.
        var sOver = g.sOver,
            sOverLength = sOver.length,
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

            for (cx = mcx0; cx <= mcx1; cx++) {
                var mKeyX = (cx + keyOffset) * keyStride;
                for (cy = mcy0; cy <= mcy1; cy++) {
                    key = mKeyX + (cy + keyOffset);

                    // mover vs static (skipped when the outer body is itself
                    // static: a tagged moving surface vs the static page is
                    // static-static and never resolves)
                    var sOcc = mStatic ? undefined : g.sBuckets.get(key);
                    if (sOcc !== undefined) {
                        for (var si = 0; si < sOcc.length; si++) {
                            var sj = sOcc[si],
                                sBody = bodies[sj];
                            if (sBody._gsStamp === localStamp) {
                                continue;
                            }
                            sBody._gsStamp = localStamp;
                            var sbnd = sBody.bounds;
                            if (mMaxX < sbnd.min.x || mMinX > sbnd.max.x || mMaxY < sbnd.min.y || mMinY > sbnd.max.y) {
                                continue;
                            }
                            if (!canCollide(mFilter, sBody.collisionFilter)) {
                                continue;
                            }
                            collisionIndex = Detector._testPair(m, sBody, pairs, collisions, collisionIndex);
                        }
                    }

                    // mover vs mover (dedup by index, so emit only once)
                    var dOcc = dBuckets.get(key);
                    if (dOcc !== undefined) {
                        for (var dgi = 0; dgi < dOcc.length; dgi++) {
                            var dj = dOcc[dgi];
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
            }

            // mover vs oversized statics (walls, big images: not bucketed).
            // Skipped when the outer body is itself static (static-static).
            if (!mStatic) {
                for (var soi = 0; soi < sOverLength; soi++) {
                    var soBody = bodies[sOver[soi]],
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

            // mover vs oversized movers (dedup by index)
            for (var doi = 0; doi < dOverLength; doi++) {
                var doIdx = dOver[doi];
                if (doIdx <= ii) {
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
