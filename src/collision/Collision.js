/**
* The `Matter.Collision` module contains methods for detecting collisions between a given pair of bodies.
*
* For efficient detection between a list of bodies, see `Matter.Detector` and `Matter.Query`.
*
* See `Matter.Engine` for collision events.
*
* @class Collision
*/

var Collision = {};

module.exports = Collision;

var Vertices = require('../geometry/Vertices');
var Pair = require('./Pair');

(function() {
    var _supports = [];

    // Below this depth margin (world units) two box corners are treated as
    // LEVEL along a support direction, and `Collision._findSupportsBox` makes
    // the general search's own comparisons instead of reading the answer off
    // the axes. It must sit far above the float error of those comparisons
    // (~1e-11 at page coordinates) and far below any real corner separation
    // (a box is at least a pixel on a side).
    var _boxSupportTolerance = 1e-6;

    var _overlapAB = {
        overlap: 0,
        axis: null
    };

    var _overlapBA = {
        overlap: 0,
        axis: null
    };

    /**
     * Creates a new collision record.
     * @method create
     * @param {body} bodyA The first body part represented by the collision record
     * @param {body} bodyB The second body part represented by the collision record
     * @return {collision} A new collision record
     */
    Collision.create = function(bodyA, bodyB) {
        return { 
            pair: null,
            collided: false,
            bodyA: bodyA,
            bodyB: bodyB,
            parentA: bodyA.parent,
            parentB: bodyB.parent,
            depth: 0,
            normal: { x: 0, y: 0 },
            supports: [null, null],
            supportCount: 0
        };
    };

    /**
     * Detect collision between two bodies.
     * @method collides
     * @param {body} bodyA
     * @param {body} bodyB
     * @param {pairs} [pairs] Optionally reuse collision records from existing pairs.
     * @return {collision|null} A collision record if detected, otherwise null
     */
    Collision.collides = function(bodyA, bodyB, pairs) {
        // both sides tagged by Body._updateBoxTag: the fused box-box test and
        // the closed-form support search replace the general polygon ones
        var isBoxPair = bodyA._boxCorners >= 0 && bodyB._boxCorners >= 0;

        if (isBoxPair) {
            Collision._overlapBoxes(_overlapAB, _overlapBA, bodyA, bodyB);

            // `_overlapBA` is not written when `_overlapAB` already separates
            if (_overlapAB.overlap <= 0 || _overlapBA.overlap <= 0) {
                return null;
            }
        } else {
            Collision._overlapAxes(_overlapAB, bodyA, bodyB.vertices, bodyA.axes);

            if (_overlapAB.overlap <= 0) {
                return null;
            }

            Collision._overlapAxes(_overlapBA, bodyB, bodyA.vertices, bodyB.axes);

            if (_overlapBA.overlap <= 0) {
                return null;
            }
        }

        // Reuse collision records for gc efficiency. The live pair's record is
        // probed out of the pairs structure's open-addressing record table
        // (see Pairs.create), which is authoritative: a key hit always means
        // the pair is live and the value is the record the rest of this
        // function overwrites in full. `Pairs.update` maintains the table, so
        // a miss means these bodies have no live pair and a fresh record is
        // built for them.
        var collision = null,
            pairId = 0;

        if (pairs) {
            var idA = bodyA.id,
                idB = bodyB.id;

            pairId = idA < idB ? idA * Pair._idShift + idB : idB * Pair._idShift + idA;

            var recordKeys = pairs._recordKeys,
                recordMask = pairs._recordMask,
                recordSlot = Pair.hash(idA, idB) & recordMask,
                recordKey;

            // linear probe to the first empty slot; deletion shifts entries
            // back rather than leaving tombstones, so every key walked is live
            while ((recordKey = recordKeys[recordSlot]) !== 0) {
                if (recordKey === pairId) {
                    collision = pairs._recordValues[recordSlot];
                    break;
                }

                recordSlot = (recordSlot + 1) & recordMask;
            }
        }

        if (collision === null) {
            collision = Collision.create(bodyA, bodyB);
            collision.collided = true;
            collision.bodyA = bodyA.id < bodyB.id ? bodyA : bodyB;
            collision.bodyB = bodyA.id < bodyB.id ? bodyB : bodyA;
            collision.parentA = collision.bodyA.parent;
            collision.parentB = collision.bodyB.parent;
        }

        bodyA = collision.bodyA;
        bodyB = collision.bodyB;

        var minOverlap;

        if (_overlapAB.overlap < _overlapBA.overlap) {
            minOverlap = _overlapAB;
        } else {
            minOverlap = _overlapBA;
        }

        var normal = collision.normal,
            supports = collision.supports,
            depth = minOverlap.overlap,
            minAxis = minOverlap.axis,
            normalX = minAxis.x,
            normalY = minAxis.y,
            deltaX = bodyB.position.x - bodyA.position.x,
            deltaY = bodyB.position.y - bodyA.position.y;

        // ensure normal is facing away from bodyA
        if (normalX * deltaX + normalY * deltaY >= 0) {
            normalX = -normalX;
            normalY = -normalY;
        }

        normal.x = normalX;
        normal.y = normalY;

        collision.depth = depth;

        // find support points, there is always either exactly one or two
        var supportsB = isBoxPair
                ? Collision._findSupportsBox(bodyA, bodyB, normal, 1)
                : Collision._findSupports(bodyA, bodyB, normal, 1),
            supportCount = 0;

        // find the supports from bodyB that are inside bodyA. Both points are
        // always tested against the same vertex set, so one fused walk shares
        // every edge's loads and deltas between them
        var containsB = Collision._containsPair(bodyA.vertices, supportsB[0], supportsB[1]);

        if ((containsB & 1) !== 0) {
            supports[supportCount++] = supportsB[0];
        }

        if ((containsB & 2) !== 0) {
            supports[supportCount++] = supportsB[1];
        }

        // find the supports from bodyA that are inside bodyB
        if (supportCount < 2) {
            var supportsA = isBoxPair
                ? Collision._findSupportsBox(bodyB, bodyA, normal, -1)
                : Collision._findSupports(bodyB, bodyA, normal, -1);

            if (supportCount === 0) {
                // nothing the first test can do takes the count to 2, so the
                // second test always runs and the fused walk is free here too
                var containsA = Collision._containsPair(bodyB.vertices, supportsA[0], supportsA[1]);

                if ((containsA & 1) !== 0) {
                    supports[supportCount++] = supportsA[0];
                }

                if ((containsA & 2) !== 0) {
                    supports[supportCount++] = supportsA[1];
                }
            } else {
                // entering with one support already, the second test can be
                // skipped outright, which beats sharing the walk with it
                if (Vertices.contains(bodyB.vertices, supportsA[0])) {
                    supports[supportCount++] = supportsA[0];
                }

                if (supportCount < 2 && Vertices.contains(bodyB.vertices, supportsA[1])) {
                    supports[supportCount++] = supportsA[1];
                }
            }
        }

        // account for the edge case of overlapping but no vertex containment
        if (supportCount === 0) {
            supports[supportCount++] = supportsB[0];
        }

        // update support count
        collision.supportCount = supportCount;

        return collision;
    };

    /**
     * The separating-axis test for two boxes (both tagged by
     * `Body._updateBoxTag`), fused over their four axes.
     *
     * The general test projects every corner of the other body onto each axis.
     * For a box that projection is closed form: centred on the body's
     * `position`, with radius `half0 * |axis . axis0| + half1 * |axis . axis1|`.
     * So the overlap on axis `i` of A is
     * `halfA_i + (halfB0 * |R[i][0]| + halfB1 * |R[i][1]|) - |delta . axisA_i|`,
     * where `R[i][j] = axisA_i . axisB_j` is shared by all four tests, and no
     * vertex is read at all.
     *
     * Writes the same `{ overlap, axis }` results two `_overlapAxes` calls
     * write: the same axis objects, the same tie rule (the lower axis index
     * wins a tie), and the same early out (`resultBA` is not written when
     * `resultAB` already separates). The overlap itself differs from the
     * general reduction in its last bits, because it is computed from
     * `position` and the half extents rather than from the vertices, so this is
     * a RE-BASELINE and not a bit-identical rewrite.
     *
     * A box never reads or fills the `_selfProjection` memo on this path; the
     * memo stays for every pair with a side that is not a box.
     * @method _overlapBoxes
     * @private
     * @param {object} resultAB B projected onto the axes of A
     * @param {object} resultBA A projected onto the axes of B
     * @param {body} bodyA
     * @param {body} bodyB
     */
    Collision._overlapBoxes = function(resultAB, resultBA, bodyA, bodyB) {
        var axesA = bodyA.axes,
            axesB = bodyB.axes,
            axisA0 = axesA[0],
            axisA1 = axesA[1],
            axisB0 = axesB[0],
            axisB1 = axesB[1],
            axisA0X = axisA0.x,
            axisA0Y = axisA0.y,
            axisA1X = axisA1.x,
            axisA1Y = axisA1.y,
            axisB0X = axisB0.x,
            axisB0Y = axisB0.y,
            axisB1X = axisB1.x,
            axisB1Y = axisB1.y,
            halfA0 = bodyA._boxHalf0,
            halfA1 = bodyA._boxHalf1,
            halfB0 = bodyB._boxHalf0,
            halfB1 = bodyB._boxHalf1,
            deltaX = bodyB.position.x - bodyA.position.x,
            deltaY = bodyB.position.y - bodyA.position.y,
            r00 = Math.abs(axisA0X * axisB0X + axisA0Y * axisB0Y),
            r01 = Math.abs(axisA0X * axisB1X + axisA0Y * axisB1Y),
            r10 = Math.abs(axisA1X * axisB0X + axisA1Y * axisB0Y),
            r11 = Math.abs(axisA1X * axisB1X + axisA1Y * axisB1Y),
            overlap0 = halfA0 + (halfB0 * r00 + halfB1 * r01) - Math.abs(deltaX * axisA0X + deltaY * axisA0Y),
            overlap1;

        if (overlap0 <= 0) {
            resultAB.axis = axisA0;
            resultAB.overlap = overlap0;
            return;
        }

        overlap1 = halfA1 + (halfB0 * r10 + halfB1 * r11) - Math.abs(deltaX * axisA1X + deltaY * axisA1Y);

        if (overlap1 < overlap0) {
            resultAB.axis = axisA1;
            resultAB.overlap = overlap1;

            if (overlap1 <= 0) {
                return;
            }
        } else {
            resultAB.axis = axisA0;
            resultAB.overlap = overlap0;
        }

        overlap0 = halfB0 + (halfA0 * r00 + halfA1 * r10) - Math.abs(deltaX * axisB0X + deltaY * axisB0Y);

        if (overlap0 <= 0) {
            resultBA.axis = axisB0;
            resultBA.overlap = overlap0;
            return;
        }

        overlap1 = halfB1 + (halfA0 * r01 + halfA1 * r11) - Math.abs(deltaX * axisB1X + deltaY * axisB1Y);

        if (overlap1 < overlap0) {
            resultBA.axis = axisB1;
            resultBA.overlap = overlap1;
        } else {
            resultBA.axis = axisB0;
            resultBA.overlap = overlap0;
        }
    };

    /**
     * Project a body's own vertices onto its own axes, memoised on the body.
     *
     * Both `Collision._overlapAxes` calls in `Collision.collides` pass the body
     * that OWNS the axes as the A side, so this reduction is pair-independent:
     * without a memo it is recomputed once per pair the body takes part in,
     * every step, and again next step even for a static whose vertices have not
     * moved.
     *
     * The result is packed flat into `body._sp` as
     * `[min0, max0, min1, max1, ...]`, one pair per axis, and is valid while
     * `body._spValid` is `true`. Every site that moves a vertex or changes the
     * axes clears that flag.
     * @method _selfProjection
     * @private
     * @param {body} body
     * @return {number[]} The filled `body._sp`
     */
    Collision._selfProjection = function(body) {
        var vertices = body.vertices,
            verticesLength = vertices.length,
            axes = body.axes,
            axesLength = axes.length,
            sp = body._sp,
            i;

        // `new Array(n)` on its own is HOLEY and reads slow, so fill it
        if (!sp || sp.length !== axesLength * 2) {
            sp = body._sp = new Array(axesLength * 2).fill(0);
        }

        // both branches below seed from vertex 0 and use the same comparison
        // structure and operand order the inline projections used, so the
        // memoised values are bit-identical to computing them in place
        if (verticesLength === 4) {
            var v0 = vertices[0], v1 = vertices[1], v2 = vertices[2], v3 = vertices[3],
                v0x = v0.x, v0y = v0.y, v1x = v1.x, v1y = v1.y,
                v2x = v2.x, v2y = v2.y, v3x = v3.x, v3y = v3.y;

            for (i = 0; i < axesLength; i++) {
                var quadAxis = axes[i],
                    quadAxisX = quadAxis.x,
                    quadAxisY = quadAxis.y,
                    q0 = v0x * quadAxisX + v0y * quadAxisY,
                    q1 = v1x * quadAxisX + v1y * quadAxisY,
                    q2 = v2x * quadAxisX + v2y * quadAxisY,
                    q3 = v3x * quadAxisX + v3y * quadAxisY,
                    quadMin = q0, quadMax = q0;

                if (q1 > quadMax) { quadMax = q1; } else if (q1 < quadMin) { quadMin = q1; }
                if (q2 > quadMax) { quadMax = q2; } else if (q2 < quadMin) { quadMin = q2; }
                if (q3 > quadMax) { quadMax = q3; } else if (q3 < quadMin) { quadMin = q3; }

                sp[i * 2] = quadMin;
                sp[i * 2 + 1] = quadMax;
            }

            body._spValid = true;
            return sp;
        }

        var firstX = vertices[0].x,
            firstY = vertices[0].y,
            dot,
            j;

        for (i = 0; i < axesLength; i++) {
            var selfAxis = axes[i],
                selfAxisX = selfAxis.x,
                selfAxisY = selfAxis.y,
                min = firstX * selfAxisX + firstY * selfAxisY,
                max = min;

            for (j = 1; j < verticesLength; j += 1) {
                dot = vertices[j].x * selfAxisX + vertices[j].y * selfAxisY;

                if (dot > max) {
                    max = dot;
                } else if (dot < min) {
                    min = dot;
                }
            }

            sp[i * 2] = min;
            sp[i * 2 + 1] = max;
        }

        body._spValid = true;
        return sp;
    };

    /**
     * Find the overlap between a body and a set of vertices along the body's axes.
     *
     * `bodyA` must be the body that owns `axes`: its side of the projection is
     * read from the `Collision._selfProjection` memo, which is indexed by the
     * body's own axis order.
     * @method _overlapAxes
     * @private
     * @param {object} result
     * @param {body} bodyA
     * @param {vertices} verticesB
     * @param {axes} axes
     */
    Collision._overlapAxes = function(result, bodyA, verticesB, axes) {
        var sp = bodyA._spValid ? bodyA._sp : Collision._selfProjection(bodyA),
            verticesBLength = verticesB.length,
            axesLength = axes.length,
            overlapMin = Number.MAX_VALUE,
            overlapAxisNumber = 0,
            overlap,
            overlapAB,
            overlapBA,
            dot,
            i,
            j;

        // unrolled fast path for the box/quad common case (the other body has
        // four vertices). min/max of a fixed set is order-independent, so this
        // produces bit-identical projections to the general loop below.
        if (verticesBLength === 4) {
            var b0 = verticesB[0], b1 = verticesB[1], b2 = verticesB[2], b3 = verticesB[3],
                b0x = b0.x, b0y = b0.y, b1x = b1.x, b1y = b1.y,
                b2x = b2.x, b2y = b2.y, b3x = b3.x, b3y = b3.y;

            for (i = 0; i < axesLength; i++) {
                var qAxis = axes[i],
                    qAxisX = qAxis.x,
                    qAxisY = qAxis.y,
                    qMinA = sp[i * 2],
                    qMaxA = sp[i * 2 + 1],
                    qb0 = b0x * qAxisX + b0y * qAxisY,
                    qb1 = b1x * qAxisX + b1y * qAxisY,
                    qb2 = b2x * qAxisX + b2y * qAxisY,
                    qb3 = b3x * qAxisX + b3y * qAxisY,
                    qMinB = qb0, qMaxB = qb0;

                if (qb1 > qMaxB) { qMaxB = qb1; } else if (qb1 < qMinB) { qMinB = qb1; }
                if (qb2 > qMaxB) { qMaxB = qb2; } else if (qb2 < qMinB) { qMinB = qb2; }
                if (qb3 > qMaxB) { qMaxB = qb3; } else if (qb3 < qMinB) { qMinB = qb3; }

                overlapAB = qMaxA - qMinB;
                overlapBA = qMaxB - qMinA;
                overlap = overlapAB < overlapBA ? overlapAB : overlapBA;

                if (overlap < overlapMin) {
                    overlapMin = overlap;
                    overlapAxisNumber = i;

                    if (overlap <= 0) {
                        break;
                    }
                }
            }

            result.axis = axes[overlapAxisNumber];
            result.overlap = overlapMin;
            return;
        }

        var verticesBX = verticesB[0].x,
            verticesBY = verticesB[0].y;

        for (i = 0; i < axesLength; i++) {
            var axis = axes[i],
                axisX = axis.x,
                axisY = axis.y,
                minA = sp[i * 2],
                maxA = sp[i * 2 + 1],
                minB = verticesBX * axisX + verticesBY * axisY,
                maxB = minB;

            for (j = 1; j < verticesBLength; j += 1) {
                dot = verticesB[j].x * axisX + verticesB[j].y * axisY;

                if (dot > maxB) {
                    maxB = dot;
                } else if (dot < minB) {
                    minB = dot;
                }
            }

            overlapAB = maxA - minB;
            overlapBA = maxB - minA;
            overlap = overlapAB < overlapBA ? overlapAB : overlapBA;

            if (overlap < overlapMin) {
                overlapMin = overlap;
                overlapAxisNumber = i;

                if (overlap <= 0) {
                    // can not be intersecting
                    break;
                }
            }
        }

        result.axis = axes[overlapAxisNumber];
        result.overlap = overlapMin;
    };

    /**
     * Finds supporting vertices given two bodies along a given direction using hill-climbing.
     * @method _findSupports
     * @private
     * @param {body} bodyA
     * @param {body} bodyB
     * @param {vector} normal
     * @param {number} direction
     * @return [vector]
     */
    Collision._findSupports = function(bodyA, bodyB, normal, direction) {
        var vertices = bodyB.vertices,
            verticesLength = vertices.length,
            bodyAPositionX = bodyA.position.x,
            bodyAPositionY = bodyA.position.y,
            normalX = normal.x * direction,
            normalY = normal.y * direction,
            vertexA = vertices[0],
            vertexB = vertexA,
            nearestDistance = normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y),
            vertexC,
            distance,
            j;

        // find deepest vertex relative to the axis
        for (j = 1; j < verticesLength; j += 1) {
            vertexB = vertices[j];
            distance = normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y);

            // convex hill-climbing
            if (distance < nearestDistance) {
                nearestDistance = distance;
                vertexA = vertexB;
            }
        }

        // adjacent vertices, wrapping at the ends (cheaper than a modulo and
        // selects the identical indices the modulo did)
        var vertexAIndex = vertexA.index,
            prevIndex = vertexAIndex === 0 ? verticesLength - 1 : vertexAIndex - 1,
            nextIndex = vertexAIndex + 1 === verticesLength ? 0 : vertexAIndex + 1;

        // measure next vertex
        vertexC = vertices[prevIndex];
        nearestDistance = normalX * (bodyAPositionX - vertexC.x) + normalY * (bodyAPositionY - vertexC.y);

        // compare with previous vertex
        vertexB = vertices[nextIndex];
        if (normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y) < nearestDistance) {
            _supports[0] = vertexA;
            _supports[1] = vertexB;

            return _supports;
        }

        _supports[0] = vertexA;
        _supports[1] = vertexC;

        return _supports;
    };

    /**
     * The support search for a box (tagged by `Body._updateBoxTag`) in closed
     * form. It returns the SAME two vertex objects, in the SAME order, as
     * `Collision._findSupports`, so contacts, their identity matching in
     * `Pair.update`, and the solver's contact order are all unchanged.
     *
     * Along the search direction `n`, each side of axis `k` moves a corner
     * `half_k * (n . axis_k)` deeper, so the deepest corner is on the positive
     * side of both dot products, and its deeper neighbour is across the axis
     * whose side costs less depth (`margin_k = half_k * |n . axis_k|`). The
     * vertex a side pair names is read from `_boxCorners`.
     *
     * That reading is trusted only where the hill-climb's own float
     * comparisons cannot disagree with it. A margin under
     * `_boxSupportTolerance` is a tie the general search settles by
     * rounding and by vertex index, so there this makes the general search's
     * own comparisons on the two candidates alone. That is every contact whose
     * normal is this box's own face normal, where the two corners of the face
     * are level along it.
     * @method _findSupportsBox
     * @private
     * @param {body} bodyA
     * @param {body} bodyB
     * @param {vector} normal
     * @param {number} direction
     * @return [vector]
     */
    Collision._findSupportsBox = function(bodyA, bodyB, normal, direction) {
        var axes = bodyB.axes,
            axis0 = axes[0],
            axis1 = axes[1],
            normalX = normal.x * direction,
            normalY = normal.y * direction,
            dot0 = normalX * axis0.x + normalY * axis0.y,
            dot1 = normalX * axis1.x + normalY * axis1.y,
            margin0 = bodyB._boxHalf0 * (dot0 < 0 ? -dot0 : dot0),
            margin1 = bodyB._boxHalf1 * (dot1 < 0 ? -dot1 : dot1),
            tolerance = _boxSupportTolerance,
            corners = bodyB._boxCorners,
            side0 = dot0 > 0 ? 1 : 0,
            side1 = dot1 > 0 ? 2 : 0,
            vertices = bodyB.vertices,
            deepestIndex,
            partnerIndex;

        if (margin0 > tolerance && margin1 > tolerance) {
            deepestIndex = (corners >> ((side0 | side1) << 1)) & 3;

            if (margin0 + tolerance < margin1) {
                partnerIndex = (corners >> (((side0 ^ 1) | side1) << 1)) & 3;
            } else if (margin1 + tolerance < margin0) {
                partnerIndex = (corners >> ((side0 | (side1 ^ 2)) << 1)) & 3;
            } else {
                // both neighbours are level with each other
                return Collision._supportsBesideDeepest(bodyA, vertices, deepestIndex, normalX, normalY);
            }

            _supports[0] = vertices[deepestIndex];
            _supports[1] = vertices[partnerIndex];

            return _supports;
        }

        if (margin1 > tolerance) {
            // the two corners across axis 0 are level
            return Collision._supportsFromLevelPair(bodyA, vertices,
                (corners >> (side1 << 1)) & 3, (corners >> ((1 | side1) << 1)) & 3, normalX, normalY);
        }

        if (margin0 > tolerance) {
            // the two corners across axis 1 are level
            return Collision._supportsFromLevelPair(bodyA, vertices,
                (corners >> (side0 << 1)) & 3, (corners >> ((side0 | 2) << 1)) & 3, normalX, normalY);
        }

        // both margins inside the tolerance: a box too small to reason about
        return Collision._findSupports(bodyA, bodyB, normal, direction);
    };

    /**
     * The general search's last step, verbatim, for a deepest vertex already
     * known: of its two neighbours, the next one wins only when strictly
     * deeper.
     * @method _supportsBesideDeepest
     * @private
     * @param {body} bodyA
     * @param {vertices} vertices
     * @param {number} deepestIndex
     * @param {number} normalX
     * @param {number} normalY
     * @return [vector]
     */
    Collision._supportsBesideDeepest = function(bodyA, vertices, deepestIndex, normalX, normalY) {
        var bodyAPositionX = bodyA.position.x,
            bodyAPositionY = bodyA.position.y,
            vertexA = vertices[deepestIndex],
            vertexB = vertices[(deepestIndex + 1) & 3],
            vertexC = vertices[(deepestIndex + 3) & 3];

        _supports[0] = vertexA;

        if (normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y)
            < normalX * (bodyAPositionX - vertexC.x) + normalY * (bodyAPositionY - vertexC.y)) {
            _supports[1] = vertexB;
        } else {
            _supports[1] = vertexC;
        }

        return _supports;
    };

    /**
     * Two level corners, one of which the general search picks as deepest and
     * the other as its partner. The search scans in index order and replaces
     * only on a strictly smaller distance, so the deeper one wins by the
     * search's own distance expression and the lower index wins an exact tie.
     * @method _supportsFromLevelPair
     * @private
     * @param {body} bodyA
     * @param {vertices} vertices
     * @param {number} indexA
     * @param {number} indexB
     * @param {number} normalX
     * @param {number} normalY
     * @return [vector]
     */
    Collision._supportsFromLevelPair = function(bodyA, vertices, indexA, indexB, normalX, normalY) {
        var bodyAPositionX = bodyA.position.x,
            bodyAPositionY = bodyA.position.y,
            lower = vertices[indexA < indexB ? indexA : indexB],
            upper = vertices[indexA < indexB ? indexB : indexA];

        if (normalX * (bodyAPositionX - upper.x) + normalY * (bodyAPositionY - upper.y)
            < normalX * (bodyAPositionX - lower.x) + normalY * (bodyAPositionY - lower.y)) {
            _supports[0] = upper;
            _supports[1] = lower;
        } else {
            _supports[0] = lower;
            _supports[1] = upper;
        }

        return _supports;
    };

    /**
     * Tests TWO points against the same vertex set in one walk of its edges.
     *
     * Each edge contributes two terms that do not depend on the point being
     * tested, `nextVertex.y - vertex.y` and `vertex.x - nextVertex.x`, plus the
     * element and property loads that produce them. Testing the points
     * separately does all of that twice. A point drops out of the arithmetic on
     * the first edge it fails, exactly as `Vertices.contains` returns early, so
     * the per-point work is unchanged and only the shared edge setup is saved.
     * @method _containsPair
     * @private
     * @param {vertices} vertices
     * @param {vector} pointA
     * @param {vector} pointB
     * @return {number} Bit 1 set if `pointA` is inside, bit 2 if `pointB` is
     */
    Collision._containsPair = function(vertices, pointA, pointB) {
        var pointAX = pointA.x,
            pointAY = pointA.y,
            pointBX = pointB.x,
            pointBY = pointB.y,
            verticesLength = vertices.length,
            vertex = vertices[verticesLength - 1],
            vertexX = vertex.x,
            vertexY = vertex.y,
            inside = 3,
            nextVertex,
            nextVertexX,
            nextVertexY,
            edgeDeltaY,
            edgeDeltaX;

        for (var i = 0; i < verticesLength; i++) {
            nextVertex = vertices[i];
            nextVertexX = nextVertex.x;
            nextVertexY = nextVertex.y;
            // the two exact subexpressions `Vertices.contains` forms per edge
            edgeDeltaY = nextVertexY - vertexY;
            edgeDeltaX = vertexX - nextVertexX;

            if ((inside & 1) !== 0
                && (pointAX - vertexX) * edgeDeltaY + (pointAY - vertexY) * edgeDeltaX > 0) {
                inside &= ~1;

                if (inside === 0) {
                    return 0;
                }
            }

            if ((inside & 2) !== 0
                && (pointBX - vertexX) * edgeDeltaY + (pointBY - vertexY) * edgeDeltaX > 0) {
                inside &= ~2;

                if (inside === 0) {
                    return 0;
                }
            }

            vertexX = nextVertexX;
            vertexY = nextVertexY;
        }

        return inside;
    };

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * A reference to the pair using this collision record, if there is one.
     *
     * @property pair
     * @type {pair|null}
     * @default null
     */

    /**
     * A flag that indicates if the bodies were colliding when the collision was last updated.
     * 
     * @property collided
     * @type boolean
     * @default false
     */

    /**
     * The first body part represented by the collision (see also `collision.parentA`).
     * 
     * @property bodyA
     * @type body
     */

    /**
     * The second body part represented by the collision (see also `collision.parentB`).
     * 
     * @property bodyB
     * @type body
     */

    /**
     * The first body represented by the collision (i.e. `collision.bodyA.parent`).
     * 
     * @property parentA
     * @type body
     */

    /**
     * The second body represented by the collision (i.e. `collision.bodyB.parent`).
     * 
     * @property parentB
     * @type body
     */

    /**
     * A `Number` that represents the minimum separating distance between the bodies along the collision normal.
     *
     * @readOnly
     * @property depth
     * @type number
     * @default 0
     */

    /**
     * A normalised `Vector` that represents the direction between the bodies that provides the minimum separating distance.
     *
     * @property normal
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * An array of body vertices that represent the support points in the collision.
     * 
     * _Note:_ Only the first `collision.supportCount` items of `collision.supports` are active.
     * Therefore use `collision.supportCount` instead of `collision.supports.length` when iterating the active supports.
     * 
     * These are the deepest vertices (along the collision normal) of each body that are contained by the other body's vertices.
     *
     * @property supports
     * @type vector[]
     * @default []
     */

    /**
     * The number of active supports for this collision found in `collision.supports`.
     * 
     * _Note:_ Only the first `collision.supportCount` items of `collision.supports` are active.
     * Therefore use `collision.supportCount` instead of `collision.supports.length` when iterating the active supports.
     *
     * @property supportCount
     * @type number
     * @default 0
     */

})();
