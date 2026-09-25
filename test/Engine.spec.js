/* eslint-env es6, jest */
"use strict";

// Unit tests for the resting-body fast path in Matter.Engine: static and
// sleeping bodies are skipped by the per-step velocity and force passes, and
// their cached velocity is zeroed at the moment they come to rest so the skip
// is not observable. Requires the source modules directly (no build step).
const Engine = require('../src/core/Engine');
const Body = require('../src/body/Body');
const Bodies = require('../src/factory/Bodies');
const Composite = require('../src/body/Composite');
const Sleeping = require('../src/core/Sleeping');

const DELTA = 1000 / 60;

describe('Engine resting-body passes', () => {
    test('a static body keeps zero velocity and does not move during a step', () => {
        const engine = Engine.create();
        engine.gravity.y = 1;
        const body = Bodies.rectangle(0, 0, 50, 50, { isStatic: true });
        Composite.add(engine.world, body);

        Engine.update(engine, DELTA);

        expect(body.velocity).toEqual({ x: 0, y: 0 });
        expect(body.speed).toBe(0);
        expect(body.position).toEqual({ x: 0, y: 0 });
    });

    test('setStatic zeroes the cached velocity of a moving body immediately', () => {
        const engine = Engine.create();
        const body = Bodies.rectangle(0, 0, 50, 50);
        Composite.add(engine.world, body);
        Body.setVelocity(body, { x: 5, y: -3 });

        Body.setStatic(body, true);

        expect(body.velocity).toEqual({ x: 0, y: 0 });
        expect(body.speed).toBe(0);

        Engine.update(engine, DELTA);
        expect(body.velocity).toEqual({ x: 0, y: 0 });
    });

    test('a sleeping body keeps zero velocity across a step', () => {
        const engine = Engine.create({ enableSleeping: true });
        const body = Bodies.rectangle(0, 0, 50, 50);
        Composite.add(engine.world, body);
        Body.setVelocity(body, { x: 4, y: 2 });

        Sleeping.set(body, true);
        expect(body.velocity).toEqual({ x: 0, y: 0 });

        Engine.update(engine, DELTA);
        expect(body.isSleeping).toBe(true);
        expect(body.velocity).toEqual({ x: 0, y: 0 });
    });

    test('a dynamic body still integrates and updates its velocity each step', () => {
        const engine = Engine.create();
        engine.gravity.y = 1;
        const body = Bodies.rectangle(0, 0, 50, 50);
        Composite.add(engine.world, body);

        Engine.update(engine, DELTA);

        // gravity is integrated, so the body falls and gains downward velocity
        expect(body.position.y).toBeGreaterThan(0);
        expect(body.velocity.y).toBeGreaterThan(0);
    });

    test('a force applied to a dynamic body is still cleared after the step', () => {
        const engine = Engine.create();
        const body = Bodies.rectangle(0, 0, 50, 50);
        Composite.add(engine.world, body);

        Body.applyForce(body, body.position, { x: 0.05, y: 0 });
        expect(body.force.x).toBeCloseTo(0.05);

        Engine.update(engine, DELTA);
        expect(body.force).toEqual({ x: 0, y: 0 });
    });

    test('a force applied while static cannot survive into a release', () => {
        // The per-step force pass covers moving bodies only: clearing every body
        // in the world meant writing to a force buffer for every intact tile of
        // a dense static page, and those scattered writes cost more across the
        // step than the pass itself shows. A resting body is never integrated,
        // so its buffer cannot affect the simulation while it rests; what must
        // not happen is a force applied while it rested detonating it on release,
        // so Body.setStatic zeroes the buffer on both transitions.
        const engine = Engine.create();
        engine.gravity.y = 0;
        const body = Bodies.rectangle(0, 0, 50, 50, { isStatic: true });
        Composite.add(engine.world, body);

        Body.applyForce(body, body.position, { x: 10, y: 10 });
        Engine.update(engine, DELTA);

        Body.setStatic(body, false);
        expect(body.force).toEqual({ x: 0, y: 0 });

        Engine.update(engine, DELTA);
        expect(body.velocity).toEqual({ x: 0, y: 0 });
    });

    test('with sleeping enabled a resting body still has its force cleared each step', () => {
        // Sleeping.update reads a resting body's force to decide whether to wake
        // it, which is the one place the buffer is observable while a body rests.
        // So an engine with sleeping enabled keeps the whole-world force pass: a
        // value left in the buffer would hold the body awake for good.
        const engine = Engine.create({ enableSleeping: true });
        engine.gravity.y = 0;
        const body = Bodies.rectangle(0, 0, 50, 50);
        Composite.add(engine.world, body);

        Sleeping.set(body, true);
        Body.applyForce(body, body.position, { x: 10, y: 10 });
        Engine.update(engine, DELTA);

        expect(body.force).toEqual({ x: 0, y: 0 });
    });
});

