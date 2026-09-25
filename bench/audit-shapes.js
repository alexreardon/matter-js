/* eslint-env node */
// V8-level shape audit for the engine's hot object populations.
//
// `test/Shape.spec.js` catches a lazily added FIELD (key-order invariants need
// no engine internals). This script audits what jest cannot see: the actual
// V8 maps and elements kinds. It would have caught all three perf14
// violations, including the two no key list can show:
//
//   1. HOLEY backing stores: `new Array(n)` left unfilled reads slower on
//      every probe forever (`pairs._recordValues`, the detector cell tables).
//   2. Out-of-object field spill / map splits: bodies not sharing one map
//      pay polymorphic access everywhere (`inverseMass` et al).
//   3. Dictionary-mode objects: a deleted or mass-assigned property drops an
//      object off fast properties entirely. Checked on bodies, pairs,
//      collisions and, since squeeze-10, every Matter MODULE object.
//
// Usage (the natives syntax REQUIRES the flag):
//   npm run audit-shapes
//   node --allow-natives-syntax bench/audit-shapes.js
//
// Exits non-zero on any violation. Run it as part of the squeeze loop, after
// any change that adds a field or an array to Body / Pair / Collision /
// Detector / Pairs state.
"use strict";

/* eslint-disable no-console */

var Matter = require('../src/module/main.js');
var Engine = Matter.Engine;
var Bodies = Matter.Bodies;
var Body = Matter.Body;
var Composite = Matter.Composite;
var Detector = Matter.Detector;
var Sleeping = Matter.Sleeping;

// hide the natives syntax from any parser that has not been told about it
/* eslint-disable no-new-func */
var haveSameMap = new Function('a', 'b', 'return %HaveSameMap(a, b);');
var hasFastProperties = new Function('o', 'return %HasFastProperties(o);');
var hasHoleyElements = new Function('a', 'return %HasHoleyElements(a);');
/* eslint-enable no-new-func */

try {
    haveSameMap({}, {});
} catch (_error) {
    console.error('audit-shapes: run with --allow-natives-syntax (npm run audit-shapes)');
    process.exit(2);
}

var failures = [];

function fail(message) {
    failures.push(message);
}

