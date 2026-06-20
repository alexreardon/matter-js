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
            penetration: { x: 0, y: 0 },
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
        Collision._overlapAxes(_overlapAB, bodyA.vertices, bodyB.vertices, bodyA.axes);

        if (_overlapAB.overlap <= 0) {
            return null;
        }

        Collision._overlapAxes(_overlapBA, bodyB.vertices, bodyA.vertices, bodyB.axes);

        if (_overlapBA.overlap <= 0) {
            return null;
        }

        // reuse collision records for gc efficiency
        var pair = pairs && pairs.table.get(Pair.id(bodyA, bodyB)),
            collision;

        if (!pair) {
            collision = Collision.create(bodyA, bodyB);
            collision.collided = true;
            collision.bodyA = bodyA.id < bodyB.id ? bodyA : bodyB;
            collision.bodyB = bodyA.id < bodyB.id ? bodyB : bodyA;
            collision.parentA = collision.bodyA.parent;
            collision.parentB = collision.bodyB.parent;
        } else {
            collision = pair.collision;
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
            penetration = collision.penetration,
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

        penetration.x = normalX * depth;
        penetration.y = normalY * depth;

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
     * Find the overlap between two sets of vertices.
     * @method _overlapAxes
     * @private
     * @param {object} result
     * @param {vertices} verticesA
     * @param {vertices} verticesB
     * @param {axes} axes
     */
    Collision._overlapAxes = function(result, verticesA, verticesB, axes) {
        var verticesALength = verticesA.length,
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

        // unrolled fast path for the box/quad-vs-quad common case (both bodies
        // have four vertices). min/max of a fixed set is order-independent, so
        // this produces bit-identical projections to the general loop below.
        if (verticesALength === 4 && verticesBLength === 4) {
            var a0 = verticesA[0], a1 = verticesA[1], a2 = verticesA[2], a3 = verticesA[3],
                b0 = verticesB[0], b1 = verticesB[1], b2 = verticesB[2], b3 = verticesB[3],
                a0x = a0.x, a0y = a0.y, a1x = a1.x, a1y = a1.y,
                a2x = a2.x, a2y = a2.y, a3x = a3.x, a3y = a3.y,
                b0x = b0.x, b0y = b0.y, b1x = b1.x, b1y = b1.y,
                b2x = b2.x, b2y = b2.y, b3x = b3.x, b3y = b3.y;

            for (i = 0; i < axesLength; i++) {
                var qAxis = axes[i],
                    qAxisX = qAxis.x,
                    qAxisY = qAxis.y,
                    qa0 = a0x * qAxisX + a0y * qAxisY,
                    qa1 = a1x * qAxisX + a1y * qAxisY,
                    qa2 = a2x * qAxisX + a2y * qAxisY,
                    qa3 = a3x * qAxisX + a3y * qAxisY,
                    qMinA = qa0, qMaxA = qa0,
                    qb0 = b0x * qAxisX + b0y * qAxisY,
                    qb1 = b1x * qAxisX + b1y * qAxisY,
                    qb2 = b2x * qAxisX + b2y * qAxisY,
                    qb3 = b3x * qAxisX + b3y * qAxisY,
                    qMinB = qb0, qMaxB = qb0;

                if (qa1 > qMaxA) { qMaxA = qa1; } else if (qa1 < qMinA) { qMinA = qa1; }
                if (qa2 > qMaxA) { qMaxA = qa2; } else if (qa2 < qMinA) { qMinA = qa2; }
                if (qa3 > qMaxA) { qMaxA = qa3; } else if (qa3 < qMinA) { qMinA = qa3; }

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

        var verticesAX = verticesA[0].x,
            verticesAY = verticesA[0].y,
            verticesBX = verticesB[0].x,
            verticesBY = verticesB[0].y;

        for (i = 0; i < axesLength; i++) {
            var axis = axes[i],
                axisX = axis.x,
                axisY = axis.y,
                minA = verticesAX * axisX + verticesAY * axisY,
                minB = verticesBX * axisX + verticesBY * axisY,
                maxA = minA,
                maxB = minB;

            for (j = 1; j < verticesALength; j += 1) {
                dot = verticesA[j].x * axisX + verticesA[j].y * axisY;

                if (dot > maxA) {
                    maxA = dot;
                } else if (dot < minA) {
                    minA = dot;
                }
            }

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
     * A `Vector` that represents the direction and depth of the collision.
     *
     * @property penetration
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