describe('Engine per-update events', () => {
    const Events = require('../src/core/Events');

    test('each event reaches its listener with the name, source, timestamp and delta of the update', () => {
        const engine = Engine.create();
        const seen = [];
        ['beforeUpdate', 'beforeSolve', 'afterUpdate'].forEach((name) => {
            Events.on(engine, name, (event) => {
                seen.push([event.name, event.source === engine, event.timestamp, event.delta]);
            });
        });

        Engine.update(engine, DELTA);

        expect(seen).toEqual([
            ['beforeUpdate', true, DELTA, DELTA],
            ['beforeSolve', true, DELTA, DELTA],
            ['afterUpdate', true, DELTA, DELTA]
        ]);
    });

    test('a listener that moves the clock does not change the timestamp a later event of the same update reports', () => {
        const engine = Engine.create();
        let afterTimestamp = null;
        Events.on(engine, 'beforeUpdate', () => {
            engine.timing.timestamp += 1000;
        });
        Events.on(engine, 'afterUpdate', (event) => {
            afterTimestamp = event.timestamp;
        });

        Engine.update(engine, DELTA);

        expect(afterTimestamp).toBe(DELTA);
    });

    test('a listener added by an earlier event of the same update is called in that update', () => {
        const engine = Engine.create();
        let added = false;
        let afterCalls = 0;
        Events.on(engine, 'beforeUpdate', () => {
            if (!added) {
                added = true;
                Events.on(engine, 'afterUpdate', () => {
                    afterCalls += 1;
                });
            }
        });

        Engine.update(engine, DELTA);

        expect(afterCalls).toBe(1);
    });

    test('an update with no listeners triggers nothing', () => {
        const engine = Engine.create();
        Composite.add(engine.world, [
            Bodies.rectangle(0, 0, 50, 50),
            Bodies.rectangle(0, 60, 400, 20, { isStatic: true })
        ]);
        const trigger = jest.spyOn(Events, 'trigger');

        try {
            for (let i = 0; i < 30; i++) {
                Engine.update(engine, DELTA);
            }
            expect(engine.pairs.list.length).toBeGreaterThan(0);
            expect(trigger).not.toHaveBeenCalled();
        } finally {
            trigger.mockRestore();
        }
    });

    test('a single-name trigger calls exactly what the multi-name form calls, each listener with its own copy of the payload', () => {
        const target = { events: null };
        const calls = [];
        Events.on(target, 'alpha', (event) => {
            calls.push(['alpha', event.name, event.source === target, event.value]);
            event.value = 'changed';
        });
        Events.on(target, 'beta', (event) => {
            calls.push(['beta', event.name, event.source === target, event.value]);
        });
        const payload = { value: 1 };

        Events.trigger(target, 'alpha', payload);
        Events.trigger(target, 'beta', payload);
        Events.trigger(target, 'alpha beta', payload);
        Events.trigger(target, 'gamma', payload);
        Events.trigger({ events: {} }, 'alpha', payload);
        Events.trigger({ events: null }, 'alpha', payload);

        expect(calls).toEqual([
            ['alpha', 'alpha', true, 1],
            ['beta', 'beta', true, 1],
            ['alpha', 'alpha', true, 1],
            ['beta', 'beta', true, 1]
        ]);
        expect(payload).toEqual({ value: 1 });
    });

    test('a trigger with no payload hands the listener an event carrying only its name and source', () => {
        const target = { events: null };
        let received = null;
        Events.on(target, 'alpha', (event) => {
            received = event;
        });

        Events.trigger(target, 'alpha');

        expect(received).toEqual({ name: 'alpha', source: target });
    });

    test('an event name that exists only on the prototype has no listener', () => {
        const target = { events: {} };
        Events.on(target, 'alpha', () => {});

        expect(() => Events.trigger(target, 'constructor', {})).not.toThrow();
        expect(() => Events.trigger({ events: [] }, 'push', {})).not.toThrow();
    });
});

