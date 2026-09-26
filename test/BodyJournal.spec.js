/* eslint-env es6, jest */
"use strict";

// The body journal (see Common._journalTouch): the grid broadphase
// classifies a flat world from the bodies recorded as changed instead of
// walking every body. These specs step two identical worlds in lockstep, one
// reading its journal and one forced onto the full walk every step (its journal
// switched off before each update), and require the SAME answer after every
// update: the mover list in order, every static-index bucket in order, the
// oversized list, the static count, and every body's pose and velocity.
//
// Each scene also asserts the journal was actually read, so a pass cannot
// come from both worlds walking.
const Engine = require('../src/core/Engine');
const Events = require('../src/core/Events');
const Sleeping = require('../src/core/Sleeping');
const Detector = require('../src/collision/Detector');
const Bodies = require('../src/factory/Bodies');
const Composite = require('../src/body/Composite');
const Body = require('../src/body/Body');

const DELTA = 1000 / 60;

function createRandom(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// one world of the pair: its engine on the grid, and every body it was given,
// by index
function createArm(options) {
    const engine = Engine.create({ enableSleeping: Boolean(options.sleeping), detector: Detector.create({ broadphase: 'grid' }) });
    return { engine, world: engine.world, bodies: [], indexOf: new Map() };
}

function armState(arm) {
    const g = arm.engine.detector._sgrid;
    const indexOf = (body) => arm.indexOf.get(body);
    const buckets = [];
    for (let i = 0; i < g.sTable.keys.length; i++) {
        const bucket = g.sTable.vals[i];
        if (g.sTable.keys[i] !== 0 && bucket && bucket.length > 0) {
            buckets.push(g.sTable.keys[i] + ':' + bucket.map(indexOf).join(','));
        }
    }
    buckets.sort();
    return {
        // the engine's own mover list, which it can build from the journal
        // too (Detector._moversFromJournal)
        engineMovers: arm.engine._moverBodies.map(indexOf).join(','),
        movers: g.movers.map(indexOf).join(','),
        buckets: buckets.join('|'),
        sOver: g.sOver.map(indexOf).join(','),
        staticCount: g.staticCount,
        poses: arm.bodies.map((body) => [body.position.x, body.position.y, body.angle, body.velocity.x, body.velocity.y].join(':')).join('|')
    };
}

/**
 * Runs `steps` updates of a paired scene. `setup(arms, add)` builds the world,
 * `perStep(step, arms, random)` changes it; both act on the two arms alike.
 */
function runPair({ steps, sleeping, setup, perStep, listen, moverShare }) {
    const previousShare = Detector._journalMoverShare;
    const readJournal = Detector._classifyFromJournal;
    let journalReads = 0;

    // the journal at every mover share unless a spec says otherwise (see
    // Detector._journalMoverShare)
    Detector._journalMoverShare = moverShare === undefined ? 1 : moverShare;
    Detector._classifyFromJournal = function() {
        journalReads++;
        return readJournal.apply(this, arguments);
    };

    try {
        const journal = createArm({ sleeping });
        const walk = createArm({ sleeping });
        const arms = [journal, walk];
        const random = createRandom(99);

        const add = (make) => {
            for (const arm of arms) {
                const body = make();
                arm.indexOf.set(body, arm.bodies.length);
                arm.bodies.push(body);
                Composite.add(arm.world, body);
            }
            return journal.bodies.length - 1;
        };

        setup(arms, add, random);
        if (listen) {
            listen(arms);
        }

        for (let step = 0; step < steps; step++) {
            perStep(step, arms, random, add);

            Engine.update(journal.engine, DELTA);
            // the reference: a full classification walk on every update
            walk.world._journalLive = false;
            const readsBefore = journalReads;
            Engine.update(walk.engine, DELTA);
            expect(journalReads).toBe(readsBefore);

            expect(armState(journal)).toEqual(armState(walk));
        }

        return { journalReads, arms };
    } finally {
        Detector._journalMoverShare = previousShare;
        Detector._classifyFromJournal = readJournal;
    }
}

// a page of statics built dynamic then frozen (the game's pattern), a floor
function setupPage(arms, add) {
    for (let k = 0; k < 12; k++) {
        add(() => Bodies.rectangle(40 + k * 70, 620, 68, 30, { isStatic: true }));
    }
    for (let r = 0; r < 14; r++) {
        for (let c = 0; c < 16; c++) {
            add(() => {
                const tile = Bodies.rectangle(30 + c * 50 + (r % 2) * 6, 40 + r * 28, 42, 20);
                Body.setStatic(tile, true);
                return tile;
            });
        }
    }
}

function pick(arm, random, filter) {
    const candidates = arm.bodies.map((body, index) => index).filter((index) => filter(arm.bodies[index]));
    return candidates.length === 0 ? -1 : candidates[Math.floor(random() * candidates.length)];
}

function inWorld(arm, body) {
    return arm.world.bodies.indexOf(body) !== -1;
}

describe('the grid body journal', () => {
    it('matches the full walk through releases, re-freezes, adds and removals', () => {
        const { journalReads } = runPair({
            steps: 160,
            setup: setupPage,
            perStep(step, [journal, walk], random, add) {
                const release = pick(journal, random, (body) => body.isStatic && inWorld(journal, body));
                const velocityX = random() * 4 - 2;
                if (release !== -1) {
                    for (const arm of [journal, walk]) {
                        Body.setStatic(arm.bodies[release], false);
                        Body.setVelocity(arm.bodies[release], { x: velocityX, y: 2 });
                    }
                }
                if (step % 5 === 4) {
                    const freeze = pick(journal, random, (body) => !body.isStatic && inWorld(journal, body));
                    if (freeze !== -1) {
                        Body.setStatic(journal.bodies[freeze], true);
                        Body.setStatic(walk.bodies[freeze], true);
                    }
                }
                if (step % 3 === 1) {
                    const remove = pick(journal, random, (body) => inWorld(journal, body));
                    Composite.remove(journal.world, journal.bodies[remove]);
                    Composite.remove(walk.world, walk.bodies[remove]);
                }
                if (step % 4 === 2) {
                    const back = pick(journal, random, (body) => !inWorld(journal, body));
                    if (back !== -1) {
                        Composite.add(journal.world, journal.bodies[back]);
                        Composite.add(walk.world, walk.bodies[back]);
                    }
                    const x = 60 + random() * 700;
                    add(() => Bodies.rectangle(x, 30, 20, 20));
                }
            }
        });

        expect(journalReads).toBeGreaterThan(150);
    });

    it('matches the full walk through batch removals, same-step round trips and moving statics', () => {
        // every static a move promoted (a later release ends a promotion, so
        // they are counted as they happen)
        const promoted = new Set();
        const { journalReads, arms } = runPair({
            steps: 160,
            setup: setupPage,
            perStep(step, [journal, walk], random) {
                const release = pick(journal, random, (body) => body.isStatic && inWorld(journal, body));
                if (release !== -1) {
                    for (const arm of [journal, walk]) {
                        Body.setStatic(arm.bodies[release], false);
                    }
                }

                // windowing: a batch of statics out, a batch of parked ones in
                const out = [];
                for (let k = 0; k < 6; k++) {
                    const index = pick(journal, random, (body) => body.isStatic && inWorld(journal, body) && !body._sMoved);
                    if (index !== -1 && out.indexOf(index) === -1) {
                        out.push(index);
                    }
                }
                const back = [];
                for (let k = 0; k < 5; k++) {
                    const index = pick(journal, random, (body) => !inWorld(journal, body) && body.isStatic);
                    if (index !== -1 && back.indexOf(index) === -1 && out.indexOf(index) === -1) {
                        back.push(index);
                    }
                }
                const roundTrip = pick(journal, random, (body) => inWorld(journal, body));
                const moving = pick(journal, random, (body) => body.isStatic && inWorld(journal, body));
                const shift = random() * 10 - 5;

                for (const arm of [journal, walk]) {
                    Composite.removeBodies(arm.world, out.map((index) => arm.bodies[index]));
                    back.forEach((index) => Composite.add(arm.world, arm.bodies[index]));
                    if (out.indexOf(roundTrip) === -1) {
                        Composite.remove(arm.world, arm.bodies[roundTrip]);
                        Composite.add(arm.world, arm.bodies[roundTrip]);
                    }
                    // a moved static: the setter promotes it to a mover once
                    // the grid has indexed it (Body._promoteIfIndexed)
                    if (moving !== -1 && step % 6 === 0) {
                        const body = arm.bodies[moving];
                        Body.setPosition(body, { x: body.position.x + shift, y: body.position.y });
                        if (arm === journal && body._sMoved) {
                            promoted.add(moving);
                        }
                    }
                }
            }
        });

        expect(journalReads).toBeGreaterThan(150);
        // the moves promoted statics in both arms alike
        expect(promoted.size).toBeGreaterThan(3);
        expect(arms[1].bodies.map((body) => body._sMoved)).toEqual(arms[0].bodies.map((body) => body._sMoved));
    });

    it('matches the full walk when listeners change the world during an update', () => {
        const log = [];
        let replay = 0;
        const { journalReads } = runPair({
            steps: 160,
            setup: setupPage,
            listen([journal, walk]) {
                // the journal arm decides; the walk arm, which runs the same
                // update after it, replays each change at the same event
                ['beforeUpdate', 'beforeSolve', 'collisionStart', 'afterUpdate'].forEach((name, eventIndex) => {
                    const random = createRandom(7 + eventIndex);
                    Events.on(journal.engine, name, () => {
                        const choice = random();
                        let op = null;
                        if (choice < 0.2) {
                            op = { event: name, type: 'release', index: pick(journal, random, (body) => body.isStatic && inWorld(journal, body)) };
                        } else if (choice < 0.35) {
                            op = { event: name, type: 'remove', index: pick(journal, random, (body) => inWorld(journal, body)) };
                        } else if (choice < 0.5) {
                            op = { event: name, type: 'add', index: pick(journal, random, (body) => !inWorld(journal, body)) };
                        }
                        if (op && op.index !== -1) {
                            log.push(op);
                            applyOp(journal, op);
                        }
                    });
                    Events.on(walk.engine, name, () => {
                        while (replay < log.length && log[replay].event === name) {
                            applyOp(walk, log[replay]);
                            replay++;
                        }
                    });
                });
            },
            perStep(step, [journal, walk], random) {
                const release = pick(journal, random, (body) => body.isStatic && inWorld(journal, body));
                if (release !== -1) {
                    for (const arm of [journal, walk]) {
                        Body.setStatic(arm.bodies[release], false);
                    }
                }
            }
        });

        function applyOp(arm, op) {
            const body = arm.bodies[op.index];
            if (op.type === 'release') {
                Body.setStatic(body, false);
            } else if (op.type === 'remove') {
                Composite.remove(arm.world, body);
            } else {
                Composite.add(arm.world, body);
            }
        }

        expect(replay).toBe(log.length);
        expect(journalReads).toBeGreaterThan(20);
    });

    it('matches the full walk with sleeping on', () => {
        const { journalReads } = runPair({
            steps: 200,
            sleeping: true,
            setup: setupPage,
            perStep(step, [journal, walk], random) {
                if (step % 2 === 0) {
                    const release = pick(journal, random, (body) => body.isStatic && inWorld(journal, body));
                    if (release !== -1) {
                        for (const arm of [journal, walk]) {
                            Body.setStatic(arm.bodies[release], false);
                        }
                    }
                }
                if (step % 9 === 5) {
                    const sleeper = pick(journal, random, (body) => !body.isStatic && inWorld(journal, body));
                    if (sleeper !== -1) {
                        Sleeping.set(journal.bodies[sleeper], !journal.bodies[sleeper].isSleeping);
                        Sleeping.set(walk.bodies[sleeper], !walk.bodies[sleeper].isSleeping);
                    }
                }
            }
        });

        // a mass sleep or wake records more than a quarter of the world,
        // which switches the journal off for one full walk
        expect(journalReads).toBeGreaterThan(100);
    });

    // Sleeping.update runs inside the update, after world.bodies was lent to
    // it and before the engine builds its mover list, so a sleep listener
    // that adds or removes a body gives the world a fresh array the update
    // does not step. The engine read its list from the journal regardless,
    // which describes the WORLD: it integrated a body added mid-update that
    // the update's own array does not hold, and skipped one it does hold
    it.each([['adds a body'], ['removes an awake body']])('matches the full walk when a sleepStart listener %s', (name) => {
        const adds = name === 'adds a body';
        const moversFromJournal = Detector._moversFromJournal;
        let fired = 0;
        let engineLists = 0;
        let companionsAt = -1;
        Detector._moversFromJournal = function() {
            const built = moversFromJournal.apply(this, arguments);
            engineLists += built ? 1 : 0;
            return built;
        };
        let result;
        try {
            result = runPair({
                steps: 150,
                sleeping: true,
                setup(arms, add) {
                    setupPage(arms, add);
                    for (let k = 0; k < 6; k++) {
                        add(() => Bodies.rectangle(80 + k * 110, 590, 20, 20));
                    }
                    // companions: awake, held up by a force each update
                    companionsAt = arms[0].bodies.length;
                    for (let k = 0; k < 6; k++) {
                        add(() => Bodies.rectangle(100 + k * 110, 470, 16, 16));
                    }
                },
                listen(arms) {
                    for (const arm of arms) {
                        const count = arm.bodies.length;
                        for (let k = 0; k < 6; k++) {
                            const sleeper = arm.bodies[count - 12 + k];
                            const companion = arm.bodies[count - 6 + k];
                            Events.on(sleeper, 'sleepStart', () => {
                                if (arm === arms[0]) {
                                    fired++;
                                }
                                if (adds) {
                                    const body = Bodies.rectangle(60 + arm.bodies.length * 7 % 700, 560, 18, 18);
                                    arm.indexOf.set(body, arm.bodies.length);
                                    arm.bodies.push(body);
                                    Composite.add(arm.world, body);
                                } else {
                                    Composite.remove(arm.world, companion);
                                }
                            });
                        }
                    }
                },
                perStep(step, arms, random) {
                // a release now and then, between updates, which the engine
                // reads from the journal
                    const release = step % 3 === 0 ? pick(arms[0], random, (body) => body.isStatic && inWorld(arms[0], body)) : -1;
                    for (const arm of arms) {
                        if (release !== -1) {
                            Body.setStatic(arm.bodies[release], false);
                        }
                        // the companions, the last six bodies the setup added
                        for (const companion of arm.bodies.slice(companionsAt, companionsAt + 6)) {
                            if (inWorld(arm, companion)) {
                                Body.applyForce(companion, companion.position, { x: 0, y: -0.001 * companion.mass });
                            }
                        }
                    }
                }
            });
        } finally {
            Detector._moversFromJournal = moversFromJournal;
        }

        expect(fired).toBeGreaterThan(2);
        // the engine did build its list from the journal: the scene reaches
        // the path it tests
        expect(engineLists).toBeGreaterThan(10);
        expect(result.journalReads).toBeGreaterThan(0);
    });

    // a caller that replaces world.bodies without signalling: same length,
    // one static swapped for a new moving body. The journal never heard of
    // the swap, so only the array identity says it is stale, for the
    // engine's list and for the detector's classification alike. At step 20
    // a signalled removal comes first, so the same update hands the detector
    // the swapped array (the length matches, so the journal looked
    // complete); at step 50 the swap comes alone, and the detector meets the
    // new array only at the next signalled change, step 55
    it('matches the full walk when world.bodies is replaced without a signal', () => {
        const { journalReads } = runPair({
            steps: 60,
            setup: setupPage,
            perStep(step, arms, random, add) {
                if (step === 2) {
                    add(() => Bodies.rectangle(300, 500, 20, 20));
                }
                if (step === 20 || step === 50) {
                    for (const arm of arms) {
                        if (step === 20) {
                            Composite.removeBodies(arm.world, [arm.bodies[60]]);
                        }
                        const replacement = Bodies.rectangle(450 + step * 2, 500, 20, 20);
                        arm.indexOf.set(replacement, arm.bodies.length);
                        arm.bodies.push(replacement);
                        const copy = arm.world.bodies.slice(0);
                        copy[step === 20 ? 5 : 7] = replacement;
                        arm.world.bodies = copy;
                    }
                }
                if (step === 25) {
                    // an epoch bump with no membership change
                    for (const arm of arms) {
                        Body.setStatic(arm.bodies[30], false);
                    }
                }
                if (step === 35 || step === 55) {
                    // a signalled change, which hands the detector the array
                    for (const arm of arms) {
                        Composite.removeBodies(arm.world, [arm.bodies[step]]);
                    }
                }
            }
        });

        expect(journalReads).toBeGreaterThan(0);
    });

    it('walks instead of reading the journal above the mover share, and back, and still matches', () => {
        const { journalReads } = runPair({
            steps: 160,
            moverShare: 0.25,
            setup: setupPage,
            perStep(step, [journal, walk], random) {
                // release a third of the page, then freeze it back: the mover
                // share crosses the threshold both ways
                const releasing = step < 80;
                const index = pick(journal, random, (body) => inWorld(journal, body) && body.isStatic === releasing);
                if (index !== -1) {
                    for (const arm of [journal, walk]) {
                        Body.setStatic(arm.bodies[index], !releasing);
                    }
                }
            }
        });

        // read below the share at both ends of the run, walked above it
        expect(journalReads).toBeGreaterThan(40);
        expect(journalReads).toBeLessThan(140);
    });

    it('falls back to the full walk for a direct edit, a duplicate and a child composite, and still matches', () => {
        const { journalReads } = runPair({
            steps: 120,
            setup: setupPage,
            perStep(step, [journal, walk], random, add) {
                const release = pick(journal, random, (body) => body.isStatic && inWorld(journal, body));
                if (release !== -1) {
                    for (const arm of [journal, walk]) {
                        Body.setStatic(arm.bodies[release], false);
                    }
                }
                const x = 80 + random() * 600;
                if (step % 10 === 3) {
                    // a direct edit, signalled only by setModified
                    add(() => Bodies.rectangle(x, 20, 16, 16));
                    for (const arm of [journal, walk]) {
                        const last = arm.world.bodies.pop();
                        arm.world.bodies.splice(5, 0, last);
                        Composite.setModified(arm.world, true, true, false);
                    }
                }
                if (step % 20 === 7) {
                    const twice = pick(journal, random, (body) => body.isStatic && inWorld(journal, body));
                    for (const arm of [journal, walk]) {
                        Composite.add(arm.world, arm.bodies[twice]);
                    }
                }
                if (step % 30 === 11) {
                    // a child composite: the world is no longer flat
                    for (const arm of [journal, walk]) {
                        const child = Composite.create();
                        for (let k = 0; k < 3; k++) {
                            const body = Bodies.rectangle(100 + k * 40, 500, 30, 14, { isStatic: true });
                            arm.indexOf.set(body, arm.bodies.length);
                            arm.bodies.push(body);
                            Composite.add(child, body);
                        }
                        Composite.add(arm.world, child);
                    }
                }
                if (step % 30 === 26) {
                    for (const arm of [journal, walk]) {
                        Composite.remove(arm.world, arm.world.composites[0]);
                    }
                }
                if (step % 20 === 15) {
                    for (const arm of [journal, walk]) {
                        const counts = new Map();
                        arm.world.bodies.forEach((body) => counts.set(body, (counts.get(body) || 0) + 1));
                        const doubled = [...counts].filter(([, count]) => count > 1).map(([body]) => body);
                        Composite.removeBodies(arm.world, doubled);
                    }
                }
            }
        });

        expect(journalReads).toBeGreaterThan(20);
    });
});

describe('Composite.removeBodies', () => {
    it('removes every listed body in one order-preserving pass, as removeBody does to each', () => {
        const world = Composite.create();
        const bodies = [];
        for (let i = 0; i < 10; i++) {
            const body = Bodies.rectangle(i * 30, 0, 20, 20);
            body.positionImpulse.x = 3;
            body.sleepCounter = 4;
            bodies.push(body);
            Composite.add(world, body);
        }
        // one body in the world twice, and one never added
        Composite.add(world, bodies[4]);
        const stranger = Bodies.rectangle(0, 0, 10, 10);
        stranger._sWalk = 17;

        Composite.removeBodies(world, [bodies[7], bodies[2], stranger, bodies[4], bodies[2]]);

        expect(world.bodies).toEqual([0, 1, 3, 5, 6, 8, 9].map((i) => bodies[i]));
        for (const i of [2, 4, 7]) {
            expect(bodies[i].positionImpulse.x).toBe(0);
            expect(bodies[i].sleepCounter).toBe(0);
            expect(bodies[i]._sDeparted).toBe(true);
            expect(bodies[i]._sOwner).toBe(null);
        }
        expect(bodies[0].positionImpulse.x).toBe(3);
        expect(bodies[0]._sOwner).toBe(world);
        // a listed body that was not there keeps its membership elsewhere
        expect(stranger._sWalk).toBe(17);
        expect(stranger._sDeparted).toBe(false);
        expect(world.isModified).toBe(true);
    });

    it('leaves a removed body owned by another composite as that composite holds it', () => {
        const first = Composite.create();
        const second = Composite.create();
        const shared = Bodies.rectangle(0, 0, 10, 10);
        Composite.add(first, shared);
        Composite.add(second, shared);
        shared._sWalk = 23;

        Composite.removeBodies(first, [shared]);

        expect(first.bodies).toEqual([]);
        expect(second.bodies).toEqual([shared]);
        expect(shared._sOwner).toBe(second);
        expect(shared._sWalk).toBe(23);
    });

    // the list WAS the array the pass compacts, so the pass that restores
    // what it marked read a truncated list, threw, and left every body
    // marked; each later call then took a marked body for a listed one
    it('empties the composite when given its own body array, inside an update too, and leaves no mark', () => {
        const engine = Engine.create({ detector: Detector.create({ broadphase: 'grid' }) });
        const bodies = [];
        for (let i = 0; i < 10; i++) {
            bodies.push(Bodies.rectangle(i * 40, 100, 30, 30, { isStatic: true }));
        }
        Composite.add(engine.world, bodies);
        Engine.update(engine, DELTA);

        Composite.removeBodies(engine.world, engine.world.bodies);

        expect(engine.world.bodies).toEqual([]);
        for (const body of bodies) {
            expect(body._sWalk).toBe(-1);
            expect(body._sOwner).toBe(null);
            expect(body._sDeparted).toBe(true);
        }

        // back in by hand (a direct push, signalled), then ONE removed: the
        // other nine stay
        for (const body of bodies) {
            engine.world.bodies.push(body);
        }
        Composite.setModified(engine.world, true, true, false);
        Composite.removeBodies(engine.world, [bodies[4]]);
        expect(engine.world.bodies).toEqual(bodies.filter((body) => body !== bodies[4]));

        // inside an update the world lends its array to the update
        Engine.update(engine, DELTA);
        let during = null;
        Events.on(engine, 'beforeSolve', () => {
            Composite.removeBodies(engine.world, engine.world.bodies);
            during = engine.world.bodies.length;
        });
        Engine.update(engine, DELTA);
        expect(during).toBe(0);
        expect(engine.world.bodies).toEqual([]);
        for (const body of bodies) {
            // no mark (-2 to -4) left behind. These were pushed back by hand,
            // so the world never owned them and each keeps its walk stamp
            expect(body._sWalk).toBeGreaterThan(-2);
            expect(body._sOwner).toBe(null);
        }
    });

    it.each([['null', null], ['undefined', undefined], ['a constraint', { type: 'constraint' }]])('throws on %s in the list before changing anything', (name, bad) => {
        const engine = Engine.create({ detector: Detector.create({ broadphase: 'grid' }) });
        const bodies = [];
        for (let i = 0; i < 10; i++) {
            bodies.push(Bodies.rectangle(i * 40, 100, 30, 30, { isStatic: true }));
        }
        Composite.add(engine.world, bodies);
        Engine.update(engine, DELTA);
        const walks = bodies.map((body) => body._sWalk);
        const array = engine.world.bodies;

        // listed twice ahead of the bad entry, so the undo meets a body it
        // marked once from two entries
        expect(() => Composite.removeBodies(engine.world, [bodies[2], bodies[5], bodies[2], bad, bodies[7]])).toThrow(TypeError);

        expect(engine.world.bodies).toBe(array);
        expect(engine.world.bodies).toEqual(bodies);
        expect(bodies.map((body) => body._sWalk)).toEqual(walks);
        expect(bodies.every((body) => body._sOwner === engine.world && !body._sDeparted)).toBe(true);
        expect(engine.world._journalLive).toBe(true);
        if (bad !== null && bad !== undefined) {
            expect('_sWalk' in bad).toBe(false);
        }

        // and the next call removes exactly what it lists
        Composite.removeBodies(engine.world, [bodies[5]]);
        expect(engine.world.bodies).toEqual(bodies.filter((body) => body !== bodies[5]));
    });

    it('keeps the journal live, where a direct edit signalled by setModified switches it off', () => {
        const engine = Engine.create({ detector: Detector.create({ broadphase: 'grid' }) });
        const bodies = [];
        for (let i = 0; i < 40; i++) {
            bodies.push(Bodies.rectangle(i * 25, 100, 20, 20, { isStatic: true }));
        }
        Composite.add(engine.world, bodies);
        Engine.update(engine, DELTA);
        expect(engine.world._journalLive).toBe(true);

        Composite.removeBodies(engine.world, [bodies[3], bodies[9]]);
        expect(engine.world._journalLive).toBe(true);
        expect(engine.world._touchedCount).toBe(2);

        engine.world.bodies.pop();
        Composite.setModified(engine.world, true, true, false);
        expect(engine.world._journalLive).toBe(false);
    });
});
