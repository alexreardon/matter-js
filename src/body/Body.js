/**
* The `Matter.Body` module contains methods for creating and manipulating rigid bodies.
* For creating bodies with common configurations such as rectangles, circles and other polygons see the module `Matter.Bodies`.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).

* @class Body
*/

var Body = {};

module.exports = Body;

var Vertices = require('../geometry/Vertices');
var Vector = require('../geometry/Vector');
// assigned after the IIFE below, see there
var Sleeping;
var Common = require('../core/Common');
var Bounds = require('../geometry/Bounds');
var Axes = require('../geometry/Axes');

(function() {

    Body._timeCorrection = true;
    Body._inertiaScale = 4;
    Body._nextCollidingGroupId = 1;
    Body._nextNonCollidingGroupId = -1;
    Body._nextCategory = 0x0001;
    Body._baseDelta = 1000 / 60;

    // box tag tolerances (see Body._updateBoxTag). The axes come out of
    // Axes.fromVertices normalised, so a real box is unit and orthogonal to
    // float precision (~1e-16); the corner test is in world units, far above
    // the ~1e-11 a centred, translated rectangle carries and far below any
    // non-box shape
    Body._boxAxisTolerance = 1e-9;
    Body._boxCornerTolerance = 1e-6;

    // per-corner scratch for Body._updateBoxTag, filled before it is read
    var _boxTagOffsets0 = [0, 0, 0, 0],
        _boxTagOffsets1 = [0, 0, 0, 0];

    /**
     * Creates a new rigid body model. The options parameter is an object that specifies any properties you wish to override the defaults.
     * All properties have default values, and many are pre-calculated automatically based on other properties.
     * Vertices must be specified in clockwise order.
     * See the properties section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {} options
     * @return {body} body
     */
    Body.create = function(options) {
        var defaults = {
            id: Common.nextId(),
            type: 'body',
            label: 'Body',
            parts: [],
            plugin: {},
            angle: 0,
            vertices: (options && options.vertices) || Vertices.fromPath('L 0 0 L 40 0 L 40 40 L 0 40'),
            position: { x: 0, y: 0 },
            force: { x: 0, y: 0 },
            torque: 0,
            positionImpulse: { x: 0, y: 0 },
            constraintImpulse: { x: 0, y: 0, angle: 0 },
            totalContacts: 0,
            speed: 0,
            angularSpeed: 0,
            velocity: { x: 0, y: 0 },
            angularVelocity: 0,
            isSensor: false,
            motion: 0,
            sleepThreshold: 60,
            density: 0.001,
            restitution: 0,
            friction: 0.1,
            frictionStatic: 0.5,
            frictionAir: 0.01,
            collisionFilter: {
                category: 0x0001,
                mask: 0xFFFFFFFF,
                group: 0
            },
            slop: 0.05,
            timeScale: 1,
            render: {
                visible: true,
                opacity: 1,
                strokeStyle: null,
                fillStyle: null,
                lineWidth: null,
                sprite: {
                    xScale: 1,
                    yScale: 1,
                    xOffset: 0,
                    yOffset: 0
                }
            },
            events: null,
            bounds: null,
            chamfer: null,
            circleRadius: 0,
            positionPrev: null,
            anglePrev: 0,
            parent: null,
            axes: null,
            area: 0,
            mass: 0,
            // assigned by Body.setMass / setInertia / Sleeping before use, but
            // declared here so they live in-object: left out, they spill to
            // the out-of-object property backing store and every read (the
            // solver snapshots them per body per step, Pair.update per pair)
            // pays an extra indirection
            inverseMass: 0,
            inertia: 0,
            inverseInertia: 0,
            sleepCounter: 0,
            deltaTime: 1000 / 60,
            _original: null,
            // per-step scratch stamps and flags used by the grid broadphase
            // and the resolver body collection. Pre-declared so every body
            // shares one hidden class: adding any of these lazily at first use
            // splits body object shapes and degrades every hot property access
            // site engine-wide (measured 1.3-4.8x slower whole-step when
            // _solverStamp was added lazily to only pair-touched bodies).
            // RULE: any NEW per-body scratch field, from any module, must be
            // added to this block with a default of the same type it will
            // hold, never assigned onto a body for the first time elsewhere.
            //
            // Classification-walk cluster: the per-step walk in
            // Detector._collisionsGrid touches every one of these for
            // every body in the world, so they are declared adjacently
            // (declaration order fixes the in-object layout) to land on as few
            // cache lines as possible. isStatic / isSleeping live here rather
            // than with the public fields for the same reason.
            isStatic: false,
            isSleeping: false,
            // set, for good, when a pose setter moves this body while it rests
            // in a grid static index: the grid then runs it as a mover (see
            // Body._promoteIfIndexed)
            _sMoved: false,
            _sPrev: false,
            _sIndexed: false,
            _sDeparted: false,
            _sWalk: -1,
            _sWorldIndex: 0,
            _scEpoch: 0,
            _gsStamp: 0,
            // set when an engine running with `enableSolvedVelocityAndBounds`
            // false skipped this body's bounds refresh after a position
            // correction: its bounds MAY lag its vertices until integration
            // or `Body._updateStaleBounds` recomputes them. Never cleared by
            // integration (that would be a store per mover per update), which
            // is safe because the recompute is idempotent on fresh bounds.
            // (This slot held the dead grid `_ovD` flag, so reusing it
            // leaves the in-object layout of every field after it unchanged.)
            _boundsStale: false,
            _solverStamp: 0,
            // slot index into the resolver's flat solver arrays (valid only
            // while _solverStamp matches the current solver epoch; 0 is the
            // shared row of a resting static, see Resolver.preSolvePosition)
            _solverIndex: 0,
            // grid static-candidate cache (see Detector._collisionsGrid;
            // _scEpoch is up in the classification-walk cluster)
            _scStatic: false,
            // the cell span the list was built for. The span is read out of a
            // Float64Array, so these hold doubles, and they are declared as
            // doubles (NaN): with a small-integer default, the first store
            // generalizes the field in V8 and DEPRECATES the map of every body
            // built before it, each of which then keeps the old map until
            // something next reads it. Never read while `_scList` is null
            _scCx0: NaN,
            _scCx1: NaN,
            _scCy0: NaN,
            _scCy1: NaN,
            _scList: null,
            // the candidate bounds captured alongside _scList, so the per-step
            // test loop reads contiguous memory instead of dereferencing every
            // candidate's bounds objects
            _scBounds: null,
            // grid static-index membership (see
            // Detector._staticIndexInsert). _sBuckets holds the cell buckets
            // this body's reference sits in, so it can be removed from them
            // without recomputing anything; an EMPTY array means an oversized
            // static, which occupies no cells. _sIndexed is whether it is in
            // the index at all, _sWalk the stamp of the last classification
            // walk that saw it (a stale stamp means it has left the world; it
            // doubles as the body journal's membership generation, and is -1
            // for a body in no world, see Common._journalTouch),
            // _sWorldIndex its position in that walk, which is the sort key
            // that keeps bucket contents in world order, and _sDeparted a
            // one-shot set by Composite.removeBody so a body removed and
            // re-added within a single step is re-indexed at its new position.
            // (_sIndexed / _sWalk / _sWorldIndex / _sDeparted are up in the
            // classification-walk cluster.)
            _sBuckets: null,
            _sIndexedAt: -1,
            // the cell span this body was BUCKETED at. Unbucketing has to know
            // which cells it vacated in order to invalidate the movers standing
            // over them, and by then its live bounds no longer say: a released
            // tile has already been integrated by Engine._bodiesUpdate before
            // the broadphase runs
            _sCx0: 0,
            _sCx1: 0,
            _sCy0: 0,
            _sCy1: 0,
            // Box tag, read by Collision.collides to choose the fused box-box
            // SAT and the closed-form support search (see
            // Body._updateBoxTag). _boxCorners is -1 unless this body is
            // geometrically a rectangle centred on `position`; then it packs
            // which vertex sits on which side of each axis. Declared BEFORE the
            // memo so the last key is unchanged.
            _boxHalf0: 0,
            _boxHalf1: 0,
            _boxCorners: -1,
            // Collision._selfProjection memo: this body's own vertices projected
            // onto its own axes, packed flat as [min0, max0, min1, max1, ...],
            // one pair per axis. _spValid is cleared by every site that moves a
            // vertex or changes the axes (see Vertices.translate/rotate/scale,
            // Body.setVertices/setParts/scale and the inlined rotate in
            // Body.setPositionAndAngle)
            _sp: null,
            _spValid: false,
            // whether the velocity solver may take this body's row as the
            // constant REST row without reading the body: static, not moving,
            // and an inverse inertia of exactly +0 (see
            // Common._isRestingStatic). Written by every method below that
            // changes one of those, and by the position correction in
            // Resolver. Declared after every field the engine had before the
            // body journal, so each of those keeps its place
            _restStatic: false,
            // the composite whose body journal this body is recorded in (see
            // Common._journalTouch); a member while `_sWalk` also matches that
            // composite's `_memberGen`. Read only by the journal's own paths
            // and, in a full classification walk, only for a body the world's
            // last walk did not stamp (see Composite._ownedGen), so it needs no
            // place in the cluster above. Declared LAST so every field above
            // keeps its place
            _sOwner: null,
            // the grid index (a grid detector's `_sgrid`) that _sBuckets and
            // _sIndexedAt describe while _sIndexed, so a body moved to a world
            // another grid engine steps is taken out of the first one's index
            // rather than confusing the two (see Detector._staticIndexInsert).
            // Declared LAST, after _sOwner, so every field above keeps its place
            _sGrid: null
        };

        var body = Common.extend(defaults, options);

        _initProperties(body, options);

        return body;
    };

    /**
     * Returns the next unique group index for which bodies will collide.
     * If `isNonColliding` is `true`, returns the next unique group index for which bodies will _not_ collide.
     * See `body.collisionFilter` for more information.
     * @method nextGroup
     * @param {bool} [isNonColliding=false]
     * @return {Number} Unique group index
     */
    Body.nextGroup = function(isNonColliding) {
        if (isNonColliding)
            return Body._nextNonCollidingGroupId--;

        return Body._nextCollidingGroupId++;
    };

    /**
     * Returns the next unique category bitfield (starting after the initial default category `0x0001`).
     * There are 32 available. See `body.collisionFilter` for more information.
     * @method nextCategory
     * @return {Number} Unique category bitfield
     */
    Body.nextCategory = function() {
        Body._nextCategory = Body._nextCategory << 1;
        return Body._nextCategory;
    };

    /**
     * Initialises body properties.
     * @method _initProperties
     * @private
     * @param {body} body
     * @param {} [options]
     */
    // Hoisted out of `_initProperties`: it allocated a fresh five element array per body created.
    // The `Common.choose` call site is unchanged, so the RNG stream and the chosen colours are
    // identical.
    var _defaultFillStyles = ['#f19648', '#f5d259', '#f55a3c', '#063e7b', '#ececd1'];

    var _initProperties = function(body, options) {
        options = options || {};

        // init required properties (order is important)
        Body.set(body, {
            bounds: body.bounds || Bounds.create(body.vertices),
            positionPrev: body.positionPrev || Vector.clone(body.position),
            anglePrev: body.anglePrev || body.angle,
            vertices: body.vertices,
            parts: body.parts || [body],
            isStatic: body.isStatic,
            isSleeping: body.isSleeping,
            parent: body.parent || body
        });

        Vertices.rotate(body.vertices, body.angle, body.position);
        Axes.rotate(body.axes, body.angle);
        Bounds.update(body.bounds, body.vertices, body.velocity);

        // allow options to override the automatically calculated properties
        Body.set(body, {
            axes: options.axes || body.axes,
            area: options.area || body.area,
            mass: options.mass || body.mass,
            inertia: options.inertia || body.inertia
        });

        // render properties
        var defaultFillStyle = (body.isStatic ? '#14151f' : Common.choose(_defaultFillStyles)),
            defaultStrokeStyle = body.isStatic ? '#555' : '#ccc',
            defaultLineWidth = body.isStatic && body.render.fillStyle === null ? 1 : 0;
        body.render.fillStyle = body.render.fillStyle || defaultFillStyle;
        body.render.strokeStyle = body.render.strokeStyle || defaultStrokeStyle;
        body.render.lineWidth = body.render.lineWidth || defaultLineWidth;
        body.render.sprite.xOffset += -(body.bounds.min.x - body.position.x) / (body.bounds.max.x - body.bounds.min.x);
        body.render.sprite.yOffset += -(body.bounds.min.y - body.position.y) / (body.bounds.max.y - body.bounds.min.y);
    };

    /**
     * Given a property and a value (or map of), sets the property(s) on the body, using the appropriate setter functions if they exist.
     * Prefer to use the actual setter functions in performance critical situations.
     * @method set
     * @param {body} body
     * @param {} settings A property name (or map of properties and values) to set on the body.
     * @param {} value The value to set if `settings` is a single property name.
     */
    Body.set = function(body, settings, value) {
        var property;

        if (typeof settings === 'string') {
            property = settings;
            settings = {};
            settings[property] = value;
        }

        for (property in settings) {
            if (!Object.prototype.hasOwnProperty.call(settings, property))
                continue;

            value = settings[property];
            switch (property) {

            case 'isStatic':
                Body.setStatic(body, value);
                break;
            case 'isSleeping':
                Sleeping.set(body, value);
                break;
            case 'mass':
                Body.setMass(body, value);
                break;
            case 'density':
                Body.setDensity(body, value);
                break;
            case 'inertia':
                Body.setInertia(body, value);
                break;
            case 'vertices':
                Body.setVertices(body, value);
                break;
            case 'position':
                Body.setPosition(body, value);
                break;
            case 'angle':
                Body.setAngle(body, value);
                break;
            case 'velocity':
                Body.setVelocity(body, value);
                break;
            case 'angularVelocity':
                Body.setAngularVelocity(body, value);
                break;
            case 'speed':
                Body.setSpeed(body, value);
                break;
            case 'angularSpeed':
                Body.setAngularSpeed(body, value);
                break;
            case 'parts':
                Body.setParts(body, value);
                break;
            case 'axes':
                // same assignment the default branch makes, plus the
                // self-projection memo invalidation replacing axes needs, and
                // the box tag, which is derived from the axes. `_initProperties`
                // always sets `axes` last among the geometry, so this is also
                // where a new body takes its tag on its finished geometry
                body.axes = value;
                body._spValid = false;
                Body._updateBoxTag(body);
                break;
            case 'centre':
                Body.setCentre(body, value);
                break;
            default:
                body[property] = value;

                // a plain assignment can be to a field the rest row stands
                // for (`positionPrev`, `anglePrev`, `inverseInertia`)
                if (body._restStatic === true) {
                    body._restStatic = Common._isRestingStatic(body);
                }

            }
        }
    };

    /**
     * Recomputes the bounds of every part of `body` from its current vertices
     * and velocity, if an engine running with `enableSolvedVelocityAndBounds`
     * false left them possibly stale (see `body._boundsStale`). Called before a
     * body stops being integrated, so the detector never reads a stale box.
     * @method _updateStaleBounds
     * @private
     * @param {body} body
     */
    Body._updateStaleBounds = function(body) {
        if (!body._boundsStale) {
            return;
        }

        var parts = body.parts,
            velocity = body.velocity;

        for (var i = 0; i < parts.length; i++) {
            Bounds.update(parts[i].bounds, parts[i].vertices, velocity);
        }

        body._boundsStale = false;
    };

    /**
     * Promotes `body` to a mover of the grid broadphase when it is a resting
     * body (static or asleep) that a grid detector already holds in its static
     * index, and the setter that just ran changed its bounds. Every setter that
     * moves or reshapes a body calls this after the move, with the bounds it
     * had before (`setPosition`, `setAngle`, `setPositionAndAngle`,
     * `scale`, `setVertices`, and through them `translate`, `rotate`,
     * `setParts` and `Body.set`): the index captured the body's bounds when
     * it bucketed it, and would otherwise go on answering for the old pose.
     *
     * The bounds are the whole of what the index holds of a body (the cells
     * it covers, and the bounds each mover caches with its candidates), so a
     * setter that leaves them exactly as they were (`setPosition` to where
     * the body is, `translate` by zero, `setAngle` to its angle,
     * `scale(1, 1)` about its position) promotes nothing, as
     * `setPositionAndAngle` with nothing changed never did.
     *
     * A promoted body stays a mover while it rests (`_sMoved`); a real change
     * of rest (`Body.setStatic` or `Sleeping.set` flipping its flag) ends
     * the promotion (see Body._endPromotion). The promotion is recorded
     * exactly as any change of role is: the static epoch moves, and the body
     * goes in its world's body journal (see
     * Common._bodyStaticEpoch and Common._journalTouch). A resting body moved
     * before any grid step has indexed it needs none of this, and is simply
     * indexed at its new pose; so does one removed from its world since the
     * grid last classified it (`_sDeparted`), which the next classification
     * takes out of the index whether or not it is added back.
     *
     * A body released (or woken) since the grid last classified it is still in
     * the index, and a setter can move it before the next classification. If
     * it is still moving then, that classification takes it out of the index;
     * but if it rests again first, nothing else would, and the index would go
     * on answering for the pose it was released from. So its move marks it as
     * a removal does (`_sDeparted`), and the next classification takes it out
     * and indexes it again wherever it rests. On the sweep nothing is ever
     * indexed, so this is one field read.
     * @method _promoteIfIndexed
     * @private
     * @param {body} body
     * @param {number} minX the body's `bounds.min.x` before the setter ran
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     */
    Body._promoteIfIndexed = function(body, minX, minY, maxX, maxY) {
        if (body._sIndexed !== true || body._sMoved === true || body._sDeparted === true) {
            return;
        }

        var bounds = body.bounds;

        if (bounds.min.x === minX && bounds.min.y === minY && bounds.max.x === maxX && bounds.max.y === maxY) {
            return;
        }

        // released or woken since the grid indexed it: re-indexed where it
        // rests, if it rests again before the grid next classifies it. The
        // release already journaled it, which is what reads the mark
        if (!(body.isStatic || body.isSleeping)) {
            body._sDeparted = true;
            return;
        }

        body._sMoved = true;
        Common._bodyStaticEpoch++;
        Common._journalTouch(body);
    };

    /**
     * Ends a grid promotion (see Body._promoteIfIndexed) on a real change of
     * rest: `Body.setStatic` or `Sleeping.set` flipping the body's flag,
     * which journals it and moves the static epoch, so the grid classifies it
     * afresh. A body promoted while it rested is a mover only while that rest
     * lasts: released it is a mover anyway, and resting again it is indexed
     * where it rests, rather than staying a mover for good (a teleported
     * sleeper, a scrolled pane piece frozen again after a release). A body
     * promoted since the grid last classified it is still in the index at the
     * pose it was promoted from, so it is marked as a removal marks a body
     * (`_sDeparted`), and the next classification takes it out and indexes
     * it again if it rests.
     * @method _endPromotion
     * @private
     * @param {body} body
     */
    Body._endPromotion = function(body) {
        if (body._sMoved !== true) {
            return;
        }

        body._sMoved = false;

        if (body._sIndexed === true) {
            body._sDeparted = true;
        }
    };

    /**
     * Ends the grid promotion a body frozen while carrying a warmed position
     * impulse took (see Body.setStatic), once the resolver has cleared that
     * impulse and so stopped moving it: the body is indexed where the drift
     * left it. Recorded as any change of role is, the static epoch moved and
     * the body journaled, since nothing else is happening to it that would.
     * A promotion a setter made ends here too, if the body also carried an
     * impulse; its next move promotes it again.
     * @method _driftEnded
     * @private
     * @param {body} body
     */
    Body._driftEnded = function(body) {
        if (body._sMoved !== true || !(body.isStatic || body.isSleeping)) {
            return;
        }

        Body._endPromotion(body);
        Common._bodyStaticEpoch++;
        Common._journalTouch(body);
    };

    /**
     * Sets the body as static, including isStatic flag and setting mass and inertia to Infinity.
     * @method setStatic
     * @param {body} body
     * @param {bool} isStatic
     */
    Body.setStatic = function(body, isStatic) {
        // a static body is never integrated again, so bring bounds an engine
        // deferred up to date first, while velocity still holds what they
        // would have been padded by
        if (isStatic) {
            Body._updateStaleBounds(body);
        }

        // a real change of rest ends a grid promotion (see Body._endPromotion)
        if (!body.isStatic !== !isStatic) {
            Body._endPromotion(body);
        }

        // frozen while carrying a warmed position impulse, which this does not
        // clear (upstream does not): the resolver goes on moving the body
        // until the impulse decays, about 90 updates and a few pixels (up to
        // tens), and nothing reports those moves. So the grid runs it as a
        // mover from the start, as it runs a static a setter moves, and
        // indexes it where it stops (see Body._driftEnded)
        if (isStatic && (body.positionImpulse.x !== 0 || body.positionImpulse.y !== 0)) {
            body._sMoved = true;
        }

        for (var i = 0; i < body.parts.length; i++) {
            var part = body.parts[i];

            if (isStatic) {
                if (!part.isStatic) {
                    part._original = {
                        restitution: part.restitution,
                        friction: part.friction,
                        mass: part.mass,
                        inertia: part.inertia,
                        density: part.density,
                        inverseMass: part.inverseMass,
                        inverseInertia: part.inverseInertia
                    };
                }

                part.restitution = 0;
                part.friction = 1;
                part.mass = part.inertia = part.density = Infinity;
                part.inverseMass = part.inverseInertia = 0;

                part.positionPrev.x = part.position.x;
                part.positionPrev.y = part.position.y;
                part.anglePrev = part.angle;
                // zero the cached velocity so a resting body reads as stopped
                // even though Engine no longer recomputes its velocity each step
                part.velocity.x = 0;
                part.velocity.y = 0;
                part.angularVelocity = 0;
                part.speed = 0;
                part.angularSpeed = 0;
                part.motion = 0;
            } else if (part._original) {
                part.restitution = part._original.restitution;
                part.friction = part._original.friction;
                part.mass = part._original.mass;
                part.inertia = part._original.inertia;
                part.density = part._original.density;
                part.inverseMass = part._original.inverseMass;
                part.inverseInertia = part._original.inverseInertia;

                part._original = null;
            }

            // Engine clears force buffers for moving bodies only, so a force
            // applied while this body was resting must be dropped here rather
            // than surviving into the step after a release
            part.force.x = 0;
            part.force.y = 0;
            part.torque = 0;

            part.isStatic = isStatic;

            // freezing establishes the rest row (positionPrev and anglePrev
            // were just set to position and angle, and inverseInertia to 0)
            // unless the position is not finite; releasing clears it
            part._restStatic = Common._isRestingStatic(part);
        }

        // invalidate the cached mover lists in Engine and the grid
        // broadphase (see Common._bodyStaticEpoch), and record the body in its
        // world's body journal (see Common._journalTouch)
        Common._bodyStaticEpoch++;
        Common._journalTouch(body);
    };

    /**
     * Sets the mass of the body. Inverse mass, density and inertia are automatically updated to reflect the change.
     * @method setMass
     * @param {body} body
     * @param {number} mass
     */
    Body.setMass = function(body, mass) {
        var moment = body.inertia / (body.mass / 6);
        body.inertia = moment * (mass / 6);
        body.inverseInertia = 1 / body.inertia;

        body.mass = mass;
        body.inverseMass = 1 / body.mass;
        body.density = body.mass / body.area;

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Sets the density of the body. Mass and inertia are automatically updated to reflect the change.
     * @method setDensity
     * @param {body} body
     * @param {number} density
     */
    Body.setDensity = function(body, density) {
        Body.setMass(body, density * body.area);
        body.density = density;
    };

    /**
     * Sets the moment of inertia of the body. This is the second moment of area in two dimensions.
     * Inverse inertia is automatically updated to reflect the change. Mass is not changed.
     * @method setInertia
     * @param {body} body
     * @param {number} inertia
     */
    Body.setInertia = function(body, inertia) {
        body.inertia = inertia;
        body.inverseInertia = 1 / body.inertia;

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Takes the box tag that `Collision.collides` reads to choose the fused
     * box-box separating-axis test (`Collision._overlapBoxes`) and the
     * closed-form support search (`Collision._findSupportsBox`): `_boxCorners`,
     * `_boxHalf0` and `_boxHalf1` (see `Body.create`).
     *
     * The tag is decided by ACTUAL geometry, never by the factory that built
     * the body: four vertices, two unit and mutually orthogonal axes, one part,
     * and every corner sitting at plus or minus the half extent on both axes
     * about `position`. That last test is what rejects a parallelogram (two
     * axes, four vertices, not a box), a compound parent (four hull corners
     * about a centre of mass that is not the hull's centre), and a body whose
     * centre was moved off its vertices by `Body.setCentre`. The vertex ring
     * must also walk the perimeter, never a diagonal, because the support
     * search reads a corner's two ring neighbours as its two box neighbours.
     *
     * Rotation and translation move the vertices, the axes and `position`
     * together, so they change none of this; only the mutators that reshape a
     * body call here.
     * @method _updateBoxTag
     * @private
     * @param {body} body
     */
    Body._updateBoxTag = function(body) {
        var vertices = body.vertices,
            axes = body.axes;

        body._boxCorners = -1;
        body._boxHalf0 = 0;
        body._boxHalf1 = 0;

        if (body.parts.length !== 1 || !vertices || vertices.length !== 4 || !axes || axes.length !== 2) {
            return;
        }

        var axis0X = axes[0].x,
            axis0Y = axes[0].y,
            axis1X = axes[1].x,
            axis1Y = axes[1].y;

        if (Math.abs(axis0X * axis0X + axis0Y * axis0Y - 1) > Body._boxAxisTolerance
            || Math.abs(axis1X * axis1X + axis1Y * axis1Y - 1) > Body._boxAxisTolerance
            || Math.abs(axis0X * axis1X + axis0Y * axis1Y) > Body._boxAxisTolerance) {
            return;
        }

        var positionX = body.position.x,
            positionY = body.position.y,
            offsets0 = _boxTagOffsets0,
            offsets1 = _boxTagOffsets1,
            min0 = 0,
            max0 = 0,
            min1 = 0,
            max1 = 0,
            k;

        for (k = 0; k < 4; k++) {
            // the support search walks neighbours by array position, the
            // general one by `vertex.index`; they must name the same vertex
            if (vertices[k].index !== k) {
                return;
            }

            var offsetX = vertices[k].x - positionX,
                offsetY = vertices[k].y - positionY,
                offset0 = offsetX * axis0X + offsetY * axis0Y,
                offset1 = offsetX * axis1X + offsetY * axis1Y;

            offsets0[k] = offset0;
            offsets1[k] = offset1;

            if (k === 0 || offset0 < min0) { min0 = offset0; }
            if (k === 0 || offset0 > max0) { max0 = offset0; }
            if (k === 0 || offset1 < min1) { min1 = offset1; }
            if (k === 0 || offset1 > max1) { max1 = offset1; }
        }

        var half0 = (max0 - min0) * 0.5,
            half1 = (max1 - min1) * 0.5,
            corners = 0,
            seen = 0,
            firstCode = 0,
            previousCode = 0;

        if (!(half0 > 0) || !(half1 > 0)) {
            return;
        }

        // the axis test above admits a shear of up to its tolerance, and a
        // parallelogram's corners project exactly to the half extents on its
        // own edge normals, so the corner test below cannot see it. What the
        // shear moves is a corner's ranking against the other axis, by about
        // the dot times the longer half extent: refuse it in world units, as
        // the corner test refuses everything else
        if ((half0 > half1 ? half0 : half1) * Math.abs(axis0X * axis1X + axis0Y * axis1Y) > Body._boxCornerTolerance) {
            return;
        }

        for (k = 0; k < 4; k++) {
            var side0 = offsets0[k],
                side1 = offsets1[k];

            if (Math.abs(Math.abs(side0) - half0) > Body._boxCornerTolerance
                || Math.abs(Math.abs(side1) - half1) > Body._boxCornerTolerance) {
                return;
            }

            var code = (side0 > 0 ? 1 : 0) | (side1 > 0 ? 2 : 0);

            // two corners in one quadrant about `position`: not a box about it
            if ((seen & (1 << code)) !== 0) {
                return;
            }

            // ring neighbours differ in exactly one side; both is a diagonal
            if (k === 0) {
                firstCode = code;
            } else if ((code ^ previousCode) === 3) {
                return;
            }

            previousCode = code;
            seen |= 1 << code;
            corners |= k << (code * 2);
        }

        if ((firstCode ^ previousCode) === 3) {
            return;
        }

        body._boxHalf0 = half0;
        body._boxHalf1 = half1;
        body._boxCorners = corners;
    };

    /**
     * Sets the body's vertices and updates body properties accordingly, including inertia, area and mass (with respect to `body.density`).
     * Vertices will be automatically transformed to be orientated around their centre of mass as the origin.
     * They are then automatically translated to world space based on `body.position`.
     *
     * The `vertices` argument should be passed as an array of `Matter.Vector` points (or a `Matter.Vertices` array).
     * Vertices must form a convex hull. Concave vertices must be decomposed into convex parts.
     * 
     * @method setVertices
     * @param {body} body
     * @param {vector[]} vertices
     */
    Body.setVertices = function(body, vertices) {
        // the bounds the grid may have indexed (see Body._promoteIfIndexed)
        var bounds = body.bounds,
            minX = bounds.min.x,
            minY = bounds.min.y,
            maxX = bounds.max.x,
            maxY = bounds.max.y;

        // change vertices
        if (vertices[0].body === body) {
            body.vertices = vertices;
        } else {
            body.vertices = Vertices.create(vertices, body);
        }

        // update properties
        body.axes = Axes.fromVertices(body.vertices);
        // both the vertices and the axes have been replaced, so the
        // self-projection memo is stale (and possibly the wrong length)
        body._spValid = false;
        body.area = Vertices.area(body.vertices);
        Body.setMass(body, body.density * body.area);

        // orient vertices around the centre of mass at origin (0, 0)
        var centre = Vertices.centre(body.vertices);
        Vertices.translate(body.vertices, centre, -1);

        // update inertia while vertices are at origin (0, 0)
        Body.setInertia(body, Body._inertiaScale * Vertices.inertia(body.vertices, body.mass));

        // update geometry
        Vertices.translate(body.vertices, body.position);
        Bounds.update(body.bounds, body.vertices, body.velocity);

        // both the vertices and the axes have been replaced
        Body._updateBoxTag(body);

        Body._promoteIfIndexed(body, minX, minY, maxX, maxY);
    };

    /**
     * Sets the parts of the `body`. 
     * 
     * See `body.parts` for details and requirements on how parts are used.
     * 
     * See Bodies.fromVertices for a related utility.
     * 
     * This function updates `body` mass, inertia and centroid based on the parts geometry.  
     * Sets each `part.parent` to be this `body`.  
     * 
     * The convex hull is computed and set on this `body` (unless `autoHull` is `false`).  
     * Automatically ensures that the first part in `body.parts` is the `body`.
     * @method setParts
     * @param {body} body
     * @param {body[]} parts
     * @param {bool} [autoHull=true]
     */
    Body.setParts = function(body, parts, autoHull) {
        var i;

        // the hull below rebuilds this body's vertices and axes, so the
        // self-projection memo is stale (and possibly the wrong length)
        body._spValid = false;

        // add all the parts, ensuring that the first part is always the parent body
        parts = parts.slice(0);
        body.parts.length = 0;
        body.parts.push(body);
        body.parent = body;

        for (i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part !== body) {
                part.parent = body;
                body.parts.push(part);
            }
        }

        // a compound parent is never a box: its position is the parts' centre
        // of mass, not its hull's centre, even when the hull has four corners
        Body._updateBoxTag(body);

        if (body.parts.length === 1)
            return;

        autoHull = typeof autoHull !== 'undefined' ? autoHull : true;

        // find the convex hull of all parts to set on the parent body
        if (autoHull) {
            var vertices = [];
            for (i = 0; i < parts.length; i++) {
                vertices = vertices.concat(parts[i].vertices);
            }

            Vertices.clockwiseSort(vertices);

            var hull = Vertices.hull(vertices),
                hullCentre = Vertices.centre(hull);

            Body.setVertices(body, hull);
            Vertices.translate(body.vertices, hullCentre);
        }

        // sum the properties of all compound parts of the parent body
        var total = Body._totalProperties(body);

        body.area = total.area;
        body.parent = body;
        body.position.x = total.centre.x;
        body.position.y = total.centre.y;
        body.positionPrev.x = total.centre.x;
        body.positionPrev.y = total.centre.y;

        Body.setMass(body, total.mass);
        Body.setInertia(body, total.inertia);
        Body.setPosition(body, total.centre);
    };

    /**
     * Set the centre of mass of the body. 
     * The `centre` is a vector in world-space unless `relative` is set, in which case it is a translation.
     * The centre of mass is the point the body rotates about and can be used to simulate non-uniform density.
     * This is equal to moving `body.position` but not the `body.vertices`.
     * Invalid if the `centre` falls outside the body's convex hull.
     * @method setCentre
     * @param {body} body
     * @param {vector} centre
     * @param {bool} relative
     */
    Body.setCentre = function(body, centre, relative) {
        if (!relative) {
            body.positionPrev.x = centre.x - (body.position.x - body.positionPrev.x);
            body.positionPrev.y = centre.y - (body.position.y - body.positionPrev.y);
            body.position.x = centre.x;
            body.position.y = centre.y;
        } else {
            body.positionPrev.x += centre.x;
            body.positionPrev.y += centre.y;
            body.position.x += centre.x;
            body.position.y += centre.y;
        }

        // `position` no longer sits at the centre of the vertices
        Body._updateBoxTag(body);

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Sets the position of the body. By default velocity is unchanged.
     * If `updateVelocity` is `true` then velocity is inferred from the change in position.
     * @method setPosition
     * @param {body} body
     * @param {vector} position
     * @param {boolean} [updateVelocity=false]
     */
    Body.setPosition = function(body, position, updateVelocity) {
        var delta = Vector.sub(position, body.position),
            // the bounds the grid may have indexed (see Body._promoteIfIndexed)
            bounds = body.bounds,
            minX = bounds.min.x,
            minY = bounds.min.y,
            maxX = bounds.max.x,
            maxY = bounds.max.y;

        if (updateVelocity) {
            body.positionPrev.x = body.position.x;
            body.positionPrev.y = body.position.y;
            body.velocity.x = delta.x;
            body.velocity.y = delta.y;
            body.speed = Vector.magnitude(delta);
        } else {
            body.positionPrev.x += delta.x;
            body.positionPrev.y += delta.y;
        }

        for (var i = 0; i < body.parts.length; i++) {
            var part = body.parts[i];
            part.position.x += delta.x;
            part.position.y += delta.y;
            Vertices.translate(part.vertices, delta);
            Bounds.update(part.bounds, part.vertices, body.velocity);
        }

        body._restStatic = Common._isRestingStatic(body);
        Body._promoteIfIndexed(body, minX, minY, maxX, maxY);
    };

    /**
     * Sets the angle of the body. By default angular velocity is unchanged.
     * If `updateVelocity` is `true` then angular velocity is inferred from the change in angle.
     * @method setAngle
     * @param {body} body
     * @param {number} angle
     * @param {boolean} [updateVelocity=false]
     */
    Body.setAngle = function(body, angle, updateVelocity) {
        var delta = angle - body.angle,
            // the bounds the grid may have indexed (see Body._promoteIfIndexed)
            bounds = body.bounds,
            minX = bounds.min.x,
            minY = bounds.min.y,
            maxX = bounds.max.x,
            maxY = bounds.max.y;
        
        if (updateVelocity) {
            body.anglePrev = body.angle;
            body.angularVelocity = delta;
            body.angularSpeed = Math.abs(delta);
        } else {
            body.anglePrev += delta;
        }

        for (var i = 0; i < body.parts.length; i++) {
            var part = body.parts[i];
            part.angle += delta;
            Vertices.rotate(part.vertices, delta, body.position);
            Axes.rotate(part.axes, delta);
            Bounds.update(part.bounds, part.vertices, body.velocity);
            if (i > 0) {
                Vector.rotateAbout(part.position, delta, body.position, part.position);
            }
        }

        body._restStatic = Common._isRestingStatic(body);
        Body._promoteIfIndexed(body, minX, minY, maxX, maxY);
    };

    /**
     * Sets both the position and angle of the body in a single fused pass,
     * equivalent to calling `Body.setPosition(body, { x, y })` then
     * `Body.setAngle(body, angle)` (angular/linear velocity are left unchanged).
     *
     * The stock two-call sequence walks the vertices twice and writes the bounds
     * twice, and the post-translate bounds write is dead work overwritten by the
     * post-rotate one. When BOTH axes move on a single-part body (the common
     * case for an authoritative pose writeback), this does one combined vertex
     * pass - translate, rotate about the new position, min/max scan - and one
     * bounds write, replicating the stock float ops in the stock order so the
     * resulting body state is bit-identical.
     *
     * A single-axis change (position OR angle only) and compound bodies fall
     * back to the stock setters: the fused rotate math is not bit-identical at a
     * zero angle delta (the translate-then-rotate roundtrip loses precision when
     * cos is exactly 1), and compound parts need per-part position bookkeeping.
     * @method setPositionAndAngle
     * @param {body} body
     * @param {number} x
     * @param {number} y
     * @param {number} angle
     */
    Body.setPositionAndAngle = function(body, x, y, angle) {
        var positionChanged = x !== body.position.x || y !== body.position.y,
            angleChanged = angle !== body.angle;

        if (!positionChanged || !angleChanged || body.parts.length > 1) {
            if (positionChanged) {
                Body.setPosition(body, { x: x, y: y });
            }
            if (angleChanged) {
                Body.setAngle(body, angle);
            }
            return;
        }

        // the bounds the grid may have indexed (see Body._promoteIfIndexed)
        var bounds = body.bounds,
            oldMinX = bounds.min.x,
            oldMinY = bounds.min.y,
            oldMaxX = bounds.max.x,
            oldMaxY = bounds.max.y;

        // The setPosition half: shift position and positionPrev by the delta.
        var deltaX = x - body.position.x,
            deltaY = y - body.position.y;

        body.positionPrev.x += deltaX;
        body.positionPrev.y += deltaY;
        body.position.x += deltaX;
        body.position.y += deltaY;

        // The setAngle half: shift angle and anglePrev; vertices rotate about the
        // NEW position, exactly as the stock call sequence does.
        var deltaAngle = angle - body.angle;

        body.anglePrev += deltaAngle;
        body.angle += deltaAngle;

        var cos = Math.cos(deltaAngle),
            sin = Math.sin(deltaAngle),
            pointX = body.position.x,
            pointY = body.position.y,
            vertices = body.vertices,
            verticesLength = vertices.length,
            minX = 0,
            maxX = 0,
            minY = 0,
            maxY = 0;

        // the vertex and axis writes below are inlined rather than routed
        // through Vertices.rotate / Axes.rotate, so invalidate here too
        body._spValid = false;

        for (var i = 0; i < verticesLength; i++) {
            var vertex = vertices[i],
                translatedX = vertex.x + deltaX,
                translatedY = vertex.y + deltaY,
                relativeX = translatedX - pointX,
                relativeY = translatedY - pointY,
                rotatedX = pointX + (relativeX * cos - relativeY * sin),
                rotatedY = pointY + (relativeX * sin + relativeY * cos);

            vertex.x = rotatedX;
            vertex.y = rotatedY;

            if (i === 0) {
                minX = maxX = rotatedX;
                minY = maxY = rotatedY;
                continue;
            }

            if (rotatedX > maxX) { maxX = rotatedX; } else if (rotatedX < minX) { minX = rotatedX; }
            if (rotatedY > maxY) { maxY = rotatedY; } else if (rotatedY < minY) { minY = rotatedY; }
        }

        // Axes.rotate, inlined (deltaAngle is nonzero on this path).
        var axes = body.axes,
            axesLength = axes.length;

        for (var j = 0; j < axesLength; j++) {
            var axis = axes[j],
                rotatedAxisX = axis.x * cos - axis.y * sin;

            axis.y = axis.x * sin + axis.y * cos;
            axis.x = rotatedAxisX;
        }

        // The Bounds.update speculative-contact expansion: grow toward the
        // current velocity direction, identical to the stock call.
        var velocity = body.velocity;

        if (velocity.x > 0) { maxX += velocity.x; } else { minX += velocity.x; }
        if (velocity.y > 0) { maxY += velocity.y; } else { minY += velocity.y; }

        bounds.min.x = minX;
        bounds.max.x = maxX;
        bounds.min.y = minY;
        bounds.max.y = maxY;

        body._restStatic = Common._isRestingStatic(body);
        Body._promoteIfIndexed(body, oldMinX, oldMinY, oldMaxX, oldMaxY);
    };

    /**
     * Sets the current linear velocity of the body.
     * Affects body speed.
     * @method setVelocity
     * @param {body} body
     * @param {vector} velocity
     */
    Body.setVelocity = function(body, velocity) {
        // bounds an engine deferred are padded by the velocity they were
        // deferred with, which this is about to overwrite, so bring them up
        // to date first (see Body._updateStaleBounds). `setSpeed` comes
        // through here; `setAngularVelocity` pads no bounds, and
        // `setPosition` recomputes every bound it writes a velocity for
        Body._updateStaleBounds(body);

        var timeScale = body.deltaTime / Body._baseDelta;
        body.positionPrev.x = body.position.x - velocity.x * timeScale;
        body.positionPrev.y = body.position.y - velocity.y * timeScale;
        body.velocity.x = (body.position.x - body.positionPrev.x) / timeScale;
        body.velocity.y = (body.position.y - body.positionPrev.y) / timeScale;
        body.speed = Vector.magnitude(body.velocity);

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Gets the current linear velocity of the body.
     * @method getVelocity
     * @param {body} body
     * @return {vector} velocity
     */
    Body.getVelocity = function(body) {
        var timeScale = Body._baseDelta / body.deltaTime;

        return {
            x: (body.position.x - body.positionPrev.x) * timeScale,
            y: (body.position.y - body.positionPrev.y) * timeScale
        };
    };

    /**
     * Gets the current linear speed of the body.  
     * Equivalent to the magnitude of its velocity.
     * @method getSpeed
     * @param {body} body
     * @return {number} speed
     */
    Body.getSpeed = function(body) {
        return Vector.magnitude(Body.getVelocity(body));
    };

    /**
     * Sets the current linear speed of the body.  
     * Direction is maintained. Affects body velocity.
     * @method setSpeed
     * @param {body} body
     * @param {number} speed
     */
    Body.setSpeed = function(body, speed) {
        Body.setVelocity(body, Vector.mult(Vector.normalise(Body.getVelocity(body)), speed));
    };

    /**
     * Sets the current rotational velocity of the body.  
     * Affects body angular speed.
     * @method setAngularVelocity
     * @param {body} body
     * @param {number} velocity
     */
    Body.setAngularVelocity = function(body, velocity) {
        var timeScale = body.deltaTime / Body._baseDelta;
        body.anglePrev = body.angle - velocity * timeScale;
        body.angularVelocity = (body.angle - body.anglePrev) / timeScale;
        body.angularSpeed = Math.abs(body.angularVelocity);

        body._restStatic = Common._isRestingStatic(body);
    };

    /**
     * Gets the current rotational velocity of the body.
     * @method getAngularVelocity
     * @param {body} body
     * @return {number} angular velocity
     */
    Body.getAngularVelocity = function(body) {
        return (body.angle - body.anglePrev) * Body._baseDelta / body.deltaTime;
    };

    /**
     * Gets the current rotational speed of the body.  
     * Equivalent to the magnitude of its angular velocity.
     * @method getAngularSpeed
     * @param {body} body
     * @return {number} angular speed
     */
    Body.getAngularSpeed = function(body) {
        return Math.abs(Body.getAngularVelocity(body));
    };

    /**
     * Sets the current rotational speed of the body.  
     * Direction is maintained. Affects body angular velocity.
     * @method setAngularSpeed
     * @param {body} body
     * @param {number} speed
     */
    Body.setAngularSpeed = function(body, speed) {
        Body.setAngularVelocity(body, Common.sign(Body.getAngularVelocity(body)) * speed);
    };

    /**
     * Moves a body by a given vector relative to its current position. By default velocity is unchanged.
     * If `updateVelocity` is `true` then velocity is inferred from the change in position.
     * @method translate
     * @param {body} body
     * @param {vector} translation
     * @param {boolean} [updateVelocity=false]
     */
    Body.translate = function(body, translation, updateVelocity) {
        Body.setPosition(body, Vector.add(body.position, translation), updateVelocity);
    };

    /**
     * Rotates a body by a given angle relative to its current angle. By default angular velocity is unchanged.
     * If `updateVelocity` is `true` then angular velocity is inferred from the change in angle.
     * @method rotate
     * @param {body} body
     * @param {number} rotation
     * @param {vector} [point]
     * @param {boolean} [updateVelocity=false]
     */
    Body.rotate = function(body, rotation, point, updateVelocity) {
        if (!point) {
            Body.setAngle(body, body.angle + rotation, updateVelocity);
        } else {
            var cos = Math.cos(rotation),
                sin = Math.sin(rotation),
                dx = body.position.x - point.x,
                dy = body.position.y - point.y;
                
            Body.setPosition(body, {
                x: point.x + (dx * cos - dy * sin),
                y: point.y + (dx * sin + dy * cos)
            }, updateVelocity);

            Body.setAngle(body, body.angle + rotation, updateVelocity);
        }
    };

    /**
     * Scales the body, including updating physical properties (mass, area, axes, inertia), from a world-space point (default is body centre).
     * @method scale
     * @param {body} body
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {vector} [point]
     */
    Body.scale = function(body, scaleX, scaleY, point) {
        var totalArea = 0,
            totalInertia = 0,
            // the bounds the grid may have indexed (see Body._promoteIfIndexed)
            bounds = body.bounds,
            minX = bounds.min.x,
            minY = bounds.min.y,
            maxX = bounds.max.x,
            maxY = bounds.max.y;

        point = point || body.position;

        for (var i = 0; i < body.parts.length; i++) {
            var part = body.parts[i];

            // scale vertices
            Vertices.scale(part.vertices, scaleX, scaleY, point);

            // update properties
            part.axes = Axes.fromVertices(part.vertices);
            // the axes have been replaced, so the self-projection memo is stale
            // (and possibly the wrong length)
            part._spValid = false;
            part.area = Vertices.area(part.vertices);
            Body.setMass(part, body.density * part.area);

            // update inertia (requires vertices to be at origin)
            Vertices.translate(part.vertices, { x: -part.position.x, y: -part.position.y });
            Body.setInertia(part, Body._inertiaScale * Vertices.inertia(part.vertices, part.mass));
            Vertices.translate(part.vertices, { x: part.position.x, y: part.position.y });

            if (i > 0) {
                totalArea += part.area;
                totalInertia += part.inertia;
            }

            // scale position
            part.position.x = point.x + (part.position.x - point.x) * scaleX;
            part.position.y = point.y + (part.position.y - point.y) * scaleY;

            // the extents changed, and a non-uniform scale of a rotated box is
            // a parallelogram, which keeps two axes but is no longer a box
            Body._updateBoxTag(part);

            // update bounds
            Bounds.update(part.bounds, part.vertices, body.velocity);

            // scaling about any point but the position moves the position
            // without positionPrev
            part._restStatic = Common._isRestingStatic(part);
        }

        // handle parent body
        if (body.parts.length > 1) {
            body.area = totalArea;

            if (!body.isStatic) {
                Body.setMass(body, body.density * totalArea);
                Body.setInertia(body, totalInertia);
            }
        }

        // handle circles
        if (body.circleRadius) { 
            if (scaleX === scaleY) {
                body.circleRadius *= scaleX;
            } else {
                // body is no longer a circle
                body.circleRadius = null;
            }
        }

        Body._promoteIfIndexed(body, minX, minY, maxX, maxY);
    };

    /**
     * Performs an update by integrating the equations of motion on the `body`.
     * This is applied every update by `Matter.Engine` automatically.
     * @method update
     * @param {body} body
     * @param {number} [deltaTime=16.666]
     */
    Body.update = function(body, deltaTime) {
        deltaTime = (typeof deltaTime !== 'undefined' ? deltaTime : (1000 / 60)) * body.timeScale;

        var deltaTimeSquared = deltaTime * deltaTime,
            correction = Body._timeCorrection ? deltaTime / (body.deltaTime || deltaTime) : 1;

        // from the previous step
        var frictionAir = 1 - body.frictionAir * (deltaTime / Common._baseDelta),
            velocityPrevX = (body.position.x - body.positionPrev.x) * correction,
            velocityPrevY = (body.position.y - body.positionPrev.y) * correction;

        // update velocity with Verlet integration
        body.velocity.x = (velocityPrevX * frictionAir) + (body.force.x / body.mass) * deltaTimeSquared;
        body.velocity.y = (velocityPrevY * frictionAir) + (body.force.y / body.mass) * deltaTimeSquared;

        body.positionPrev.x = body.position.x;
        body.positionPrev.y = body.position.y;
        body.position.x += body.velocity.x;
        body.position.y += body.velocity.y;
        body.deltaTime = deltaTime;

        // update angular velocity with Verlet integration
        body.angularVelocity = ((body.angle - body.anglePrev) * frictionAir * correction) + (body.torque / body.inertia) * deltaTimeSquared;
        body.anglePrev = body.angle;
        body.angle += body.angularVelocity;

        // the engine integrates moving bodies only, so this is a direct call
        // on a static. It keeps the rest row for a finite force and torque,
        // and the check reads one false flag for every engine-driven update
        if (body._restStatic === true) {
            body._restStatic = Common._isRestingStatic(body);
        }

        // transform the body geometry
        var parts = body.parts,
            partsLength = parts.length,
            velocity = body.velocity,
            angularVelocity = body.angularVelocity,
            position = body.position;

        // single-part bodies (the common case) skip the per-part position and
        // compound-rotation bookkeeping that only applies to parts[1..]. The
        // operations and their order are identical to the general loop below,
        // so the result is bit-identical.
        if (partsLength === 1) {
            var only = parts[0];

            Vertices.translate(only.vertices, velocity);

            if (angularVelocity !== 0) {
                Vertices.rotate(only.vertices, angularVelocity, position);
                Axes.rotate(only.axes, angularVelocity);
            }

            Bounds.update(only.bounds, only.vertices, velocity);
            return;
        }

        for (var i = 0; i < partsLength; i++) {
            var part = parts[i];

            Vertices.translate(part.vertices, velocity);

            if (i > 0) {
                part.position.x += velocity.x;
                part.position.y += velocity.y;
            }

            if (angularVelocity !== 0) {
                Vertices.rotate(part.vertices, angularVelocity, position);
                Axes.rotate(part.axes, angularVelocity);
                if (i > 0) {
                    Vector.rotateAbout(part.position, angularVelocity, position, part.position);
                }
            }

            Bounds.update(part.bounds, part.vertices, velocity);
        }
    };

    /**
     * Updates properties `body.velocity`, `body.speed`, `body.angularVelocity` and `body.angularSpeed` which are normalised in relation to `Body._baseDelta`.
     * @method updateVelocities
     * @param {body} body
     */
    Body.updateVelocities = function(body) {
        var timeScale = Body._baseDelta / body.deltaTime,
            bodyVelocity = body.velocity;

        bodyVelocity.x = (body.position.x - body.positionPrev.x) * timeScale;
        bodyVelocity.y = (body.position.y - body.positionPrev.y) * timeScale;
        body.speed = Math.sqrt((bodyVelocity.x * bodyVelocity.x) + (bodyVelocity.y * bodyVelocity.y));

        body.angularVelocity = (body.angle - body.anglePrev) * timeScale;
        body.angularSpeed = Math.abs(body.angularVelocity);
    };

    /**
     * Applies the `force` to the `body` from the force origin `position` in world-space, over a single timestep, including applying any resulting angular torque.
     * 
     * Forces are useful for effects like gravity, wind or rocket thrust, but can be difficult in practice when precise control is needed. In these cases see `Body.setVelocity` and `Body.setPosition` as an alternative.
     * 
     * The force from this function is only applied once for the duration of a single timestep, in other words the duration depends directly on the current engine update `delta` and the rate of calls to this function.
     * 
     * Therefore to account for time, you should apply the force constantly over as many engine updates as equivalent to the intended duration.
     * 
     * If all or part of the force duration is some fraction of a timestep, first multiply the force by `duration / timestep`.
     * 
     * The force origin `position` in world-space must also be specified. Passing `body.position` will result in zero angular effect as the force origin would be at the centre of mass.
     * 
     * The `body` will take time to accelerate under a force, the resulting effect depends on duration of the force, the body mass and other forces on the body including friction combined.
     * @method applyForce
     * @param {body} body
     * @param {vector} position The force origin in world-space. Pass `body.position` to avoid angular torque.
     * @param {vector} force
     */
    Body.applyForce = function(body, position, force) {
        var offset = { x: position.x - body.position.x, y: position.y - body.position.y };
        body.force.x += force.x;
        body.force.y += force.y;
        body.torque += offset.x * force.y - offset.y * force.x;
    };

    /**
     * Returns the sums of the properties of all compound parts of the parent body.
     * @method _totalProperties
     * @private
     * @param {body} body
     * @return {}
     */
    Body._totalProperties = function(body) {
        // from equations at:
        // https://ecourses.ou.edu/cgi-bin/ebook.cgi?doc=&topic=st&chap_sec=07.2&page=theory
        // http://output.to/sideway/default.asp?qno=121100087

        var properties = {
            mass: 0,
            area: 0,
            inertia: 0,
            centre: { x: 0, y: 0 }
        };

        // sum the properties of all compound parts of the parent body
        for (var i = body.parts.length === 1 ? 0 : 1; i < body.parts.length; i++) {
            var part = body.parts[i],
                mass = part.mass !== Infinity ? part.mass : 1;

            properties.mass += mass;
            properties.area += part.area;
            properties.inertia += part.inertia;
            properties.centre = Vector.add(properties.centre, Vector.mult(part.position, mass));
        }

        properties.centre = Vector.div(properties.centre, properties.mass);

        return properties;
    };

    /*
    *
    *  Events Documentation
    *
    */

    /**
    * Fired when a body starts sleeping (where `this` is the body).
    *
    * @event sleepStart
    * @this {body} The body that has started sleeping
    * @param {} event An event object
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when a body ends sleeping (where `this` is the body).
    *
    * @event sleepEnd
    * @this {body} The body that has ended sleeping
    * @param {} event An event object
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * An integer `Number` uniquely identifying number generated in `Body.create` by `Common.nextId`.
     *
     * @property id
     * @type number
     */

    /**
     * _Read only_. Set by `Body.create`.
     * 
     * A `String` denoting the type of object.
     *
     * @readOnly
     * @property type
     * @type string
     * @default "body"
     */

    /**
     * An arbitrary `String` name to help the user identify and manage bodies.
     *
     * @property label
     * @type string
     * @default "Body"
     */

    /**
     * _Read only_. Use `Body.setParts` to set. 
     * 
     * See `Bodies.fromVertices` for a related utility.
     * 
     * An array of bodies (the 'parts') that make up this body (the 'parent'). The first body in this array must always be a self-reference to this `body`.  
     * 
     * The parts are fixed together and therefore perform as a single unified rigid body.
     * 
     * Parts in relation to each other are allowed to overlap, as well as form gaps or holes, so can be used to create complex concave bodies unlike when using a single part. 
     * 
     * Use properties and functions on the parent `body` rather than on parts.
     *   
     * Outside of their geometry, most properties on parts are not considered or updated.  
     * As such 'per-part' material properties among others are not currently considered.
     * 
     * Parts should be created specifically for their parent body.  
     * Parts should not be shared or reused between bodies, only one parent is supported.  
     * Parts should not have their own parts, they are not handled recursively.  
     * Parts should not be added to the world directly or any other composite.  
     * Parts own vertices must be convex and in clockwise order.   
     * 
     * A body with more than one part is sometimes referred to as a 'compound' body. 
     * 
     * Use `Body.setParts` when setting parts to ensure correct updates of all properties.  
     *
     * @readOnly
     * @property parts
     * @type body[]
     */

    /**
     * An object reserved for storing plugin-specific properties.
     *
     * @property plugin
     * @type {}
     */

    /**
     * _Read only_. Updated by `Body.setParts`.
     * 
     * A reference to the body that this is a part of. See `body.parts`.
     * This is a self reference if the body is not a part of another body.
     *
     * @readOnly
     * @property parent
     * @type body
     */

    /**
     * A `Number` specifying the angle of the body, in radians.
     *
     * @property angle
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setVertices` or `Body.setParts` to set. See also `Bodies.fromVertices`.
     * 
     * An array of `Vector` objects that specify the convex hull of the rigid body.
     * These should be provided about the origin `(0, 0)`. E.g.
     *
     * `[{ x: 0, y: 0 }, { x: 25, y: 50 }, { x: 50, y: 0 }]`
     * 
     * Vertices must always be convex, in clockwise order and must not contain any duplicate points.
     * 
     * Concave vertices should be decomposed into convex `parts`, see `Bodies.fromVertices` and `Body.setParts`.
     *
     * When set the vertices are translated such that `body.position` is at the centre of mass.
     * Many other body properties are automatically calculated from these vertices when set including `density`, `area` and `inertia`.
     * 
     * The module `Matter.Vertices` contains useful methods for working with vertices.
     *
     * @readOnly
     * @property vertices
     * @type vector[]
     */

    /**
     * _Read only_. Use `Body.setPosition` to set. 
     * 
     * A `Vector` that specifies the current world-space position of the body.
     * 
     * @readOnly
     * @property position
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * A `Vector` that accumulates the total force applied to the body for a single update.
     * Force is zeroed after every `Engine.update`, so constant forces should be applied for every update they are needed. See also `Body.applyForce`.
     * 
     * @property force
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * A `Number` that accumulates the total torque (turning force) applied to the body for a single update. See also `Body.applyForce`.
     * Torque is zeroed after every `Engine.update`, so constant torques should be applied for every update they are needed.
     *
     * Torques result in angular acceleration on every update, which depends on body inertia and the engine update delta.
     * 
     * @property torque
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setSpeed` to set. 
     * 
     * See `Body.getSpeed` for details.
     * 
     * Equivalent to the magnitude of `body.velocity` (always positive).
     * 
     * @readOnly
     * @property speed
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setVelocity` to set. 
     * 
     * See `Body.getVelocity` for details.
     * 
     * Equivalent to the magnitude of `body.angularVelocity` (always positive).
     * 
     * @readOnly
     * @property velocity
     * @type vector
     * @default { x: 0, y: 0 }
     */

    /**
     * _Read only_. Use `Body.setAngularSpeed` to set. 
     * 
     * See `Body.getAngularSpeed` for details.
     * 
     * 
     * @readOnly
     * @property angularSpeed
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setAngularVelocity` to set. 
     * 
     * See `Body.getAngularVelocity` for details.
     * 
     *
     * @readOnly
     * @property angularVelocity
     * @type number
     * @default 0
     */

    /**
     * _Read only_. Use `Body.setStatic` to set. 
     * 
     * A flag that indicates whether a body is considered static. A static body can never change position or angle and is completely fixed.
     *
     * @readOnly
     * @property isStatic
     * @type boolean
     * @default false
     */

    /**
     * A flag that indicates whether a body is a sensor. Sensor triggers collision events, but doesn't react with colliding body physically.
     *
     * @property isSensor
     * @type boolean
     * @default false
     */

    /**
     * _Read only_. Use `Sleeping.set` to set. 
     * 
     * A flag that indicates whether the body is considered sleeping. A sleeping body acts similar to a static body, except it is only temporary and can be awoken.
     *
     * @readOnly
     * @property isSleeping
     * @type boolean
     * @default false
     */

    /**
     * _Read only_. Calculated during engine update only when sleeping is enabled.
     * 
     * A `Number` that loosely measures the amount of movement a body currently has.
     *
     * Derived from `body.speed^2 + body.angularSpeed^2`. See `Sleeping.update`.
     * 
     * @readOnly
     * @property motion
     * @type number
     * @default 0
     */

    /**
     * A `Number` that defines the length of time during which this body must have near-zero velocity before it is set as sleeping by the `Matter.Sleeping` module (if sleeping is enabled by the engine).
     * 
     * @property sleepThreshold
     * @type number
     * @default 60
     */

    /**
     * _Read only_. Use `Body.setDensity` to set. 
     * 
     * A `Number` that defines the density of the body (mass per unit area).
     * 
     * Mass will also be updated when set.
     *
     * @readOnly
     * @property density
     * @type number
     * @default 0.001
     */

    /**
     * _Read only_. Use `Body.setMass` to set. 
     * 
     * A `Number` that defines the mass of the body.
     * 
     * Density will also be updated when set.
     * 
     * @readOnly
     * @property mass
     * @type number
     */

    /**
     * _Read only_. Use `Body.setMass` to set. 
     * 
     * A `Number` that defines the inverse mass of the body (`1 / mass`).
     *
     * @readOnly
     * @property inverseMass
     * @type number
     */

    /**
     * _Read only_. Automatically calculated when vertices, mass or density are set or set through `Body.setInertia`.
     * 
     * A `Number` that defines the moment of inertia of the body. This is the second moment of area in two dimensions.
     * 
     * Can be manually set to `Infinity` to prevent rotation of the body. See `Body.setInertia`.
     * 
     * @readOnly
     * @property inertia
     * @type number
     */

    /**
     * _Read only_. Automatically calculated when vertices, mass or density are set or calculated by `Body.setInertia`.
     * 
     * A `Number` that defines the inverse moment of inertia of the body (`1 / inertia`).
     * 
     * @readOnly
     * @property inverseInertia
     * @type number
     */

    /**
     * A `Number` that defines the restitution (elasticity) of the body. The value is always positive and is in the range `(0, 1)`.
     * A value of `0` means collisions may be perfectly inelastic and no bouncing may occur. 
     * A value of `0.8` means the body may bounce back with approximately 80% of its kinetic energy.
     * Note that collision response is based on _pairs_ of bodies, and that `restitution` values are _combined_ with the following formula:
     *
     * `Math.max(bodyA.restitution, bodyB.restitution)`
     *
     * @property restitution
     * @type number
     * @default 0
     */

    /**
     * A `Number` that defines the friction of the body. The value is always positive and is in the range `(0, 1)`.
     * A value of `0` means that the body may slide indefinitely.
     * A value of `1` means the body may come to a stop almost instantly after a force is applied.
     *
     * The effects of the value may be non-linear. 
     * High values may be unstable depending on the body.
     * The engine uses a Coulomb friction model including static and kinetic friction.
     * Note that collision response is based on _pairs_ of bodies, and that `friction` values are _combined_ with the following formula:
     *
     * `Math.min(bodyA.friction, bodyB.friction)`
     *
     * @property friction
     * @type number
     * @default 0.1
     */

    /**
     * A `Number` that defines the static friction of the body (in the Coulomb friction model). 
     * A value of `0` means the body will never 'stick' when it is nearly stationary and only dynamic `friction` is used.
     * The higher the value (e.g. `10`), the more force it will take to initially get the body moving when nearly stationary.
     * This value is multiplied with the `friction` property to make it easier to change `friction` and maintain an appropriate amount of static friction.
     *
     * @property frictionStatic
     * @type number
     * @default 0.5
     */

    /**
     * A `Number` that defines the air friction of the body (air resistance). 
     * A value of `0` means the body will never slow as it moves through space.
     * The higher the value, the faster a body slows when moving through space.
     * The effects of the value are non-linear. 
     *
     * @property frictionAir
     * @type number
     * @default 0.01
     */

    /**
     * An `Object` that specifies the collision filtering properties of this body.
     *
     * Collisions between two bodies will obey the following rules:
     * - If the two bodies have the same non-zero value of `collisionFilter.group`,
     *   they will always collide if the value is positive, and they will never collide
     *   if the value is negative.
     * - If the two bodies have different values of `collisionFilter.group` or if one
     *   (or both) of the bodies has a value of 0, then the category/mask rules apply as follows:
     *
     * Each body belongs to a collision category, given by `collisionFilter.category`. This
     * value is used as a bit field and the category should have only one bit set, meaning that
     * the value of this property is a power of two in the range [1, 2^31]. Thus, there are 32
     * different collision categories available.
     *
     * Each body also defines a collision bitmask, given by `collisionFilter.mask` which specifies
     * the categories it collides with (the value is the bitwise AND value of all these categories).
     *
     * Using the category/mask rules, two bodies `A` and `B` collide if each includes the other's
     * category in its mask, i.e. `(categoryA & maskB) !== 0` and `(categoryB & maskA) !== 0`
     * are both true.
     *
     * @property collisionFilter
     * @type object
     */

    /**
     * An Integer `Number`, that specifies the collision group this body belongs to.
     * See `body.collisionFilter` for more information.
     *
     * @property collisionFilter.group
     * @type object
     * @default 0
     */

    /**
     * A bit field that specifies the collision category this body belongs to.
     * The category value should have only one bit set, for example `0x0001`.
     * This means there are up to 32 unique collision categories available.
     * See `body.collisionFilter` for more information.
     *
     * @property collisionFilter.category
     * @type object
     * @default 1
     */

    /**
     * A bit mask that specifies the collision categories this body may collide with.
     * See `body.collisionFilter` for more information.
     *
     * @property collisionFilter.mask
     * @type object
     * @default -1
     */

    /**
     * A `Number` that specifies a thin boundary around the body where it is allowed to slightly sink into other bodies.
     * 
     * This is required for proper collision response, including friction and restitution effects.
     * 
     * The default should generally suffice in most cases. You may need to decrease this value for very small bodies that are nearing the default value in scale.
     *
     * @property slop
     * @type number
     * @default 0.05
     */

    /**
     * A `Number` that specifies per-body time scaling.
     *
     * @property timeScale
     * @type number
     * @default 1
     */

    /**
     * _Read only_. Updated during engine update.
     * 
     * A `Number` that records the last delta time value used to update this body.
     * Used to calculate speed and velocity.
     *
     * @readOnly
     * @property deltaTime
     * @type number
     * @default 1000 / 60
     */

    /**
     * An `Object` that defines the rendering properties to be consumed by the module `Matter.Render`.
     *
     * @property render
     * @type object
     */

    /**
     * A flag that indicates if the body should be rendered.
     *
     * @property render.visible
     * @type boolean
     * @default true
     */

    /**
     * Sets the opacity to use when rendering.
     *
     * @property render.opacity
     * @type number
     * @default 1
    */

    /**
     * An `Object` that defines the sprite properties to use when rendering, if any.
     *
     * @property render.sprite
     * @type object
     */

    /**
     * An `String` that defines the path to the image to use as the sprite texture, if any.
     *
     * @property render.sprite.texture
     * @type string
     */
     
    /**
     * A `Number` that defines the scaling in the x-axis for the sprite, if any.
     *
     * @property render.sprite.xScale
     * @type number
     * @default 1
     */

    /**
     * A `Number` that defines the scaling in the y-axis for the sprite, if any.
     *
     * @property render.sprite.yScale
     * @type number
     * @default 1
     */

    /**
      * A `Number` that defines the offset in the x-axis for the sprite (normalised by texture width).
      *
      * @property render.sprite.xOffset
      * @type number
      * @default 0
      */

    /**
      * A `Number` that defines the offset in the y-axis for the sprite (normalised by texture height).
      *
      * @property render.sprite.yOffset
      * @type number
      * @default 0
      */

    /**
     * A `Number` that defines the line width to use when rendering the body outline (if a sprite is not defined).
     * A value of `0` means no outline will be rendered.
     *
     * @property render.lineWidth
     * @type number
     * @default 0
     */

    /**
     * A `String` that defines the fill style to use when rendering the body (if a sprite is not defined).
     * It is the same as when using a canvas, so it accepts CSS style property values.
     *
     * @property render.fillStyle
     * @type string
     * @default a random colour
     */

    /**
     * A `String` that defines the stroke style to use when rendering the body outline (if a sprite is not defined).
     * It is the same as when using a canvas, so it accepts CSS style property values.
     *
     * @property render.strokeStyle
     * @type string
     * @default a random colour
     */

    /**
     * _Read only_. Calculated automatically when vertices are set.
     * 
     * An array of unique axis vectors (edge normals) used for collision detection.
     * These are automatically calculated when vertices are set.
     * They are constantly updated by `Body.update` during the simulation.
     *
     * @readOnly
     * @property axes
     * @type vector[]
     */
     
    /**
     * _Read only_. Calculated automatically when vertices are set.
     * 
     * A `Number` that measures the area of the body's convex hull.
     * 
     * @readOnly
     * @property area
     * @type string
     * @default 
     */

    /**
     * A `Bounds` object that defines the AABB region for the body.
     * It is automatically calculated when vertices are set and constantly updated by `Body.update` during simulation.
     * 
     * @property bounds
     * @type bounds
     */

    /**
     * Temporarily may hold parameters to be passed to `Vertices.chamfer` where supported by external functions.
     * 
     * See `Vertices.chamfer` for possible parameters this object may hold.
     * 
     * Currently only functions inside `Matter.Bodies` provide a utility using this property as a vertices pre-processing option.
     * 
     * Alternatively consider using `Vertices.chamfer` directly on vertices before passing them to a body creation function.
     * 
     * @property chamfer
     * @type object|null|undefined
     */

})();

// Sleeping requires Body back. Requiring it before the IIFE above makes that a
// circular require WHILE Body is still empty, and Node's CommonJS loader then
// gives Body's exports a temporary warning-proxy prototype for the rest of this
// file's load. Every `Body.x = ...` store above would take the generic
// [[Set]] path, and V8 drops an object built that way to dictionary mode at
// around its 20th property, so every `Body.update` / `Body._baseDelta` load in
// the engine became a generic LoadIC. Bundled builds were never affected; only
// a source load through Node (every A/B bench) was. `npm run audit-shapes`
// fails on any Matter module object in dictionary mode.
Sleeping = require('../core/Sleeping');
