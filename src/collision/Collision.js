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
            tangent: { x: 0, y: 0 },
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
        Collision._overlapAxes(_overlapAB, bodyA, bodyB.vertices, bodyA.axes);

        if (_overlapAB.overlap <= 0) {
            return null;
        }

        Collision._overlapAxes(_overlapBA, bodyB, bodyA.vertices, bodyB.axes);

        if (_overlapBA.overlap <= 0) {
            return null;
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

            // tombstones (-1) match neither the pair id nor the empty sentinel,
            // so the probe walks straight over them
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
            tangent = collision.tangent,
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
        
        tangent.x = -normalY;
        tangent.y = normalX;

        collision.depth = depth;

        // find support points, there is always either exactly one or two
        var supportsB = Collision._findSupports(bodyA, bodyB, normal, 1),
            supportCount = 0;

        // find the supports from bodyB that are inside bodyA
        if (Vertices.contains(bodyA.vertices, supportsB[0])) {
            supports[supportCount++] = supportsB[0];
        }

        if (Vertices.contains(bodyA.vertices, supportsB[1])) {
            supports[supportCount++] = supportsB[1];
        }

        // find the supports from bodyA that are inside bodyB
        if (supportCount < 2) {
            var supportsA = Collision._findSupports(bodyB, bodyA, normal, -1);

            if (Vertices.contains(bodyB.vertices, supportsA[0])) {
                supports[supportCount++] = supportsA[0];
            }

            if (supportCount < 2 && Vertices.contains(bodyB.vertices, supportsA[1])) {
                supports[supportCount++] = supportsA[1];
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
     * A normalised `Vector` that is the tangent direction to the collision normal.
     *
     * @property tangent
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
