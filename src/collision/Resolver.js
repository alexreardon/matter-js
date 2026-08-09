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
     *
     * `_solverStamp` is pre-declared in `Body.create`; see the rule there
     * before adding any new per-body scratch field (a lazily added field
     * splits body hidden classes and slows the whole engine).
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

            // flat (structure-of-arrays) snapshot of the active non-sensor
            // pairs, built once per step so the position iterations read and
            // write compact numeric arrays instead of chasing
            // pair -> collision -> parent -> positionImpulse chains six times
            // over. Arrays persist on the container and are reused each step.
            var soa = container._soa || (container._soa = {
                    idxA: [], idxB: [], nx: [], ny: [], depth: [], slop: [],
                    mul2: [], sep: [], pairRefs: [],
                    impX: [], impY: [], tc: [], canMove: [],
                    pairCount: 0, bodyCount: 0, epoch: 0,
                    sepValid: false, dirty: false
                }),
                soaIdxA = soa.idxA,
                soaIdxB = soa.idxB,
                soaNx = soa.nx,
                soaNy = soa.ny,
                soaDepth = soa.depth,
                soaSlop = soa.slop,
                soaMul2 = soa.mul2,
                soaPairRefs = soa.pairRefs,
                soaPairCount = 0;

            // find total contacts on each body, collecting each touched body
            // once (epoch stamp) and zeroing its contact count on first touch
            for (i = 0; i < pairsLength; i++) {
                pair = pairs[i];

                if (!pair.isActive)
                    continue;

                contactCount = pair.contactCount;

                var collision = pair.collision,
                    parentA = collision.parentA,
                    parentB = collision.parentB;

                if (parentA._solverStamp !== epoch) {
                    parentA._solverStamp = epoch;
                    parentA._solverIndex = solverBodyCount;
                    parentA.totalContacts = 0;
                    solverBodies[solverBodyCount++] = parentA;
                }

                if (parentB._solverStamp !== epoch) {
                    parentB._solverStamp = epoch;
                    parentB._solverIndex = solverBodyCount;
                    parentB.totalContacts = 0;
                    solverBodies[solverBodyCount++] = parentB;
                }

                parentA.totalContacts += contactCount;
                parentB.totalContacts += contactCount;

                // sensor pairs contribute contacts above but are never solved
                if (pair.isSensor)
                    continue;

                var normal = collision.normal;
                soaIdxA[soaPairCount] = parentA._solverIndex;
                soaIdxB[soaPairCount] = parentB._solverIndex;
                soaNx[soaPairCount] = normal.x;
                soaNy[soaPairCount] = normal.y;
                soaDepth[soaPairCount] = collision.depth;
                soaSlop[soaPairCount] = pair.slop;
                soaMul2[soaPairCount] = (parentA.isStatic || parentB.isStatic) ? 2 : 1;
                soaPairRefs[soaPairCount] = pair;
                soaPairCount++;
            }

            if (solverBodies.length !== solverBodyCount) {
                solverBodies.length = solverBodyCount;
            }
            if (soaPairRefs.length !== soaPairCount) {
                soaPairRefs.length = soaPairCount;
            }

            // per-body snapshot: warm-start impulses, contact totals and the
            // can-move flag (totalContacts is only final after the pair loop)
            var soaImpX = soa.impX,
                soaImpY = soa.impY,
                soaTc = soa.tc,
                soaCanMove = soa.canMove;
            for (i = 0; i < solverBodyCount; i++) {
                var solverBody = solverBodies[i],
                    solverBodyImpulse = solverBody.positionImpulse;
                soaImpX[i] = solverBodyImpulse.x;
                soaImpY[i] = solverBodyImpulse.y;
                soaTc[i] = solverBody.totalContacts;
                soaCanMove[i] = (solverBody.isStatic || solverBody.isSleeping) ? 0 : 1;
            }

            soa.pairCount = soaPairCount;
            soa.bodyCount = solverBodyCount;
            soa.epoch = epoch;
            soa.sepValid = false;
            soa.dirty = false;

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
     *
     * When the optional `container` (the engine's `pairs` structure, prepared
     * by `preSolvePosition`) is given, the iteration runs over the flat
     * structure-of-arrays snapshot built there: identical math in identical
     * order over compact numeric arrays, with the results written back to the
     * pairs and bodies in `postSolvePosition`.
     * @method solvePosition
     * @param {pair[]} pairs
     * @param {number} delta
     * @param {number} [damping=1]
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.solvePosition = function(pairs, delta, damping, container) {
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

        var soa = container && container._soa;
        if (soa && soa.epoch === container._solverEpoch) {
            var pairCount = soa.pairCount,
                idxA = soa.idxA,
                idxB = soa.idxB,
                nxArr = soa.nx,
                nyArr = soa.ny,
                depthArr = soa.depth,
                slopArr = soa.slop,
                mul2Arr = soa.mul2,
                sepArr = soa.sep,
                impX = soa.impX,
                impY = soa.impY,
                tcArr = soa.tc,
                canMove = soa.canMove,
                p,
                ia,
                ib;

            // get current separation between body edges involved in collision
            for (p = 0; p < pairCount; p++) {
                ia = idxA[p];
                ib = idxB[p];
                sepArr[p] = depthArr[p]
                    + nxArr[p] * (impX[ib] - impX[ia])
                    + nyArr[p] * (impY[ib] - impY[ia]);
            }

            soa.sepValid = true;
            soa.dirty = true;

            // find impulses required to resolve penetration
            for (p = 0; p < pairCount; p++) {
                ia = idxA[p];
                ib = idxB[p];

                // multiplying by the pre-snapshotted 1-or-2 static factor is
                // exact, so this matches the classic conditional doubling
                var soaImpulse = (sepArr[p] - slopArr[p] * slopDampen) * mul2Arr[p],
                    soaNormalX = nxArr[p],
                    soaNormalY = nyArr[p];

                if (canMove[ia] === 1) {
                    contactShare = positionDampen / tcArr[ia];
                    impX[ia] += soaNormalX * soaImpulse * contactShare;
                    impY[ia] += soaNormalY * soaImpulse * contactShare;
                }

                if (canMove[ib] === 1) {
                    contactShare = positionDampen / tcArr[ib];
                    impX[ib] -= soaNormalX * soaImpulse * contactShare;
                    impY[ib] -= soaNormalY * soaImpulse * contactShare;
                }
            }

            return;
        }

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

            // write the flat solver snapshot back to the pairs and bodies
            // before the per-body impulse application below reads them. Only
            // when the SoA path actually ran this step (dirty): a caller that
            // ran the classic solvePosition instead has already mutated the
            // real objects, and stale array values must not clobber that.
            var soaBack = container._soa;
            if (soaBack && soaBack.dirty && soaBack.epoch === epoch) {
                var backPairRefs = soaBack.pairRefs,
                    backSep = soaBack.sep,
                    backImpX = soaBack.impX,
                    backImpY = soaBack.impY,
                    backPairCount = soaBack.pairCount,
                    backBodyCount = soaBack.bodyCount,
                    back;

                if (soaBack.sepValid) {
                    for (back = 0; back < backPairCount; back++) {
                        backPairRefs[back].separation = backSep[back];
                    }
                }

                // a body the position solve could not move has an unchanged
                // snapshot, so its write-back is a no-op by value; skip it
                // (solver bodies are mostly statics on a dense page)
                var backCanMove = soaBack.canMove;
                for (back = 0; back < backBodyCount; back++) {
                    if (backCanMove[back] === 0) {
                        continue;
                    }

                    var backImpulse = solverBodies[back].positionImpulse;
                    backImpulse.x = backImpX[back];
                    backImpulse.y = backImpY[back];
                }
            }

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
                // the zero-impulse early-return of _postSolveBody, inlined to
                // skip the call (a removed body's impulse is zeroed in place)
                var carryImpulse = carryBody.positionImpulse;
                if ((carryImpulse.x !== 0 || carryImpulse.y !== 0) && postSolveBody(carryBody)) {
                    // in-place compaction: carryCount <= i always holds here
                    carry[carryCount++] = carryBody;
                }
            }

            // bodies touched by this step's pairs; append any that finish the
            // step still carrying a warmed impulse. The zero-impulse check is
            // inlined because most solver bodies on a dense page are statics
            // that never accumulate one.
            for (i = 0; i < solverBodiesLength; i++) {
                var solverBody = solverBodies[i],
                    solverImpulse = solverBody.positionImpulse;
                if ((solverImpulse.x !== 0 || solverImpulse.y !== 0) && postSolveBody(solverBody)) {
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
     *
     * When the optional `container` (the engine's `pairs` structure, already
     * prepared by `preSolvePosition` this step) is given, a flat
     * structure-of-arrays snapshot of the velocity solve is built here: body
     * state per `_solverIndex` slot, per-pair constants (normal, tangent,
     * friction products, restitution, separation, contact share) and per-
     * contact state (vertex, warm-start impulses). The warm-start application
     * below then runs against the flat arrays, `solveVelocity` iterates them,
     * and `postSolveVelocity` writes the mutated state back. Everything the
     * iterations read besides `positionPrev` / `anglePrev` and the contact
     * impulses is constant across them, which is what makes the snapshot
     * sound; the math is identical in identical order.
     * @method preSolveVelocity
     * @param {pair[]} pairs
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.preSolveVelocity = function(pairs, container) {
        var pairsLength = pairs.length,
            i,
            j;

        // the velocity snapshot is built over the position snapshot: the pair
        // list, solver slots, normals and separations were already collected
        // by preSolvePosition this step, so they are aliased rather than
        // re-derived from another walk of pairs.list. A container without a
        // same-step position snapshot falls through to the classic path (the
        // engine always runs preSolvePosition first, so only external callers
        // can get there).
        var soa = container && container._soa;

        if (soa && soa.epoch === container._solverEpoch) {
            var soaV = container._soaV || (container._soaV = {
                    idxA: [], idxB: [], nx: [], ny: [],
                    frictionTimesStatic: [], friction: [],
                    restitutionPlus1: [], separation: [], contactCounts: [],
                    // per-contact constants of the iterations, hoisted here:
                    // contact offsets from both body centres, and the share
                    // factor whose divide otherwise runs once per contact per
                    // iteration (all inputs are fixed across the iterations)
                    cOffAX: [], cOffAY: [], cOffBX: [], cOffBY: [], cShare: [],
                    cNormalImpulse: [], cTangentImpulse: [], cRefs: [],
                    bPosX: [], bPosY: [], bPosPrevX: [], bPosPrevY: [],
                    bAngle: [], bAnglePrev: [], bInvMass: [], bInvInertia: [], bCanMove: [],
                    pairCount: 0, contactTotal: 0, bodyCount: 0, epoch: 0, dirty: false
                }),
                solverBodies = container._solverBodies || (container._solverBodies = []),
                bodyCount = solverBodies.length,
                aPairRefs = soa.pairRefs,
                aPairCount = soa.pairCount,
                aIdxA = soa.idxA,
                aIdxB = soa.idxB,
                aNx = soa.nx,
                aNy = soa.ny,
                aSep = soa.sep,
                aSepValid = soa.sepValid,
                vFrictionTimesStatic = soaV.frictionTimesStatic,
                vFriction = soaV.friction,
                vRestitutionPlus1 = soaV.restitutionPlus1,
                vContactCounts = soaV.contactCounts,
                cOffAX = soaV.cOffAX,
                cOffAY = soaV.cOffAY,
                cOffBX = soaV.cOffBX,
                cOffBY = soaV.cOffBY,
                cShare = soaV.cShare,
                cNormalImpulse = soaV.cNormalImpulse,
                cTangentImpulse = soaV.cTangentImpulse,
                cRefs = soaV.cRefs,
                bPosX = soaV.bPosX,
                bPosY = soaV.bPosY,
                bPosPrevX = soaV.bPosPrevX,
                bPosPrevY = soaV.bPosPrevY,
                bAngle = soaV.bAngle,
                bAnglePrev = soaV.bAnglePrev,
                bInvMass = soaV.bInvMass,
                bInvInertia = soaV.bInvInertia,
                bCanMove = soaV.bCanMove,
                vContactIndex = 0;

            // pair-parallel arrays that the position snapshot already holds are
            // shared by reference; nothing on the velocity side writes them
            soaV.idxA = aIdxA;
            soaV.idxB = aIdxB;
            soaV.nx = aNx;
            soaV.ny = aNy;

            // the position solve wrote every active pair's separation into its
            // own snapshot in this same slot order, so alias that too. Only a
            // step whose position solve never ran needs the per-pair copy off
            // the pair objects, and that path takes a private array back.
            var vSeparation;
            if (aSepValid) {
                vSeparation = soaV.separation = aSep;
            } else {
                vSeparation = soaV.separation;
                if (vSeparation === aSep) {
                    vSeparation = soaV.separation = [];
                }
                for (i = 0; i < aPairCount; i++) {
                    vSeparation[i] = aPairRefs[i].separation;
                }
            }

            // per-body snapshot into the slots assigned by preSolvePosition
            // (same epoch, same _solverIndex ordering as _solverBodies). This
            // one is NOT aliased: positions moved during the position solve,
            // and a constraint pass can wake bodies between the phases.
            for (i = 0; i < bodyCount; i++) {
                var vBody = solverBodies[i],
                    vBodyPosition = vBody.position,
                    vBodyPositionPrev = vBody.positionPrev;
                bPosX[i] = vBodyPosition.x;
                bPosY[i] = vBodyPosition.y;
                bPosPrevX[i] = vBodyPositionPrev.x;
                bPosPrevY[i] = vBodyPositionPrev.y;
                bAngle[i] = vBody.angle;
                bAnglePrev[i] = vBody.anglePrev;
                bInvMass[i] = vBody.inverseMass;
                bInvInertia[i] = vBody.inverseInertia;
                bCanMove[i] = (vBody.isStatic || vBody.isSleeping) ? 0 : 1;
            }

            // per-pair and per-contact snapshot, with the classic warm-start
            // application fused in (identical order: pair by pair, contact by
            // contact, mutating the flat body state)
            for (i = 0; i < aPairCount; i++) {
                var vPair = aPairRefs[i],
                    vContacts = vPair.contacts,
                    vContactCount = vPair.contactCount,
                    slotA = aIdxA[i],
                    slotB = aIdxB[i],
                    vNormalX = aNx[i],
                    vNormalY = aNy[i],
                    // exactly how Collision.collides builds the tangent, so
                    // deriving it here matches reading collision.tangent
                    vTangentX = -vNormalY,
                    vTangentY = vNormalX;

                var vInverseMassTotal = vPair.inverseMass,
                    vPairContactShare = 1 / vContactCount,
                    vInvInertiaA = bInvInertia[slotA],
                    vInvInertiaB = bInvInertia[slotB],
                    vPosAX = bPosX[slotA],
                    vPosAY = bPosY[slotA],
                    vPosBX = bPosX[slotB],
                    vPosBY = bPosY[slotB];

                // first factor of the classic left-associated triple product
                vFrictionTimesStatic[i] = vPair.friction * vPair.frictionStatic;
                vFriction[i] = vPair.friction;
                vRestitutionPlus1[i] = 1 + vPair.restitution;
                vContactCounts[i] = vContactCount;

                for (j = 0; j < vContactCount; j++) {
                    var vContact = vContacts[j],
                        vContactVertex = vContact.vertex,
                        vNormalImpulse = vContact.normalImpulse,
                        vTangentImpulse = vContact.tangentImpulse,
                        vOffsetAX = vContactVertex.x - vPosAX,
                        vOffsetAY = vContactVertex.y - vPosAY,
                        vOffsetBX = vContactVertex.x - vPosBX,
                        vOffsetBY = vContactVertex.y - vPosBY,
                        vOAcN = vOffsetAX * vNormalY - vOffsetAY * vNormalX,
                        vOBcN = vOffsetBX * vNormalY - vOffsetBY * vNormalX;

                    cOffAX[vContactIndex] = vOffsetAX;
                    cOffAY[vContactIndex] = vOffsetAY;
                    cOffBX[vContactIndex] = vOffsetBX;
                    cOffBY[vContactIndex] = vOffsetBY;
                    // identical association to the classic in-iteration form
                    cShare[vContactIndex] = vPairContactShare / (vInverseMassTotal
                        + vInvInertiaA * vOAcN * vOAcN
                        + vInvInertiaB * vOBcN * vOBcN);
                    cNormalImpulse[vContactIndex] = vNormalImpulse;
                    cTangentImpulse[vContactIndex] = vTangentImpulse;
                    cRefs[vContactIndex] = vContact;

                    if (vNormalImpulse !== 0 || vTangentImpulse !== 0) {
                        // total impulse from contact
                        var vImpulseX = vNormalX * vNormalImpulse + vTangentX * vTangentImpulse,
                            vImpulseY = vNormalY * vNormalImpulse + vTangentY * vTangentImpulse;

                        // apply impulse from contact; the offsets are the same
                        // vertex-minus-position subtractions the classic form
                        // wrote inline
                        if (bCanMove[slotA] === 1) {
                            bPosPrevX[slotA] += vImpulseX * bInvMass[slotA];
                            bPosPrevY[slotA] += vImpulseY * bInvMass[slotA];
                            bAnglePrev[slotA] += bInvInertia[slotA] * (
                                vOffsetAX * vImpulseY - vOffsetAY * vImpulseX
                            );
                        }

                        if (bCanMove[slotB] === 1) {
                            bPosPrevX[slotB] -= vImpulseX * bInvMass[slotB];
                            bPosPrevY[slotB] -= vImpulseY * bInvMass[slotB];
                            bAnglePrev[slotB] -= bInvInertia[slotB] * (
                                vOffsetBX * vImpulseY - vOffsetBY * vImpulseX
                            );
                        }
                    }

                    vContactIndex++;
                }
            }

            if (cRefs.length !== vContactIndex) {
                cRefs.length = vContactIndex;
            }

            soaV.pairCount = aPairCount;
            soaV.contactTotal = vContactIndex;
            soaV.bodyCount = bodyCount;
            soaV.epoch = container._solverEpoch;
            soaV.dirty = true;

            return;
        }

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
     * Applies the velocity-solve results captured in the flat snapshot back to
     * the bodies (positionPrev, anglePrev) and contacts (warm-start impulses).
     * Only meaningful after a container-path `preSolveVelocity` /
     * `solveVelocity` sequence; a no-op otherwise.
     * @method postSolveVelocity
     * @param {pairs} container The engine's pairs structure for scratch state
     */
    Resolver.postSolveVelocity = function(container) {
        var soaV = container._soaV;

        if (!soaV || !soaV.dirty || soaV.epoch !== container._solverEpoch) {
            return;
        }

        var solverBodies = container._solverBodies,
            bodyCount = soaV.bodyCount,
            bPosPrevX = soaV.bPosPrevX,
            bPosPrevY = soaV.bPosPrevY,
            bAnglePrev = soaV.bAnglePrev,
            contactTotal = soaV.contactTotal,
            cRefs = soaV.cRefs,
            cNormalImpulse = soaV.cNormalImpulse,
            cTangentImpulse = soaV.cTangentImpulse,
            i;

        soaV.dirty = false;

        // a body the velocity solve could not move (static or sleeping, per
        // the snapshot flag; nothing wakes bodies between the snapshot and
        // here) has unchanged values, so its write-back is skipped outright
        var bCanMove = soaV.bCanMove;
        for (i = 0; i < bodyCount; i++) {
            if (bCanMove[i] === 0) {
                continue;
            }

            var writeBody = solverBodies[i],
                writeBodyPositionPrev = writeBody.positionPrev;
            writeBodyPositionPrev.x = bPosPrevX[i];
            writeBodyPositionPrev.y = bPosPrevY[i];
            writeBody.anglePrev = bAnglePrev[i];
        }

        for (i = 0; i < contactTotal; i++) {
            var writeContact = cRefs[i];
            writeContact.normalImpulse = cNormalImpulse[i];
            writeContact.tangentImpulse = cTangentImpulse[i];
        }
    };

    /**
     * Find a solution for pair velocities.
     *
     * When the optional `container` (prepared by the container-path
     * `preSolveVelocity` this step) is given, the iteration runs over the flat
     * snapshot built there; `postSolveVelocity` writes the results back.
     * @method solveVelocity
     * @param {pair[]} pairs
     * @param {number} delta
     * @param {pairs} [container] The engine's pairs structure for scratch state
     */
    Resolver.solveVelocity = function(pairs, delta, container) {
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

        var soaV = container && container._soaV;
        if (soaV && soaV.dirty && soaV.epoch === container._solverEpoch) {
            var pairCount = soaV.pairCount,
                vIdxA = soaV.idxA,
                vIdxB = soaV.idxB,
                vNx = soaV.nx,
                vNy = soaV.ny,
                vFrictionTimesStatic = soaV.frictionTimesStatic,
                vFriction = soaV.friction,
                vRestitutionPlus1 = soaV.restitutionPlus1,
                vSeparation = soaV.separation,
                vContactCounts = soaV.contactCounts,
                cOffAX = soaV.cOffAX,
                cOffAY = soaV.cOffAY,
                cOffBX = soaV.cOffBX,
                cOffBY = soaV.cOffBY,
                cShare = soaV.cShare,
                cNormalImpulse = soaV.cNormalImpulse,
                cTangentImpulse = soaV.cTangentImpulse,
                bPosX = soaV.bPosX,
                bPosY = soaV.bPosY,
                bPosPrevX = soaV.bPosPrevX,
                bPosPrevY = soaV.bPosPrevY,
                bAngle = soaV.bAngle,
                bAnglePrev = soaV.bAnglePrev,
                bInvMass = soaV.bInvMass,
                bInvInertia = soaV.bInvInertia,
                bCanMove = soaV.bCanMove;

            // the contact block of pair p follows pair p-1's, exactly as
            // preSolveVelocity laid them down, so the start index is carried
            // rather than stored per pair
            var contactStart = 0;

            for (var p = 0; p < pairCount; p++) {
                var ia = vIdxA[p],
                    ib = vIdxB[p],
                    normalX = vNx[p],
                    normalY = vNy[p],
                    // exactly the values preSolveVelocity derived, from the
                    // same normal, so the negation reproduces them bit for bit
                    tangentX = -normalY,
                    tangentY = normalX,
                    friction = vFrictionTimesStatic[p] * frictionNormalMultiplier,
                    pairSeparation = vSeparation[p],
                    pairFriction = vFriction[p],
                    restitutionPlus1 = vRestitutionPlus1[p],
                    contactEnd = contactStart + vContactCounts[p];

                // cache body properties that are invariant across the contact loop
                var bodyAPositionX = bPosX[ia],
                    bodyAPositionY = bPosY[ia],
                    bodyBPositionX = bPosX[ib],
                    bodyBPositionY = bPosY[ib],
                    bodyAInverseMass = bInvMass[ia],
                    bodyBInverseMass = bInvMass[ib],
                    bodyAInverseInertia = bInvInertia[ia],
                    bodyBInverseInertia = bInvInertia[ib],
                    bodyACanMove = bCanMove[ia] === 1,
                    bodyBCanMove = bCanMove[ib] === 1;

                // get body velocities
                var bodyAVelocityX = bodyAPositionX - bPosPrevX[ia],
                    bodyAVelocityY = bodyAPositionY - bPosPrevY[ia],
                    bodyAAngularVelocity = bAngle[ia] - bAnglePrev[ia],
                    bodyBVelocityX = bodyBPositionX - bPosPrevX[ib],
                    bodyBVelocityY = bodyBPositionY - bPosPrevY[ib],
                    bodyBAngularVelocity = bAngle[ib] - bAnglePrev[ib];

                // resolve each contact
                for (var c = contactStart; c < contactEnd; c++) {
                    // offsets and the share divide are constants of the
                    // iterations, precomputed in preSolveVelocity
                    var offsetAX = cOffAX[c],
                        offsetAY = cOffAY[c],
                        offsetBX = cOffBX[c],
                        offsetBY = cOffBY[c];

                    var velocityPointAX = bodyAVelocityX - offsetAY * bodyAAngularVelocity,
                        velocityPointAY = bodyAVelocityY + offsetAX * bodyAAngularVelocity,
                        velocityPointBX = bodyBVelocityX - offsetBY * bodyBAngularVelocity,
                        velocityPointBY = bodyBVelocityY + offsetBX * bodyBAngularVelocity;

                    var relativeVelocityX = velocityPointAX - velocityPointBX,
                        relativeVelocityY = velocityPointAY - velocityPointBY;

                    var normalVelocity = normalX * relativeVelocityX + normalY * relativeVelocityY,
                        tangentVelocity = tangentX * relativeVelocityX + tangentY * relativeVelocityY;

                    // coulomb friction
                    var normalOverlap = pairSeparation + normalVelocity;
                    var normalForce = normalOverlap < 1 ? normalOverlap : 1;
                    normalForce = normalOverlap < 0 ? 0 : normalForce;

                    var frictionLimit = normalForce * friction;

                    if (tangentVelocity < -frictionLimit || tangentVelocity > frictionLimit) {
                        maxFriction = (tangentVelocity > 0 ? tangentVelocity : -tangentVelocity);
                        tangentImpulse = pairFriction * (tangentVelocity > 0 ? 1 : -1) * timeScaleCubed;

                        if (tangentImpulse < -maxFriction) {
                            tangentImpulse = -maxFriction;
                        } else if (tangentImpulse > maxFriction) {
                            tangentImpulse = maxFriction;
                        }
                    } else {
                        tangentImpulse = tangentVelocity;
                        maxFriction = frictionMaxStatic;
                    }

                    // raw impulses (share was precomputed with the identical
                    // mass, inertia and contact offset association)
                    var share = cShare[c];
                    var normalImpulse = restitutionPlus1 * normalVelocity * share;
                    tangentImpulse *= share;

                    // handle high velocity and resting collisions separately
                    if (normalVelocity < restingThresh) {
                        // high normal velocity so clear cached contact normal impulse
                        cNormalImpulse[c] = 0;
                    } else {
                        // solve resting collision constraints using Erin Catto's method (GDC08)
                        // impulse constraint tends to 0
                        var contactNormalImpulse = cNormalImpulse[c];
                        cNormalImpulse[c] = contactNormalImpulse + normalImpulse;
                        if (cNormalImpulse[c] > 0) cNormalImpulse[c] = 0;
                        normalImpulse = cNormalImpulse[c] - contactNormalImpulse;
                    }

                    // handle high velocity and resting collisions separately
                    if (tangentVelocity < -restingThreshTangent || tangentVelocity > restingThreshTangent) {
                        // high tangent velocity so clear cached contact tangent impulse
                        cTangentImpulse[c] = 0;
                    } else {
                        // solve resting collision constraints using Erin Catto's method (GDC08)
                        // tangent impulse tends to -tangentSpeed or +tangentSpeed
                        var contactTangentImpulse = cTangentImpulse[c];
                        cTangentImpulse[c] = contactTangentImpulse + tangentImpulse;
                        if (cTangentImpulse[c] < -maxFriction) cTangentImpulse[c] = -maxFriction;
                        if (cTangentImpulse[c] > maxFriction) cTangentImpulse[c] = maxFriction;
                        tangentImpulse = cTangentImpulse[c] - contactTangentImpulse;
                    }

                    // total impulse from contact
                    var impulseX = normalX * normalImpulse + tangentX * tangentImpulse,
                        impulseY = normalY * normalImpulse + tangentY * tangentImpulse;

                    // apply impulse from contact
                    if (bodyACanMove) {
                        bPosPrevX[ia] += impulseX * bodyAInverseMass;
                        bPosPrevY[ia] += impulseY * bodyAInverseMass;
                        bAnglePrev[ia] += (offsetAX * impulseY - offsetAY * impulseX) * bodyAInverseInertia;
                    }

                    if (bodyBCanMove) {
                        bPosPrevX[ib] -= impulseX * bodyBInverseMass;
                        bPosPrevY[ib] -= impulseY * bodyBInverseMass;
                        bAnglePrev[ib] -= (offsetBX * impulseY - offsetBY * impulseX) * bodyBInverseInertia;
                    }
                }

                contactStart = contactEnd;
            }

            return;
        }

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
