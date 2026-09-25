/**
* A composite is a collection of `Matter.Body`, `Matter.Constraint` and other `Matter.Composite` objects.
*
* They are a container that can represent complex objects made of multiple parts, even if they are not physically connected.
* A composite could contain anything from a single body all the way up to a whole world.
* 
* When making any changes to composites, use the included functions rather than changing their properties directly.
*
* See the included usage [examples](https://github.com/liabru/matter-js/tree/master/examples).
*
* @class Composite
*/

var Composite = {};

module.exports = Composite;

var Events = require('../core/Events');
var Common = require('../core/Common');
var Bounds = require('../geometry/Bounds');
var Body = require('./Body');

(function() {

    /**
     * Creates a new composite. The options parameter is an object that specifies any properties you wish to override the defaults.
     * See the properites section below for detailed information on what you can pass via the `options` object.
     * @method create
     * @param {} [options]
     * @return {composite} A new composite
     */
    Composite.create = function(options) {
        return Common.extend({ 
            id: Common.nextId(),
            type: 'composite',
            parent: null,
            isModified: false,
            bodies: [], 
            constraints: [], 
            composites: [],
            label: 'Composite',
            plugin: {},
            cache: {
                allBodies: null,
                allConstraints: null,
                allComposites: null
            },
            // whether `Engine.update` is holding `bodies` itself as the
            // update's body list (see Composite._ownBodies)
            _bodiesLent: false,
            // the body journal a `gridStatic` detector reads instead of
            // walking every body (see Common._journalTouch): the bodies touched
            // since it last read, filled by index up to `_touchedCount`;
            // whether the list is complete; the stamp of the full walk that
            // started it, which a member carries in `body._sWalk`; the next
            // add's `body._sWorldIndex`, which keeps that sort key increasing
            // in body order; and the body count the recorded changes account
            // for, which a direct edit that never signalled does not match
            _touched: [],
            _touchedCount: 0,
            _journalLive: false,
            _memberGen: 0,
            _nextOrdinal: 0,
            _journalLength: 0,
            // Common._foreignWalks when the journal started, and the stamp of
            // the last full walk of this composite's own array: every body
            // carrying it in `_sWalk` is owned by this composite, which lets
            // the next walk skip reading `_sOwner` for it
            _journalForeignWalks: 0,
            _ownedGen: 0
        }, options);
    };

    /**
     * Sets the composite's `isModified` flag. 
     * If `updateParents` is true, all parents will be set (default: false).
     * If `updateChildren` is true, all children will be set (default: false).
     * @private
     * @method setModified
     * @param {composite} composite
     * @param {boolean} isModified
     * @param {boolean} [updateParents=false]
     * @param {boolean} [updateChildren=false]
     */
    Composite.setModified = function(composite, isModified, updateParents, updateChildren) {
        composite.isModified = isModified;

        // the body-set signal the mover classifications key on (see
        // Common._bodySetEpoch). Here and not in add / remove, because a
        // caller that edits `composite.bodies` directly signals only here.
        // For the same reason this is the change the body journal cannot
        // describe, so it switches the journal off until the next full walk
        // (the add and remove below record what they change and signal
        // through Composite._setModifiedJournaled instead)
        if (isModified) {
            Common._bodySetEpoch++;
            composite._journalLive = false;
        }

        if (isModified && composite.cache) {
            composite.cache.allBodies = null;
            composite.cache.allConstraints = null;
            composite.cache.allComposites = null;
        }

        if (updateParents && composite.parent) {
            Composite.setModified(composite.parent, isModified, updateParents, updateChildren);
        }

        if (updateChildren) {
            for (var i = 0; i < composite.composites.length; i++) {
                var childComposite = composite.composites[i];
                Composite.setModified(childComposite, isModified, updateParents, updateChildren);
            }
        }
    };

    /**
     * Marks the composite modified exactly as `setModified(composite, true,
     * true, false)` does, for a change this composite's body journal has
     * already recorded, so the journal stays live. Its parents are marked
     * through `setModified`, which switches theirs off: a change to a child
     * reorders a parent's `allBodies`, which no journal describes.
     * @private
     * @method _setModifiedJournaled
     * @param {composite} composite
     */
    Composite._setModifiedJournaled = function(composite) {
        composite.isModified = true;
        Common._bodySetEpoch++;

        if (composite.cache) {
            composite.cache.allBodies = null;
            composite.cache.allConstraints = null;
            composite.cache.allComposites = null;
        }

        if (composite.parent) {
            Composite.setModified(composite.parent, true, true, false);
        }
    };

    /**
     * Generic single or multi-add function. Adds a single or an array of body(s), constraint(s) or composite(s) to the given composite.
     * Triggers `beforeAdd` and `afterAdd` events on the `composite`.
     * @method add
     * @param {composite} composite
     * @param {object|array} object A single or an array of body(s), constraint(s) or composite(s)
     * @return {composite} The original composite with the objects added
     */
    Composite.add = function(composite, object) {
        var objects = [].concat(object);

        Events.trigger(composite, 'beforeAdd', { object: object });

        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];

            switch (obj.type) {

            case 'body':
                // skip adding compound parts
                if (obj.parent !== obj) {
                    Common.warn('Composite.add: skipped adding a compound body part (you must add its parent instead)');
                    break;
                }

                Composite.addBody(composite, obj);
                break;
            case 'constraint':
                Composite.addConstraint(composite, obj);
                break;
            case 'composite':
                Composite.addComposite(composite, obj);
                break;
            case 'mouseConstraint':
                Composite.addConstraint(composite, obj.constraint);
                break;

            }
        }

        Events.trigger(composite, 'afterAdd', { object: object });

        return composite;
    };

    /**
     * Generic remove function. Removes one or many body(s), constraint(s) or a composite(s) to the given composite.
     * Optionally searching its children recursively.
     * Triggers `beforeRemove` and `afterRemove` events on the `composite`.
     * @method remove
     * @param {composite} composite
     * @param {object|array} object
     * @param {boolean} [deep=false]
     * @return {composite} The original composite with the objects removed
     */
    Composite.remove = function(composite, object, deep) {
        var objects = [].concat(object);

        Events.trigger(composite, 'beforeRemove', { object: object });

        for (var i = 0; i < objects.length; i++) {
            var obj = objects[i];

            switch (obj.type) {

            case 'body':
                Composite.removeBody(composite, obj, deep);
                break;
            case 'constraint':
                Composite.removeConstraint(composite, obj, deep);
                break;
            case 'composite':
                Composite.removeComposite(composite, obj, deep);
                break;
            case 'mouseConstraint':
                Composite.removeConstraint(composite, obj.constraint);
                break;

            }
        }

        Events.trigger(composite, 'afterRemove', { object: object });

        return composite;
    };

    /**
     * Adds a composite to the given composite.
     * @private
     * @method addComposite
     * @param {composite} compositeA
     * @param {composite} compositeB
     * @return {composite} The original compositeA with the objects from compositeB added
     */
    Composite.addComposite = function(compositeA, compositeB) {
        compositeA.composites.push(compositeB);
        compositeB.parent = compositeA;
        Composite.setModified(compositeA, true, true, false);
        return compositeA;
    };

    /**
     * Removes a composite from the given composite, and optionally searching its children recursively.
     * @private
     * @method removeComposite
     * @param {composite} compositeA
     * @param {composite} compositeB
     * @param {boolean} [deep=false]
     * @return {composite} The original compositeA with the composite removed
     */
    Composite.removeComposite = function(compositeA, compositeB, deep) {
        var position = Common.indexOf(compositeA.composites, compositeB);

        if (position !== -1) {
            var bodies = Composite.allBodies(compositeB);

            Composite.removeCompositeAt(compositeA, position);

            for (var i = 0; i < bodies.length; i++) {
                bodies[i].sleepCounter = 0;
            }
        }

        if (deep) {
            for (var i = 0; i < compositeA.composites.length; i++){
                Composite.removeComposite(compositeA.composites[i], compositeB, true);
            }
        }

        return compositeA;
    };

    /**
     * Removes a composite from the given composite.
     * @private
     * @method removeCompositeAt
     * @param {composite} composite
     * @param {number} position
     * @return {composite} The original composite with the composite removed
     */
    Composite.removeCompositeAt = function(composite, position) {
        composite.composites.splice(position, 1);
        Composite.setModified(composite, true, true, false);
        return composite;
    };

    /**
     * Gives the composite a private `bodies` array before it is changed in
     * place, if `Engine.update` is holding the current one.
     *
     * For a world with no child composites, `Engine.update` uses
     * `world.bodies` ITSELF as the update's body list, rather than the copy
     * `Composite.allBodies` builds after every change, and the detector keeps
     * it between updates. A listener that adds or removes a body during the
     * update would otherwise change that list under the update, where the
     * copy never changed: so the change goes to a fresh array and the update
     * finishes with the membership it started with, as it always did. Outside
     * an update the array is changed in place, and the change is signalled by
     * `Composite.setModified` (see Common._bodySetEpoch).
     * @private
     * @method _ownBodies
     * @param {composite} composite
     */
    Composite._ownBodies = function(composite) {
        if (composite._bodiesLent === true) {
            composite.bodies = composite.bodies.slice(0);
            composite._bodiesLent = false;
        }
    };

    /**
     * Adds a body to the given composite.
     * @private
     * @method addBody
     * @param {composite} composite
     * @param {body} body
     * @return {composite} The original composite with the body added
     */
    Composite.addBody = function(composite, body) {
        Composite._ownBodies(composite);
        composite.bodies.push(body);

        // a body changing owner: a member of another composite's journal (a
        // body in two composites) stops being recorded there, and its stamp,
        // which vouched for its old owner, is dropped (see _ownedGen)
        var previousOwner = body._sOwner;

        if (previousOwner !== composite) {
            if (previousOwner !== null && body._sWalk === previousOwner._memberGen) {
                previousOwner._journalLive = false;
            }
            body._sWalk = -1;
        }

        // record the add in the body journal (see Common._journalTouch). The
        // body goes on the END of the array, so the next ordinal keeps
        // `_sWorldIndex` increasing in body order. A body that is already a
        // member is going in TWICE, which no membership flag can describe
        if (composite._journalLive === true) {
            if (body._sOwner === composite && body._sWalk === composite._memberGen) {
                composite._journalLive = false;
            } else {
                body._sWalk = composite._memberGen;
                body._sWorldIndex = composite._nextOrdinal++;
                composite._journalLength++;
                Common._journalPush(composite, body);
            }
        }

        body._sOwner = composite;
        Composite._setModifiedJournaled(composite);
        return composite;
    };

    /**
     * Removes a body from the given composite, and optionally searching its children recursively.
     * @private
     * @method removeBody
     * @param {composite} composite
     * @param {body} body
     * @param {boolean} [deep=false]
     * @return {composite} The original composite with the body removed
     */
    Composite.removeBody = function(composite, body, deep) {
        var position = Common.indexOf(composite.bodies, body);

        if (position !== -1) {
            Composite.removeBodyAt(composite, position);
            body.sleepCounter = 0;

            // Drop any warmed position impulse the body was still carrying.
            //
            // `Resolver.postSolvePosition`'s scoped path keeps a persistent
            // carry list of bodies whose impulse is still decaying, so that a
            // body whose pair ended still finishes its decay without the
            // solver having to scan the whole world. Nothing in that list is
            // otherwise told when a body LEAVES the world, so a removed body
            // stayed in it, having its vertices translated and bounds
            // recomputed every step until the impulse decayed out (~90 steps).
            // The classic all-bodies path never touched an out-of-world body,
            // so this both restores that behaviour and stops the list filling
            // with dead bodies on a world with heavy removal churn.
            body.positionImpulse.x = 0;
            body.positionImpulse.y = 0;

            // Tell the gridStatic broadphase this body left the world. It
            // notices a departure on its own by stamping bodies as it walks
            // them, but that cannot see a body removed and added back before
            // the next walk, which keeps its place in the static index while
            // its position in the body array (and so its place in bucket
            // order) changes. See Detector._staticIndexInsert.
            body._sDeparted = true;
        }

        if (deep) {
            for (var i = 0; i < composite.composites.length; i++){
                Composite.removeBody(composite.composites[i], body, true);
            }
        }

        return composite;
    };

    /**
     * Removes a body from the given composite.
     * @private
     * @method removeBodyAt
     * @param {composite} composite
     * @param {number} position
     * @return {composite} The original composite with the body removed
     */
    Composite.removeBodyAt = function(composite, position) {
        var body = composite.bodies[position];

        Composite._ownBodies(composite);
        composite.bodies.splice(position, 1);
        Composite._journalRemoved(composite, body);
        Composite._setModifiedJournaled(composite);
        return composite;
    };

    /**
     * Records in the body journal that `body` left `composite`, and ends its
     * membership (see Common._journalTouch). Removing a body the journal does
     * not hold as a member is a change it cannot describe, so it switches off.
     * @private
     * @method _journalRemoved
     * @param {composite} composite
     * @param {body} body
     */
    Composite._journalRemoved = function(composite, body) {
        if (composite._journalLive === true) {
            if (body._sOwner === composite && body._sWalk === composite._memberGen) {
                composite._journalLength--;
                Common._journalPush(composite, body);
            } else {
                composite._journalLive = false;
            }
        }

        if (body._sOwner === composite) {
            body._sOwner = null;
            body._sWalk = -1;
        }
    };

    /**
     * Removes every body in `bodies` from the given composite in ONE
     * order-preserving pass over its body array, with everything
     * `Composite.removeBody` does to each body it removes. For a caller
     * removing many bodies at once this is O(bodies in the composite) once,
     * where a `removeBody` per body is O(bodies) each. A body listed but not
     * in the composite is left alone; a body in the composite more than once
     * is removed every time. Does not search child composites, and does not
     * trigger the `beforeRemove` / `afterRemove` events.
     *
     * Prefer this to editing `composite.bodies` and calling
     * `Composite.setModified`: it records the removals in the body journal,
     * so a `gridStatic` detector need not walk every body to find them.
     * @method removeBodies
     * @param {composite} composite
     * @param {body[]} bodies
     * @return {composite} The original composite with the bodies removed
     */
    Composite.removeBodies = function(composite, bodies) {
        var bodiesLength = bodies.length,
            saved = Composite._removeSaved,
            i;

        if (bodiesLength === 0) {
            return composite;
        }

        // mark the listed bodies in `_sWalk` with values no walk ever
        // writes, keeping what each held: -2 for a journal member, -3 for
        // anything else, so the pass below can tell a removal the journal can
        // describe from one it cannot. A listed body that turns out not to be
        // here gets its value back afterwards, so a body in another world
        // keeps its membership there
        var isLive = composite._journalLive === true,
            memberGen = composite._memberGen;

        for (i = 0; i < bodiesLength; i++) {
            var listed = bodies[i],
                walk = listed._sWalk;

            if (walk <= -2) {
                // listed twice: already marked
                saved[i] = 0;
                continue;
            }

            saved[i] = walk;
            listed._sWalk = isLive && listed._sOwner === composite && walk === memberGen ? -2 : -3;
        }

        Composite._ownBodies(composite);

        var worldBodies = composite.bodies,
            worldLength = worldBodies.length,
            removed = 0,
            write = 0;

        for (i = 0; i < worldLength; i++) {
            var body = worldBodies[i],
                mark = body._sWalk;

            if (mark > -2 || mark < -4) {
                worldBodies[write++] = body;
                continue;
            }

            removed++;

            // what Composite.removeBody does to a body it removes
            body.sleepCounter = 0;
            body.positionImpulse.x = 0;
            body.positionImpulse.y = 0;
            body._sDeparted = true;

            if (mark === -2) {
                composite._journalLength--;
                if (composite._journalLive === true) {
                    Common._journalPush(composite, body);
                }
            } else if (mark === -3) {
                composite._journalLive = false;
            }

            // -4: removed, and any later copy of it in the array goes too
            body._sWalk = -4;
        }

        if (worldBodies.length !== write) {
            worldBodies.length = write;
        }

        // a removed body ends its membership here, as in
        // Composite._journalRemoved; any other listed body (one that was not
        // here, or one owned by another composite) gets its stamp back, so
        // its membership there is untouched
        for (i = 0; i < bodiesLength; i++) {
            var gone = bodies[i],
                goneWalk = gone._sWalk;

            if (goneWalk === -4 && gone._sOwner === composite) {
                gone._sWalk = -1;
                gone._sOwner = null;
            } else if (goneWalk <= -2 && goneWalk >= -4) {
                gone._sWalk = saved[i];
            }

            saved[i] = 0;
        }

        if (removed > 0) {
            Composite._setModifiedJournaled(composite);
        }

        return composite;
    };

    // scratch for Composite.removeBodies: the `_sWalk` each listed body held
    Composite._removeSaved = [];

    /**
     * Adds a constraint to the given composite.
     * @private
     * @method addConstraint
     * @param {composite} composite
     * @param {constraint} constraint
     * @return {composite} The original composite with the constraint added
     */
    Composite.addConstraint = function(composite, constraint) {
        composite.constraints.push(constraint);
        // no body changed, so the body journal stays live
        Composite._setModifiedJournaled(composite);
        return composite;
    };

    /**
     * Removes a constraint from the given composite, and optionally searching its children recursively.
     * @private
     * @method removeConstraint
     * @param {composite} composite
     * @param {constraint} constraint
     * @param {boolean} [deep=false]
     * @return {composite} The original composite with the constraint removed
     */
    Composite.removeConstraint = function(composite, constraint, deep) {
        var position = Common.indexOf(composite.constraints, constraint);
        
        if (position !== -1) {
            Composite.removeConstraintAt(composite, position);
        }

        if (deep) {
            for (var i = 0; i < composite.composites.length; i++){
                Composite.removeConstraint(composite.composites[i], constraint, true);
            }
        }

        return composite;
    };

    /**
     * Removes a body from the given composite.
     * @private
     * @method removeConstraintAt
     * @param {composite} composite
     * @param {number} position
     * @return {composite} The original composite with the constraint removed
     */
    Composite.removeConstraintAt = function(composite, position) {
        composite.constraints.splice(position, 1);
        // no body changed, so the body journal stays live
        Composite._setModifiedJournaled(composite);
        return composite;
    };

    /**
     * Removes all bodies, constraints and composites from the given composite.
     * Optionally clearing its children recursively.
     * @method clear
     * @param {composite} composite
     * @param {boolean} keepStatic
     * @param {boolean} [deep=false]
     */
    Composite.clear = function(composite, keepStatic, deep) {
        if (deep) {
            for (var i = 0; i < composite.composites.length; i++){
                Composite.clear(composite.composites[i], keepStatic, true);
            }
        }
        
        Composite._ownBodies(composite);

        // same reason as Composite.removeBody: a body leaving the world must not
        // stay in the resolver's warmed-impulse carry list
        for (var b = 0; b < composite.bodies.length; b++) {
            var clearedBody = composite.bodies[b];
            if (!keepStatic || !clearedBody.isStatic) {
                clearedBody.positionImpulse.x = 0;
                clearedBody.positionImpulse.y = 0;
                clearedBody._sDeparted = true;
            }
        }

        if (keepStatic) {
            composite.bodies = composite.bodies.filter(function(body) { return body.isStatic; });
        } else {
            composite.bodies.length = 0;
        }

        composite.constraints.length = 0;
        composite.composites.length = 0;

        Composite.setModified(composite, true, true, false);

        return composite;
    };

    /**
     * Returns all bodies in the given composite, including all bodies in its children, recursively.
     * @method allBodies
     * @param {composite} composite
     * @return {body[]} All the bodies
     */
    Composite.allBodies = function(composite) {
        if (composite.cache && composite.cache.allBodies) {
            return composite.cache.allBodies;
        }

        var bodies = [].concat(composite.bodies);

        for (var i = 0; i < composite.composites.length; i++)
            bodies = bodies.concat(Composite.allBodies(composite.composites[i]));

        if (composite.cache) {
            composite.cache.allBodies = bodies;
        }

        return bodies;
    };

    /**
     * Returns all constraints in the given composite, including all constraints in its children, recursively.
     * @method allConstraints
     * @param {composite} composite
     * @return {constraint[]} All the constraints
     */
    Composite.allConstraints = function(composite) {
        if (composite.cache && composite.cache.allConstraints) {
            return composite.cache.allConstraints;
        }

        var constraints = [].concat(composite.constraints);

        for (var i = 0; i < composite.composites.length; i++)
            constraints = constraints.concat(Composite.allConstraints(composite.composites[i]));

        if (composite.cache) {
            composite.cache.allConstraints = constraints;
        }

        return constraints;
    };

    /**
     * Returns all composites in the given composite, including all composites in its children, recursively.
     * @method allComposites
     * @param {composite} composite
     * @return {composite[]} All the composites
     */
    Composite.allComposites = function(composite) {
        if (composite.cache && composite.cache.allComposites) {
            return composite.cache.allComposites;
        }

        var composites = [].concat(composite.composites);

        for (var i = 0; i < composite.composites.length; i++)
            composites = composites.concat(Composite.allComposites(composite.composites[i]));

        if (composite.cache) {
            composite.cache.allComposites = composites;
        }

        return composites;
    };

    /**
     * Searches the composite recursively for an object matching the type and id supplied, null if not found.
     * @method get
     * @param {composite} composite
     * @param {number} id
     * @param {string} type
     * @return {object} The requested object, if found
     */
    Composite.get = function(composite, id, type) {
        var objects,
            object;

        switch (type) {
        case 'body':
            objects = Composite.allBodies(composite);
            break;
        case 'constraint':
            objects = Composite.allConstraints(composite);
            break;
        case 'composite':
            objects = Composite.allComposites(composite).concat(composite);
            break;
        }

        if (!objects)
            return null;

        object = objects.filter(function(object) { 
            return object.id.toString() === id.toString(); 
        });

        return object.length === 0 ? null : object[0];
    };

    /**
     * Moves the given object(s) from compositeA to compositeB (equal to a remove followed by an add).
     * @method move
     * @param {compositeA} compositeA
     * @param {object[]} objects
     * @param {compositeB} compositeB
     * @return {composite} Returns compositeA
     */
    Composite.move = function(compositeA, objects, compositeB) {
        Composite.remove(compositeA, objects);
        Composite.add(compositeB, objects);
        return compositeA;
    };

    /**
     * Assigns new ids for all objects in the composite, recursively.
     * @method rebase
     * @param {composite} composite
     * @return {composite} Returns composite
     */
    Composite.rebase = function(composite) {
        var objects = Composite.allBodies(composite)
            .concat(Composite.allConstraints(composite))
            .concat(Composite.allComposites(composite));

        for (var i = 0; i < objects.length; i++) {
            objects[i].id = Common.nextId();
        }

        return composite;
    };

    /**
     * Translates all children in the composite by a given vector relative to their current positions, 
     * without imparting any velocity.
     * @method translate
     * @param {composite} composite
     * @param {vector} translation
     * @param {bool} [recursive=true]
     */
    Composite.translate = function(composite, translation, recursive) {
        var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

        for (var i = 0; i < bodies.length; i++) {
            Body.translate(bodies[i], translation);
        }

        return composite;
    };

    /**
     * Rotates all children in the composite by a given angle about the given point, without imparting any angular velocity.
     * @method rotate
     * @param {composite} composite
     * @param {number} rotation
     * @param {vector} point
     * @param {bool} [recursive=true]
     */
    Composite.rotate = function(composite, rotation, point, recursive) {
        var cos = Math.cos(rotation),
            sin = Math.sin(rotation),
            bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                dx = body.position.x - point.x,
                dy = body.position.y - point.y;
                
            Body.setPosition(body, {
                x: point.x + (dx * cos - dy * sin),
                y: point.y + (dx * sin + dy * cos)
            });

            Body.rotate(body, rotation);
        }

        return composite;
    };

    /**
     * Scales all children in the composite, including updating physical properties (mass, area, axes, inertia), from a world-space point.
     * @method scale
     * @param {composite} composite
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {vector} point
     * @param {bool} [recursive=true]
     */
    Composite.scale = function(composite, scaleX, scaleY, point, recursive) {
        var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;

        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i],
                dx = body.position.x - point.x,
                dy = body.position.y - point.y;
                
            Body.setPosition(body, {
                x: point.x + dx * scaleX,
                y: point.y + dy * scaleY
            });

            Body.scale(body, scaleX, scaleY);
        }

        return composite;
    };

    /**
     * Returns the union of the bounds of all of the composite's bodies.
     * @method bounds
     * @param {composite} composite The composite.
     * @returns {bounds} The composite bounds.
     */
    Composite.bounds = function(composite) {
        var bodies = Composite.allBodies(composite),
            vertices = [];

        for (var i = 0; i < bodies.length; i += 1) {
            var body = bodies[i];
            vertices.push(body.bounds.min, body.bounds.max);
        }

        return Bounds.create(vertices);
    };

    /*
    *
    *  Events Documentation
    *
    */

    /**
    * Fired when a call to `Composite.add` is made, before objects have been added.
    *
    * @event beforeAdd
    * @param {} event An event object
    * @param {} event.object The object(s) to be added (may be a single body, constraint, composite or a mixed array of these)
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when a call to `Composite.add` is made, after objects have been added.
    *
    * @event afterAdd
    * @param {} event An event object
    * @param {} event.object The object(s) that have been added (may be a single body, constraint, composite or a mixed array of these)
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when a call to `Composite.remove` is made, before objects have been removed.
    *
    * @event beforeRemove
    * @param {} event An event object
    * @param {} event.object The object(s) to be removed (may be a single body, constraint, composite or a mixed array of these)
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /**
    * Fired when a call to `Composite.remove` is made, after objects have been removed.
    *
    * @event afterRemove
    * @param {} event An event object
    * @param {} event.object The object(s) that have been removed (may be a single body, constraint, composite or a mixed array of these)
    * @param {} event.source The source object of the event
    * @param {} event.name The name of the event
    */

    /*
    *
    *  Properties Documentation
    *
    */

    /**
     * An integer `Number` uniquely identifying number generated in `Composite.create` by `Common.nextId`.
     *
     * @property id
     * @type number
     */

    /**
     * A `String` denoting the type of object.
     *
     * @property type
     * @type string
     * @default "composite"
     * @readOnly
     */

    /**
     * An arbitrary `String` name to help the user identify and manage composites.
     *
     * @property label
     * @type string
     * @default "Composite"
     */

    /**
     * A flag that specifies whether the composite has been modified during the current step.
     * This is automatically managed when bodies, constraints or composites are added or removed.
     *
     * @property isModified
     * @type boolean
     * @default false
     */

    /**
     * The `Composite` that is the parent of this composite. It is automatically managed by the `Matter.Composite` methods.
     *
     * @property parent
     * @type composite
     * @default null
     */

    /**
     * An array of `Body` that are _direct_ children of this composite.
     * To add or remove bodies you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
     * If you wish to recursively find all descendants, you should use the `Composite.allBodies` method.
     *
     * @property bodies
     * @type body[]
     * @default []
     */

    /**
     * An array of `Constraint` that are _direct_ children of this composite.
     * To add or remove constraints you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
     * If you wish to recursively find all descendants, you should use the `Composite.allConstraints` method.
     *
     * @property constraints
     * @type constraint[]
     * @default []
     */

    /**
     * An array of `Composite` that are _direct_ children of this composite.
     * To add or remove composites you should use `Composite.add` and `Composite.remove` methods rather than directly modifying this property.
     * If you wish to recursively find all descendants, you should use the `Composite.allComposites` method.
     *
     * @property composites
     * @type composite[]
     * @default []
     */

    /**
     * An object reserved for storing plugin-specific properties.
     *
     * @property plugin
     * @type {}
     */

    /**
     * An object used for storing cached results for performance reasons.
     * This is used internally only and is automatically managed.
     *
     * @private
     * @property cache
     * @type {}
     */

})();
