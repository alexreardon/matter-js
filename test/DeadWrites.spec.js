/* eslint-env es6, jest */
"use strict";

// Guards for the writes the engine stopped making because nothing reads them
// before they are overwritten.
//
// Each DEAD guard poisons a field with NaN at the point in the update where
// the dropped write used to land (the end of the update) and requires the
// whole run to stay bit-identical: a field nothing reads cannot move anything.
// Each group carries a NEGATIVE CONTROL that poisons a LIVE field the same way
// and must diverge, so a fingerprint that has stopped seeing the state cannot
// pass silently.
//
// The scene is the churn regime in miniature: statics released into debris,
// a debris body frozen back to static on a later update (the one path where
// the static index reads a body's bounds after the position solve), and age
// eviction with the page topped back up.

const Common = require('../src/core/Common');
const Engine = require('../src/core/Engine');
const Bodies = require('../src/factory/Bodies');
const Body = require('../src/body/Body');
const Composite = require('../src/body/Composite');
const Detector = require('../src/collision/Detector');

const STEPS = 240;

const scratch64 = new Float64Array(1);
const scratch32 = new Uint32Array(scratch64.buffer);

// FNV-1a over the exact bits, so any last-bit difference changes the hash
function mix(hash, value) {
    scratch64[0] = value;
    hash = Math.imul(hash ^ scratch32[0], 16777619);
    return Math.imul(hash ^ scratch32[1], 16777619);
}

function fingerprint(engine) {
    let hash = 2166136261;
    const bodies = Composite.allBodies(engine.world);
    for (const body of bodies) {
        hash = mix(hash, body.id);
        hash = mix(hash, body.position.x);
        hash = mix(hash, body.position.y);
        hash = mix(hash, body.positionPrev.x);
        hash = mix(hash, body.positionPrev.y);
        hash = mix(hash, body.angle);
        hash = mix(hash, body.anglePrev);
        hash = mix(hash, body.positionImpulse.x);
        hash = mix(hash, body.positionImpulse.y);
        for (const vertex of body.vertices) {
            hash = mix(hash, vertex.x);
            hash = mix(hash, vertex.y);
        }
        if (body.isStatic) {
            // the static index's input
            hash = mix(hash, body.bounds.min.x);
            hash = mix(hash, body.bounds.max.x);
            hash = mix(hash, body.bounds.min.y);
            hash = mix(hash, body.bounds.max.y);
        }
    }
    // pair order, and the warm-start state the next update starts from
    for (const pair of engine.pairs.list) {
        hash = mix(hash, pair.id);
        hash = mix(hash, pair.contacts[0].normalImpulse);
        hash = mix(hash, pair.contacts[0].tangentImpulse);
        hash = mix(hash, pair.contacts[1].normalImpulse);
        hash = mix(hash, pair.contacts[1].tangentImpulse);
    }
    // the collision stream a consumer reads
    for (const pair of engine.pairs.collisionStart) {
        hash = mix(hash, pair.id);
    }
    return hash;
}

function run({ refreeze = true, atStepEnd = null } = {}) {
    Common._nextId = 0;
    Detector._mode = 'gridStatic';
    Detector._cellSize = 32;

    let seed = 24681;
    const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };

    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;
    for (let i = 0; i < 12; i++) {
        Composite.add(world, Bodies.rectangle(40 + i * 80, 700, 80, 40, { isStatic: true }));
    }
    const tiles = [];
    for (let row = 0; row < 14; row++) {
        for (let col = 0; col < 24; col++) {
            // built dynamic then frozen, so a release restores a real mass
            const tile = Bodies.rectangle(30 + col * 38, 40 + row * 40, 32, 34);
            Body.setStatic(tile, true);
            Composite.add(world, tile);
            tiles.push(tile);
        }
    }

    const live = [];
    const movers = () => live.map((entry) => entry.body).filter((body) => !body.isStatic);

    const hashes = [];
    let refrozen = 0;
    for (let step = 0; step < STEPS; step++) {
        for (let k = 0; k < 6 && tiles.length > 0; k++) {
            const tile = tiles.splice(Math.floor(rand() * tiles.length), 1)[0];
            Body.setStatic(tile, false);
            Body.setVelocity(tile, { x: (rand() - 0.5) * 6, y: 4 + rand() * 4 });
            live.push({ body: tile, born: step });
        }
        // freeze a body released on an EARLIER update, often while it still
        // carries a decaying position impulse
        const pick = live[Math.floor(rand() * live.length)];
        if (refreeze && pick && pick.born !== step && !pick.body.isStatic) {
            Body.setStatic(pick.body, true);
            refrozen++;
        }
        while (live.length > 0 && step - live[0].born > 40) {
            Composite.remove(world, live.shift().body);
            // top the page back up, as windowing does
            const replacement = Bodies.rectangle(30 + rand() * 880, 40 + rand() * 520, 32, 34);
            Body.setStatic(replacement, true);
            Composite.add(world, replacement);
            tiles.push(replacement);
        }
        Engine.update(engine, 1000 / 60);
        hashes.push(fingerprint(engine));
        if (atStepEnd) {
            atStepEnd({ engine, movers: movers() });
        }
    }
    return { hashes, refrozen, engine };
}

function firstDivergence(a, b) {
    return a.findIndex((hash, index) => hash !== b[index]);
}

describe('dead writes: the reference', () => {
    test('two unpoisoned runs are identical, and the scene exercises contacts and re-freezes', () => {
        const first = run();
        expect(firstDivergence(first.hashes, run().hashes)).toBe(-1);
        expect(first.refrozen).toBeGreaterThan(100);
        expect(first.engine.pairs.list.length).toBeGreaterThan(50);
    });
});

describe('dead writes: pair records', () => {
    test('pair.separation is dead at the end of an update (poisoned: identical)', () => {
        const poisoned = run({
            atStepEnd: ({ engine }) => engine.pairs.list.forEach((pair) => {
                pair.separation = NaN;
            })
        });
        expect(firstDivergence(run().hashes, poisoned.hashes)).toBe(-1);
    });

    test('NEGATIVE: a warm-start impulse zeroed at the end of an update diverges', () => {
        const poisoned = run({
            atStepEnd: ({ engine }) => engine.pairs.list.forEach((pair) => {
                pair.contacts[0].normalImpulse = 0;
            })
        });
        expect(firstDivergence(run().hashes, poisoned.hashes)).not.toBe(-1);
    });
});
