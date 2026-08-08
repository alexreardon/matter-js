/* eslint-env node, jest */
/**
* Hidden-class guard for the engine's mass-population objects.
*
* The fork's performance model depends on every body (and pair, contact and
* collision record) sharing ONE object shape for its whole life: a field
* assigned onto one of these objects after its factory returned splits the
* population into multiple hidden classes and degrades every hot property
* access site engine-wide (measured 1.3-4.8x per phase when `_solverStamp`
* was lazily stamped; see the rule block in `Body.create`).
*
* The rule lived only in a comment until perf14, and it had been violated
* three times inside the fork itself. These specs make the class mechanical:
*
* 1. LAST-KEY INVARIANT: property insertion order is key order, so any field
*    assigned after the factory literal lands at the END of the key list.
*    Asserting the last own key equals the factory literal's last key catches
*    every lazy addition, including one made inside the factory after the
*    literal (that is exactly how `inverseMass` used to spill out-of-object).
* 2. UNIFORM KEY ORDER: after a full churn scenario in BOTH broadphase modes,
*    every live object of a kind must share the identical key list.
*
* If a spec here fails after you added a field: declare it in the factory
* literal (with a default of the type it will hold) instead of assigning it
* at first use. Do not extend the expected key lists from a live object
* without checking where the new key came from.
*/

var Matter = require('../src/module/main.js');
var Engine = Matter.Engine;
var Bodies = Matter.Bodies;
var Body = Matter.Body;
var Composite = Matter.Composite;
var Pair = Matter.Pair;
var Contact = require('../src/collision/Contact');
var Collision = Matter.Collision;
var Detector = Matter.Detector;
var Sleeping = Matter.Sleeping;

// the last key of each factory literal. A lazily assigned field lands AFTER
// this key; update these only when the factory literal itself gains a field
// at its end.
var LAST_BODY_KEY = '_spValid';
var LAST_PAIR_KEY = 'slop';
var LAST_CONTACT_KEY = 'tangentImpulse';
var LAST_COLLISION_KEY = 'supportCount';

function lastKey(object) {
    var keys = Object.keys(object);
    return keys[keys.length - 1];
}

