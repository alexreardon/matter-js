/**
* The `Matter.Resolver` module contains methods for resolving collision pairs.
*
* @class Resolver
*/

var Resolver = {};

module.exports = Resolver;

var Vertices = require('../geometry/Vertices');
var Common = require('../core/Common');
var Bounds = require('../geometry/Bounds');

(function() {

    Resolver._restingThresh = 2;
    Resolver._restingThreshTangent = Math.sqrt(6);
    Resolver._positionDampen = 0.9;
    Resolver._positionWarming = 0.8;
    Resolver._frictionNormalMultiplier = 5;
    Resolver._frictionMaxStatic = Number.MAX_VALUE;

    /**
     * Prepare pairs for position solving.
     *
     * When the optional `container` (the engine's `pairs` structure) is given,
     * the bodies touched by active pairs are also collected into a persistent
     * per-engine scratch list (`container._solverBodies`), and each body's
     * `totalContacts` is zeroed on first touch here rather than by a full
     * all-bodies reset in `postSolvePosition`. This lets `postSolvePosition`
     * visit only the bodies the solver can have affected instead of scanning
     * the whole world (dense static pages make that scan the cost).
     * @method preSolvePosition
     * @param {pair[]} pairs
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.preSolvePosition = function(pairs, container) {
        var i,
            pair,
            contactCount,
            pairsLength = pairs.length;

        if (container) {
            var solverBodies = container._solverBodies || (container._solverBodies = []),
                epoch = (container._solverEpoch || 0) + 1,
                solverBodyCount = 0;

            container._solverEpoch = epoch;

            // find total contacts on each body, collecting each touched body
            // once (epoch stamp) and zeroing its contact count on first touch
            for (i = 0; i < pairsLength; i++) {
                pair = pairs[i];

                if (!pair.isActive)
                    continue;

                contactCount = pair.contactCount;

                var parentA = pair.collision.parentA,
                    parentB = pair.collision.parentB;

                if (parentA._solverStamp !== epoch) {
                    parentA._solverStamp = epoch;
                    parentA.totalContacts = 0;
                    solverBodies[solverBodyCount++] = parentA;
                }

                if (parentB._solverStamp !== epoch) {
                    parentB._solverStamp = epoch;
                    parentB.totalContacts = 0;
                    solverBodies[solverBodyCount++] = parentB;
                }

                parentA.totalContacts += contactCount;
                parentB.totalContacts += contactCount;
            }

            if (solverBodies.length !== solverBodyCount) {
                solverBodies.length = solverBodyCount;
            }

            return;
        }

        // find total contacts on each body
        for (i = 0; i < pairsLength; i++) {
            pair = pairs[i];

            if (!pair.isActive)
                continue;

            contactCount = pair.contactCount;
            pair.collision.parentA.totalContacts += contactCount;
            pair.collision.parentB.totalContacts += contactCount;
        }
    };

    /**
     * Find a solution for pair positions.
     * @method solvePosition
     * @param {pair[]} pairs
     * @param {number} delta
     * @param {number} [damping=1]
     */
    Resolver.solvePosition = function(pairs, delta, damping) {
        var i,
            pair,
            collision,
            bodyA,
            bodyB,
            normal,
            contactShare,
            positionImpulse,
            positionDampen = Resolver._positionDampen * (damping || 1),
            slopDampen = Common.clamp(delta / Common._baseDelta, 0, 1),
            pairsLength = pairs.length;

        // find impulses required to resolve penetration
        for (i = 0; i < pairsLength; i++) {
            pair = pairs[i];
            
            if (!pair.isActive || pair.isSensor)
                continue;

            collision = pair.collision;
            bodyA = collision.parentA;
            bodyB = collision.parentB;
            normal = collision.normal;

            // get current separation between body edges involved in collision
            pair.separation = 
                collision.depth + normal.x * (bodyB.positionImpulse.x - bodyA.positionImpulse.x)
                + normal.y * (bodyB.positionImpulse.y - bodyA.positionImpulse.y);
        }
        
        for (i = 0; i < pairsLength; i++) {
            pair = pairs[i];

            if (!pair.isActive || pair.isSensor)
                continue;
            
            collision = pair.collision;
            bodyA = collision.parentA;
            bodyB = collision.parentB;
            normal = collision.normal;
            positionImpulse = pair.separation - pair.slop * slopDampen;

            if (bodyA.isStatic || bodyB.isStatic)
                positionImpulse *= 2;
            
            if (!(bodyA.isStatic || bodyA.isSleeping)) {
                contactShare = positionDampen / bodyA.totalContacts;
                bodyA.positionImpulse.x += normal.x * positionImpulse * contactShare;
                bodyA.positionImpulse.y += normal.y * positionImpulse * contactShare;
            }

            if (!(bodyB.isStatic || bodyB.isSleeping)) {
                contactShare = positionDampen / bodyB.totalContacts;
                bodyB.positionImpulse.x -= normal.x * positionImpulse * contactShare;
                bodyB.positionImpulse.y -= normal.y * positionImpulse * contactShare;
            }
        }
    };

    /**
     * Applies the accumulated position impulse to a single body and either
     * clears it or decays it to warm the next step. Identical math to the
     * classic full-scan path; shared by both `postSolvePosition` modes.
     * @private
     * @method _postSolveBody
     * @param {body} body
     * @return {boolean} `true` when the body still carries a non-zero impulse
     */
    Resolver._postSolveBody = function(body) {
        var positionImpulse = body.positionImpulse,
            positionImpulseX = positionImpulse.x,
            positionImpulseY = positionImpulse.y,
            velocity = body.velocity;

        if (positionImpulseX === 0 && positionImpulseY === 0) {
            return false;
        }

        // update body geometry
        for (var j = 0; j < body.parts.length; j++) {
            var part = body.parts[j];
            Vertices.translate(part.vertices, positionImpulse);
            Bounds.update(part.bounds, part.vertices, velocity);
            part.position.x += positionImpulseX;
            part.position.y += positionImpulseY;
        }

        // move the body without changing velocity
        body.positionPrev.x += positionImpulseX;
        body.positionPrev.y += positionImpulseY;

        if (positionImpulseX * velocity.x + positionImpulseY * velocity.y < 0) {
            // reset cached impulse if the body has velocity along it
            positionImpulse.x = 0;
            positionImpulse.y = 0;
            return false;
        }

        // warm the next iteration
        positionImpulse.x *= Resolver._positionWarming;
        positionImpulse.y *= Resolver._positionWarming;

        // the warming decay only asymptotes towards zero; below this magnitude
        // the remaining translation is far under any observable simulation
        // scale, so clear it outright to let carried bodies retire
        if (positionImpulse.x < 1e-9 && positionImpulse.x > -1e-9
            && positionImpulse.y < 1e-9 && positionImpulse.y > -1e-9) {
            positionImpulse.x = 0;
            positionImpulse.y = 0;
            return false;
        }

        return true;
    };

    /**
     * Apply position resolution.
     *
     * When the optional `container` (the engine's `pairs` structure, as passed
     * to `preSolvePosition`) is given, only the bodies collected there plus any
     * bodies still carrying a warmed impulse from earlier steps are visited,
     * instead of scanning every body in the world. A body whose pair ended but
     * whose warmed impulse is still decaying stays in a persistent carry list
     * until the impulse clears, preserving the classic path's decay behaviour.
     * @method postSolvePosition
     * @param {body[]} bodies
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.postSolvePosition = function(bodies, container) {
        var positionWarming = Resolver._positionWarming,
            verticesTranslate = Vertices.translate,
            boundsUpdate = Bounds.update,
            i;

        if (container) {
            var solverBodies = container._solverBodies || (container._solverBodies = []),
                solverBodiesLength = solverBodies.length,
                carry = container._impulseCarry || (container._impulseCarry = []),
                carryLength = carry.length,
                epoch = container._solverEpoch,
                postSolveBody = Resolver._postSolveBody,
                carryCount = 0;

            // bodies from earlier steps still decaying a warmed impulse, first:
            // this loop compacts the carry list in place, and must finish its
            // reads before the solver-bodies loop below appends into the same
            // array. Bodies also touched by this step's pairs are skipped here
            // (the stamp matches) and handled in the second loop instead.
            for (i = 0; i < carryLength; i++) {
                var carryBody = carry[i];
                if (carryBody._solverStamp === epoch) {
                    continue;
                }
                if (postSolveBody(carryBody)) {
                    // in-place compaction: carryCount <= i always holds here
                    carry[carryCount++] = carryBody;
                }
            }

            // bodies touched by this step's pairs; append any that finish the
            // step still carrying a warmed impulse
            for (i = 0; i < solverBodiesLength; i++) {
                var solverBody = solverBodies[i];
                if (postSolveBody(solverBody)) {
                    carry[carryCount++] = solverBody;
                }
            }

            if (carry.length !== carryCount) {
                carry.length = carryCount;
            }

            return;
        }

        var bodiesLength = bodies.length;

        for (i = 0; i < bodiesLength; i++) {
            var body = bodies[i],
                positionImpulse = body.positionImpulse,
                positionImpulseX = positionImpulse.x,
                positionImpulseY = positionImpulse.y,
                velocity = body.velocity;

            // reset contact count
            body.totalContacts = 0;

            if (positionImpulseX !== 0 || positionImpulseY !== 0) {
                // update body geometry
                for (var j = 0; j < body.parts.length; j++) {
                    var part = body.parts[j];
                    verticesTranslate(part.vertices, positionImpulse);
                    boundsUpdate(part.bounds, part.vertices, velocity);
                    part.position.x += positionImpulseX;
                    part.position.y += positionImpulseY;
                }

                // move the body without changing velocity
                body.positionPrev.x += positionImpulseX;
                body.positionPrev.y += positionImpulseY;

                if (positionImpulseX * velocity.x + positionImpulseY * velocity.y < 0) {
                    // reset cached impulse if the body has velocity along it
                    positionImpulse.x = 0;
                    positionImpulse.y = 0;
                } else {
                    // warm the next iteration
                    positionImpulse.x *= positionWarming;
                    positionImpulse.y *= positionWarming;
                }
            }
        }
    };

    /**
     * Prepare pairs for velocity solving.
     * @method preSolveVelocity
     * @param {pair[]} pairs
     */
    Resolver.preSolveVelocity = function(pairs) {
        var pairsLength = pairs.length,
            i,
            j;
        
        for (i = 0; i < pairsLength; i++) {
            var pair = pairs[i];
            
            if (!pair.isActive || pair.isSensor)
                continue;
            
            var contacts = pair.contacts,
                contactCount = pair.contactCount,
                collision = pair.collision,
                bodyA = collision.parentA,
                bodyB = collision.parentB,
                normal = collision.normal,
                tangent = collision.tangent;
    
            // resolve each contact
            for (j = 0; j < contactCount; j++) {
                var contact = contacts[j],
                    contactVertex = contact.vertex,
                    normalImpulse = contact.normalImpulse,
                    tangentImpulse = contact.tangentImpulse;
    
                if (normalImpulse !== 0 || tangentImpulse !== 0) {
                    // total impulse from contact
                    var impulseX = normal.x * normalImpulse + tangent.x * tangentImpulse,
                        impulseY = normal.y * normalImpulse + tangent.y * tangentImpulse;
                    
                    // apply impulse from contact
                    if (!(bodyA.isStatic || bodyA.isSleeping)) {
                        bodyA.positionPrev.x += impulseX * bodyA.inverseMass;
                        bodyA.positionPrev.y += impulseY * bodyA.inverseMass;
                        bodyA.anglePrev += bodyA.inverseInertia * (
                            (contactVertex.x - bodyA.position.x) * impulseY
                            - (contactVertex.y - bodyA.position.y) * impulseX
                        );
                    }
    
                    if (!(bodyB.isStatic || bodyB.isSleeping)) {
                        bodyB.positionPrev.x -= impulseX * bodyB.inverseMass;
                        bodyB.positionPrev.y -= impulseY * bodyB.inverseMass;
                        bodyB.anglePrev -= bodyB.inverseInertia * (
                            (contactVertex.x - bodyB.position.x) * impulseY 
                            - (contactVertex.y - bodyB.position.y) * impulseX
                        );
                    }
                }
            }
        }
    };

    /**
     * Find a solution for pair velocities.
     * @method solveVelocity
     * @param {pair[]} pairs
     * @param {number} delta
     */
    Resolver.solveVelocity = function(pairs, delta) {
        var timeScale = delta / Common._baseDelta,
            timeScaleSquared = timeScale * timeScale,
            timeScaleCubed = timeScaleSquared * timeScale,
            restingThresh = -Resolver._restingThresh * timeScale,
            restingThreshTangent = Resolver._restingThreshTangent,
            frictionNormalMultiplier = Resolver._frictionNormalMultiplier * timeScale,
            frictionMaxStatic = Resolver._frictionMaxStatic,
            pairsLength = pairs.length,
            tangentImpulse,
            maxFriction,
            i,
            j;

        for (i = 0; i < pairsLength; i++) {
            var pair = pairs[i];
            
            if (!pair.isActive || pair.isSensor)
                continue;
            
            var collision = pair.collision,
                bodyA = collision.parentA,
                bodyB = collision.parentB,
                normalX = collision.normal.x,
                normalY = collision.normal.y,
                tangentX = collision.tangent.x,
                tangentY = collision.tangent.y,
                inverseMassTotal = pair.inverseMass,
                friction = pair.friction * pair.frictionStatic * frictionNormalMultiplier,
                contacts = pair.contacts,
                contactCount = pair.contactCount,
                contactShare = 1 / contactCount;

            // cache body properties that are invariant across the contact loop
            var bodyAPositionX = bodyA.position.x,
                bodyAPositionY = bodyA.position.y,
                bodyBPositionX = bodyB.position.x,
                bodyBPositionY = bodyB.position.y,
                bodyAInverseMass = bodyA.inverseMass,
                bodyBInverseMass = bodyB.inverseMass,
                bodyAInverseInertia = bodyA.inverseInertia,
                bodyBInverseInertia = bodyB.inverseInertia,
                bodyACanMove = !(bodyA.isStatic || bodyA.isSleeping),
                bodyBCanMove = !(bodyB.isStatic || bodyB.isSleeping);

            // get body velocities
            var bodyAVelocityX = bodyAPositionX - bodyA.positionPrev.x,
                bodyAVelocityY = bodyAPositionY - bodyA.positionPrev.y,
                bodyAAngularVelocity = bodyA.angle - bodyA.anglePrev,
                bodyBVelocityX = bodyBPositionX - bodyB.positionPrev.x,
                bodyBVelocityY = bodyBPositionY - bodyB.positionPrev.y,
                bodyBAngularVelocity = bodyB.angle - bodyB.anglePrev;

            // resolve each contact
            for (j = 0; j < contactCount; j++) {
                var contact = contacts[j],
                    contactVertex = contact.vertex;

                var offsetAX = contactVertex.x - bodyAPositionX,
                    offsetAY = contactVertex.y - bodyAPositionY,
                    offsetBX = contactVertex.x - bodyBPositionX,
                    offsetBY = contactVertex.y - bodyBPositionY;
 
                var velocityPointAX = bodyAVelocityX - offsetAY * bodyAAngularVelocity,
                    velocityPointAY = bodyAVelocityY + offsetAX * bodyAAngularVelocity,
                    velocityPointBX = bodyBVelocityX - offsetBY * bodyBAngularVelocity,
                    velocityPointBY = bodyBVelocityY + offsetBX * bodyBAngularVelocity;

                var relativeVelocityX = velocityPointAX - velocityPointBX,
                    relativeVelocityY = velocityPointAY - velocityPointBY;

                var normalVelocity = normalX * relativeVelocityX + normalY * relativeVelocityY,
                    tangentVelocity = tangentX * relativeVelocityX + tangentY * relativeVelocityY;

                // coulomb friction
                var normalOverlap = pair.separation + normalVelocity;
                var normalForce = normalOverlap < 1 ? normalOverlap : 1;
                normalForce = normalOverlap < 0 ? 0 : normalForce;

                var frictionLimit = normalForce * friction;

                if (tangentVelocity < -frictionLimit || tangentVelocity > frictionLimit) {
                    maxFriction = (tangentVelocity > 0 ? tangentVelocity : -tangentVelocity);
                    tangentImpulse = pair.friction * (tangentVelocity > 0 ? 1 : -1) * timeScaleCubed;
                    
                    if (tangentImpulse < -maxFriction) {
                        tangentImpulse = -maxFriction;
                    } else if (tangentImpulse > maxFriction) {
                        tangentImpulse = maxFriction;
                    }
                } else {
                    tangentImpulse = tangentVelocity;
                    maxFriction = frictionMaxStatic;
                }

                // account for mass, inertia and contact offset
                var oAcN = offsetAX * normalY - offsetAY * normalX,
                    oBcN = offsetBX * normalY - offsetBY * normalX,
                    share = contactShare / (inverseMassTotal + bodyAInverseInertia * oAcN * oAcN + bodyBInverseInertia * oBcN * oBcN);

                // raw impulses
                var normalImpulse = (1 + pair.restitution) * normalVelocity * share;
                tangentImpulse *= share;

                // handle high velocity and resting collisions separately
                if (normalVelocity < restingThresh) {
                    // high normal velocity so clear cached contact normal impulse
                    contact.normalImpulse = 0;
                } else {
                    // solve resting collision constraints using Erin Catto's method (GDC08)
                    // impulse constraint tends to 0
                    var contactNormalImpulse = contact.normalImpulse;
                    contact.normalImpulse += normalImpulse;
                    if (contact.normalImpulse > 0) contact.normalImpulse = 0;
                    normalImpulse = contact.normalImpulse - contactNormalImpulse;
                }

                // handle high velocity and resting collisions separately
                if (tangentVelocity < -restingThreshTangent || tangentVelocity > restingThreshTangent) {
                    // high tangent velocity so clear cached contact tangent impulse
                    contact.tangentImpulse = 0;
                } else {
                    // solve resting collision constraints using Erin Catto's method (GDC08)
                    // tangent impulse tends to -tangentSpeed or +tangentSpeed
                    var contactTangentImpulse = contact.tangentImpulse;
                    contact.tangentImpulse += tangentImpulse;
                    if (contact.tangentImpulse < -maxFriction) contact.tangentImpulse = -maxFriction;
                    if (contact.tangentImpulse > maxFriction) contact.tangentImpulse = maxFriction;
                    tangentImpulse = contact.tangentImpulse - contactTangentImpulse;
                }

                // total impulse from contact
                var impulseX = normalX * normalImpulse + tangentX * tangentImpulse,
                    impulseY = normalY * normalImpulse + tangentY * tangentImpulse;
                
                // apply impulse from contact
                if (bodyACanMove) {
                    bodyA.positionPrev.x += impulseX * bodyAInverseMass;
                    bodyA.positionPrev.y += impulseY * bodyAInverseMass;
                    bodyA.anglePrev += (offsetAX * impulseY - offsetAY * impulseX) * bodyAInverseInertia;
                }

                if (bodyBCanMove) {
                    bodyB.positionPrev.x -= impulseX * bodyBInverseMass;
                    bodyB.positionPrev.y -= impulseY * bodyBInverseMass;
                    bodyB.anglePrev -= (offsetBX * impulseY - offsetBY * impulseX) * bodyBInverseInertia;
                }
            }
        }
    };

})();