describe('Engine collision lists', () => {
    const Events = require('../src/core/Events');
    const Pairs = require('../src/collision/Pairs');

    // a pile settling on a floor, with a body taken out now and then so pairs
    // also end; returns per-update fingerprints and the list lengths it saw
    function runPile(listen) {
        // ids feed the pair ids and the fingerprint, so both runs start alike
        require('../src/core/Common')._nextId = 0;
        const engine = Engine.create();
        const boxes = [];
        Composite.add(engine.world, Bodies.rectangle(200, 400, 600, 40, { isStatic: true }));
        for (let i = 0; i < 24; i++) {
            const box = Bodies.rectangle(40 + (i % 8) * 45, 100 + Math.floor(i / 8) * 45, 40, 40);
            boxes.push(box);
            Composite.add(engine.world, box);
        }
        const heard = { active: 0, end: 0 };
        if (listen) {
            Events.on(engine, 'collisionActive', (event) => {
                heard.active += event.pairs.length;
            });
            Events.on(engine, 'collisionEnd', (event) => {
                heard.end += event.pairs.length;
            });
        }
        const lengths = { start: 0, active: 0, end: 0 };
        const prints = [];
        for (let step = 0; step < 180; step++) {
            if (step % 30 === 29) {
                Composite.remove(engine.world, boxes.pop());
            }
            Engine.update(engine, DELTA);
            lengths.start += engine.pairs.collisionStart.length;
            lengths.active += engine.pairs.collisionActive.length;
            lengths.end += engine.pairs.collisionEnd.length;
            prints.push(Composite.allBodies(engine.world)
                .map((body) => [body.id, body.position.x, body.position.y, body.angle].join(','))
                .concat(engine.pairs.list.map((pair) => pair.id))
                .join('|'));
        }
        return { prints, lengths, heard };
    }

    test('with no listener, collisionStart is filled and collisionActive and collisionEnd stay empty', () => {
        const { lengths } = runPile(false);

        expect(lengths.start).toBeGreaterThan(0);
        expect(lengths.active).toBe(0);
        expect(lengths.end).toBe(0);
    });

    test('a listener receives the filled list, and listening changes nothing else', () => {
        const quiet = runPile(false);
        const listened = runPile(true);

        expect(listened.lengths.active).toBeGreaterThan(0);
        expect(listened.lengths.end).toBeGreaterThan(0);
        expect(listened.heard.active).toBe(listened.lengths.active);
        expect(listened.heard.end).toBe(listened.lengths.end);
        expect(listened.lengths.start).toBe(quiet.lengths.start);
        expect(listened.prints).toEqual(quiet.prints);
    });

    test('Pairs.update called without the collect flags fills all three lists', () => {
        const Detector = require('../src/collision/Detector');
        const engine = Engine.create();
        Composite.add(engine.world, [
            Bodies.rectangle(0, 0, 40, 40),
            Bodies.rectangle(0, 25, 400, 20, { isStatic: true })
        ]);
        Detector.setBodies(engine.detector, Composite.allBodies(engine.world));
        const pairs = engine.pairs;

        Pairs.update(pairs, Detector.collisions(engine.detector), 1);
        expect(pairs.collisionStart.length).toBe(1);

        Pairs.update(pairs, Detector.collisions(engine.detector), 2);
        expect(pairs.collisionActive.length).toBe(1);

        Pairs.update(pairs, [], 3);
        expect(pairs.collisionEnd.length).toBe(1);
    });
});