function makeRandom(seed) {
    var state = seed;
    return function random() {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

// the churny page-like world from test/Shape.spec.js, driven through release,
// removal, re-add, scaling, sleeping and a moved static
function runScenario(broadphase, solved) {
    var engine = Engine.create({
        enableSleeping: broadphase === 'sweep',
        enableSolvedVelocityAndBounds: solved,
        detector: Detector.create({ broadphase: broadphase })
    });
    var random = makeRandom(7);
    var world = engine.world;
    var statics = [];
    var i;

    Composite.add(world, Bodies.rectangle(400, 620, 900, 40, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(-20, 300, 40, 700, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(820, 300, 40, 700, { isStatic: true }));

    for (i = 0; i < 120; i++) {
        var tile = Bodies.rectangle(60 + (i % 12) * 60, 80 + Math.floor(i / 12) * 40, 50, 30);
        Body.setStatic(tile, true);
        Composite.add(world, tile);
        statics.push(tile);
    }

    for (i = 0; i < 40; i++) {
        Composite.add(world, Bodies.rectangle(100 + random() * 600, -40 - random() * 300, 24, 24));
    }

    for (var step = 0; step < 240; step++) {
        if (step % 3 === 0 && statics.length > 20) {
            var released = statics.pop();
            Body.setStatic(released, false);
            Body.setVelocity(released, { x: random() * 4 - 2, y: -2 });
        }

        // a static moved after the grid indexed it, which the setter promotes
        if (step === 60) {
            var moved = statics[3];
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

// every body in this scenario is a rectangle built the same way, so they must
// all share ONE map; a second map means a field was added to only some of them
function auditBodyMaps(mode, bodies) {
    var reference = bodies[0];
    var strayCount = 0;

    for (var i = 1; i < bodies.length; i++) {
        if (!haveSameMap(reference, bodies[i])) {
            strayCount += 1;
        }
    }

    if (strayCount > 0) {
        fail(mode + ': ' + strayCount + ' of ' + bodies.length
            + ' bodies do not share the reference body\'s map (a field was'
            + ' assigned onto part of the population)');
    }
}

function auditFastProperties(mode, engine, bodies) {
    var slow = 0;
    var i;

    for (i = 0; i < bodies.length; i++) {
        if (!hasFastProperties(bodies[i])) {
            slow += 1;
        }
    }

    var pairsList = engine.pairs.list;
    for (i = 0; i < pairsList.length; i++) {
        if (!hasFastProperties(pairsList[i])) {
            slow += 1;
        }
        if (!hasFastProperties(pairsList[i].collision)) {
            slow += 1;
        }
    }

    if (slow > 0) {
        fail(mode + ': ' + slow + ' objects fell to dictionary-mode properties');
    }
}

// every Matter module object must hold fast properties. A module in dictionary
// mode turns each hot `Module.fn(...)` load TurboFan cannot constant-fold into a
// generic LoadIC call, on every call site engine-wide. This is how `Matter.Body`
// sat for every source load through Node until squeeze-10: a circular require
// during its file's load (see the tail of src/body/Body.js) routed its property
// stores through the generic path. It also biases every in-process A/B, which
// loads both arms from source, towards whichever arm happens to be fast.
function auditModuleObjects() {
    var names = Object.keys(Matter);
    var audited = 0;

    if (!hasFastProperties(Matter)) {
        fail('the Matter namespace object fell to dictionary-mode properties');
    }

    for (var i = 0; i < names.length; i++) {
        var value = Matter[names[i]];
        if (value === null || typeof value !== 'object') {
            continue;
        }
        audited += 1;
        if (!hasFastProperties(value)) {
            fail('Matter.' + names[i] + ' is in dictionary mode (' + Object.keys(value).length
                + ' properties); every hot load through it is a generic LoadIC');
        }
    }

    if (audited < 25) {
        fail('module audit under-ran: only ' + audited + ' Matter module objects found');
    }

    console.log('modules: ' + audited + ' Matter module objects audited');
}

// walk everything reachable from the engine and flag any sizeable plain array
// with a holey backing store. Threshold skips tiny cold arrays (supports,
// parts) where holes cannot matter.
var HOLEY_LENGTH_THRESHOLD = 64;
var WALK_LIMIT = 200000;

function auditHoleyArrays(mode, engine) {
    var visited = new Set();
    var queue = [{ value: engine, path: 'engine' }];
    var walked = 0;

    while (queue.length > 0 && walked < WALK_LIMIT) {
        var entry = queue.pop();
        var value = entry.value;
        walked += 1;

        if (value === null || typeof value !== 'object' || visited.has(value)) {
            continue;
        }
        visited.add(value);

        if (Array.isArray(value)) {
            if (value.length >= HOLEY_LENGTH_THRESHOLD && hasHoleyElements(value)) {
                fail(mode + ': holey array at ' + entry.path + ' (length ' + value.length + ')');
            }
        }

        var keys = Object.keys(value);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var child = value[key];
            if (child !== null && typeof child === 'object') {
                queue.push({ value: child, path: entry.path + '.' + key });
            }
        }
    }

    if (walked >= WALK_LIMIT) {
        fail(mode + ': object walk hit its limit; raise WALK_LIMIT');
    }
}

// the third scenario is the consumer's configuration: the grid with the
// end-of-update velocity and bounds refresh off, which is what marks bodies
// `_boundsStale` in the position post-solve
[['sweep', true], ['grid', true], ['grid', false]].forEach(function(scenario) {
    var mode = scenario[0] + (scenario[1] ? '' : ' (solved state off)');
    var engine = runScenario(scenario[0], scenario[1]);
    var bodies = Composite.allBodies(engine.world);

    if (bodies.length < 150 || engine.pairs.list.length < 20) {
        fail(mode + ': scenario under-ran (bodies ' + bodies.length
            + ', pairs ' + engine.pairs.list.length + ')');
    }

    // the moved static's promotion is a write this audit must see
    if (bodies.some(function(body) { return body._sMoved; }) !== (scenario[0] === 'grid')) {
        fail(mode + ': the moved static was ' + (scenario[0] === 'grid' ? 'not ' : '') + 'promoted');
    }

    auditBodyMaps(mode, bodies);
    auditFastProperties(mode, engine, bodies);
    auditHoleyArrays(mode, engine);

    console.log(mode + ': ' + bodies.length + ' bodies, '
        + engine.pairs.list.length + ' live pairs audited');
});

// after the scenarios, so a module knocked into dictionary mode at run time is
// caught as well as one that loaded that way (the state is sticky)
auditModuleObjects();

if (failures.length > 0) {
    console.error('\naudit-shapes FAILED:');
    failures.forEach(function(message) {
        console.error('  - ' + message);
    });
    process.exit(1);
}

console.log('\naudit-shapes PASSED: one body map per population, fast properties everywhere, no sizeable holey arrays');