function makeRandom(seed) {
    var state = seed;
    return function random() {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

/**
* A small page-like world driven through every mutation path the game and the
* examples exercise: settling contacts, churn (release / remove / re-add),
* static flips, sleeping flips, velocity writes, scaling, a compound body and
* a sensor, in the given broadphase mode.
*/
function runScenario(mode) {
    var engine = Engine.create({ enableSleeping: mode === 'sweep' });
    Detector._mode = mode;

    var random = makeRandom(7);
    var world = engine.world;
    var statics = [];
    var i;

    // floor and walls
    Composite.add(world, Bodies.rectangle(400, 620, 900, 40, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(-20, 300, 40, 700, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(820, 300, 40, 700, { isStatic: true }));

    // a static tile field (built dynamic then frozen, the game's pattern)
    for (i = 0; i < 120; i++) {
        var tile = Bodies.rectangle(60 + (i % 12) * 60, 80 + Math.floor(i / 12) * 40, 50, 30);
        Body.setStatic(tile, true);
        Composite.add(world, tile);
        statics.push(tile);
    }

    // movers: boxes, a polygon, a circle, a compound, a sensor
    for (i = 0; i < 40; i++) {
        Composite.add(world, Bodies.rectangle(100 + random() * 600, -40 - random() * 300, 24, 24));
    }
    Composite.add(world, Bodies.polygon(300, -400, 5, 18));
    Composite.add(world, Bodies.circle(500, -450, 14));
    Composite.add(world, Body.create({
        parts: [Bodies.rectangle(200, -500, 30, 16), Bodies.rectangle(210, -490, 16, 30)]
    }));
    Composite.add(world, Bodies.rectangle(400, -520, 20, 20, { isSensor: true }));

    for (var step = 0; step < 240; step++) {
        // churn: release one tile, remove one released body, re-add one
        if (step % 3 === 0 && statics.length > 20) {
            var released = statics.pop();
            Body.setStatic(released, false);
            Body.setVelocity(released, { x: random() * 4 - 2, y: -2 });
            Body.setAngularVelocity(released, random() * 0.2 - 0.1);
        }

        if (step === 60) {
            var moved = statics[3];
            Detector.setGridDynamic(moved, true);
            Body.setPosition(moved, { x: moved.position.x + 5, y: moved.position.y });
        }

        if (step === 90) {
            var removed = world.bodies[world.bodies.length - 1];
            Composite.remove(world, removed);
            Composite.add(world, removed);
        }

        if (step === 120) {
            Body.scale(world.bodies[4], 1.1, 1.1);
            Sleeping.set(world.bodies[world.bodies.length - 2], true);
            Sleeping.set(world.bodies[world.bodies.length - 2], false);
        }

        Engine.update(engine, 1000 / 60);
    }

    return engine;
}

describe.each(['sweep', 'gridStatic'])('object shapes stay factory-shaped (%s)', function(mode) {
    var engine = runScenario(mode);
    var bodies = Composite.allBodies(engine.world);
    var pairsList = engine.pairs.list;

    it('exercised the regime (bodies, live pairs)', function() {
        expect(bodies.length).toBeGreaterThan(150);
        expect(pairsList.length).toBeGreaterThan(20);
    });

    it('no body gained a field after Body.create', function() {
        for (var i = 0; i < bodies.length; i++) {
            var body = bodies[i];
            expect(lastKey(body)).toBe(LAST_BODY_KEY);
            for (var j = 0; j < body.parts.length; j++) {
                expect(lastKey(body.parts[j])).toBe(LAST_BODY_KEY);
            }
        }
    });

    it('every body shares one key order', function() {
        var reference = Object.keys(bodies[0]).join(',');
        for (var i = 1; i < bodies.length; i++) {
            expect(Object.keys(bodies[i]).join(',')).toBe(reference);
        }
    });

    it('no pair, contact or collision record gained a field', function() {
        for (var i = 0; i < pairsList.length; i++) {
            var pair = pairsList[i];
            expect(lastKey(pair)).toBe(LAST_PAIR_KEY);
            expect(lastKey(pair.contacts[0])).toBe(LAST_CONTACT_KEY);
            expect(lastKey(pair.contacts[1])).toBe(LAST_CONTACT_KEY);
            expect(lastKey(pair.collision)).toBe(LAST_COLLISION_KEY);
        }
    });

    it('pairs and records share one key order', function() {
        var pairReference = Object.keys(pairsList[0]).join(',');
        var recordReference = Object.keys(pairsList[0].collision).join(',');
        for (var i = 1; i < pairsList.length; i++) {
            expect(Object.keys(pairsList[i]).join(',')).toBe(pairReference);
            expect(Object.keys(pairsList[i].collision).join(',')).toBe(recordReference);
        }
    });
});

describe('factory outputs agree with the pinned last keys', function() {
    it('Body.create', function() {
        expect(lastKey(Bodies.rectangle(0, 0, 40, 20))).toBe(LAST_BODY_KEY);
    });

    it('Pair.create, Contact.create, Collision.create', function() {
        var bodyA = Bodies.rectangle(0, 0, 40, 20);
        var bodyB = Bodies.rectangle(10, 10, 40, 20);
        var collision = Collision.create(bodyA, bodyB);
        expect(lastKey(collision)).toBe(LAST_COLLISION_KEY);
        expect(lastKey(Contact.create())).toBe(LAST_CONTACT_KEY);
        collision.supportCount = 0;
        var pair = Pair.create(collision, 0);
        expect(lastKey(pair)).toBe(LAST_PAIR_KEY);
    });
});
