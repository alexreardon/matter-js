/* eslint-env node */
// Matter (upstream + fork) vs Rapier 2D (Rust compiled to WASM) on the same scenes.
//
// The question this answers: would Page Rage get more from swapping the engine
// for Rapier than from the fork's optimisations — once you pay the JS<->WASM
// bridge on every frame? So Rapier runs as two arms:
//
//   rapier (step)      `world.step()` only. The physics ceiling: one boundary
//                      crossing per frame, results stay inside WASM memory.
//                      No real game can run like this — the renderer lives in JS.
//   rapier (bridge)    `world.step()` plus what a JS renderer needs every frame:
//                      translation() + rotation() for every dynamic body, into a
//                      preallocated Float64Array via cached body refs. This is
//                      the optimised bridge: no per-frame map lookups, no
//                      re-fetching handles, output buffer reused. The remaining
//                      cost (one wasm-bindgen call + one {x,y} allocation per
//                      body per frame) is irreducible with rapier's public API.
//
// Scene-mutating traffic that the SIMULATION needs (bullet wrapping, churn
// add/remove) runs in BOTH rapier arms, so (bridge - step) isolates pure
// readback overhead, and churn scenarios show mutation overhead against the
// matter arms.
//
// Parity choices (cross-engine identical output is impossible — different
// solvers — so scenes are workload-identical instead: same geometry from the
// same seeded generator, same body counts, matched materials and gravity):
//   - units stay in px: gravity (0, 1000) px/s^2 == matter's default
//     0.001 px/ms^2; velocities are matter px/tick * 60; dt = 1/60 s
//   - rapier bodies get setCanSleep(false) to match enableSleeping: false
//     (letting rapier sleep in settled scenes would be a huge unfair win)
//   - linear/angular damping 0.606 == matter's default frictionAir 0.01
//     (per-tick factor 0.99 at 60fps: 1/(1 + dt*d) = 0.99 -> d ~= 0.606)
//   - friction combines Min, restitution Max (matter's pair rules)
//   - solver iteration counts stay at each engine's shipped default
//     (matter 6 position + 4 velocity, rapier 4): "as shipped" quality
//   - matter approximates circles as polygons, rapier uses true balls: each
//     engine's native representation, counted as engine quality not bias
//
// Timing is bench/suite.js's method verbatim: all arms in one process on
// identical scenes, alternating ~blocks with rotating lead, several fresh
// processes per scenario, each arm keeping its best (mean of fastest fifth).
//
// Requires rapier, which is deliberately NOT a devDependency (a 2MB WASM
// package has no business in the library's install graph):
//   npm install --no-save @dimforge/rapier2d-simd-compat
//
// Usage:
//   npm run bench-rapier                      all scenarios
//   node bench/vs-rapier.js --quick           fewer blocks, 1 process
//   node bench/vs-rapier.js --only=stack,page-calm
//   node bench/vs-rapier.js --alloc           add JS-heap allocation pass
//   ALLOW_SLEEP=1 node bench/vs-rapier.js     sleeping on in BOTH engines
"use strict";

const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const FORK_ROOT = path.join(__dirname, '..');
const FORK_MAIN = path.join(FORK_ROOT, 'src', 'module', 'main.js');
const BASELINE_REF = process.env.BASELINE_REF || '0.20.0';
const BASELINE_ROOT = path.join(FORK_ROOT, '.bench', 'stock-' + BASELINE_REF);
const BASELINE_MAIN = path.join(BASELINE_ROOT, 'src', 'module', 'main.js');
const RAPIER_PKG = '@dimforge/rapier2d-simd-compat';

const TICK_MS = 1000 / 60;
const PX_PER_TICK_TO_PX_PER_S = 60;
const RAPIER_GRAVITY = { x: 0, y: 1000 };   // == matter 0.001 px/ms^2
const RAPIER_DAMPING = 0.606;               // == matter frictionAir 0.01
const DEFAULT_FRICTION = 0.1;               // matter Body defaults
const DEFAULT_RESTITUTION = 0;

const hr = () => Number(process.hrtime.bigint());

function makeRandom(seed) {
    let state = seed;
    return function random() {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

// Scene specs
//
// Engine-agnostic body lists, generated once per scenario from the same seeds
// and layout code as bench/suite.js, so both engines build the identical scene
// and the numbers stay comparable with the fork-vs-upstream table.

function bowlSpec(options) {
    return [
        { x: options.width / 2, y: options.height, w: options.width + 200, h: 60 },
        { x: -30, y: options.height / 2, w: 60, h: options.height * 2 },
        { x: options.width + 30, y: options.height / 2, w: 60, h: options.height * 2 }
    ];
}

function pageStatics() {
    return [
        { x: 1000, y: 2400, w: 2200, h: 60 },
        { x: -40, y: 1200, w: 60, h: 2600 },
        { x: 2040, y: 1200, w: 60, h: 2600 }
    ];
}

function tileGrid(count) {
    const cols = Math.round(Math.sqrt(count * (2000 / 2300)));
    const rows = Math.ceil(count / cols);
    const tileWidth = Math.max(10, 1960 / cols - 6);
    const tileHeight = Math.max(8, 2200 / rows - 6);
    const tiles = [];
    let placed = 0;
    for (let row = 0; row < rows && placed < count; row++) {
        for (let col = 0; col < cols && placed < count; col++) {
            tiles.push({ x: 30 + col * (1960 / cols), y: 30 + row * (2200 / rows), w: tileWidth, h: tileHeight });
            placed++;
        }
    }
    return { tiles, tileWidth, tileHeight };
}

function pageSpec(options) {
    const random = makeRandom(24681);
    const statics = pageStatics().concat(tileGrid(options.statics).tiles);

    const movers = [];
    for (let i = 0; i < options.movers; i++) {
        const x = 60 + random() * 1880;
        const spawnY = options.raining ? -40 - random() * 900 : 2340 - (i % 8) * 26;
        const w = 12 + random() * 20;
        const h = 12 + random() * 20;
        movers.push({
            shape: 'rect', x, y: spawnY, w, h,
            angle: random() * Math.PI,
            friction: 0.4, restitution: 0.2, frictionAir: 0.01
        });
    }

    const bullets = [];
    for (let i = 0; i < (options.bullets || 0); i++) {
        bullets.push({
            x: -60 - i * 260, y: 120 + (i % 6) * 320, w: 14, h: 6,
            vx: 30, vy: 0, resetY: 120 + (i % 6) * 320
        });
    }

    return { statics, movers, bullets, churn: null };
}

function stackSpec() {
    // Composites.stack(80, 40, 24, 14, 6, 6, 26x26): column-major x, row-major y
    const movers = [];
    for (let row = 0; row < 14; row++) {
        for (let col = 0; col < 24; col++) {
            movers.push({
                shape: 'rect',
                x: 80 + col * (26 + 6) + 13, y: 40 + row * (26 + 6) + 13,
                w: 26, h: 26,
                angle: 0, friction: 0.4, restitution: 0.2, frictionAir: 0.01
            });
        }
    }
    return { statics: bowlSpec({ width: 900, height: 640 }), movers, bullets: [], churn: null };
}

function mixedSpec() {
    const random = makeRandom(13579);
    const movers = [];
    for (let i = 0; i < 300; i++) {
        const x = 40 + random() * 820;
        const y = -20 - random() * 900;
        const size = 10 + random() * 14;
        const roll = random();
        let body;
        if (roll < 0.34) {
            body = { shape: 'circle', x, y, r: size * 0.6 };
        } else if (roll < 0.67) {
            body = { shape: 'poly', x, y, sides: 3 + Math.floor(random() * 6), r: size * 0.7 };
        } else {
            body = { shape: 'rect', x, y, w: size * 1.6, h: size };
        }
        body.angle = random() * Math.PI;
        body.friction = 0.4;
        body.restitution = 0.2;
        body.frictionAir = 0.01;
        movers.push(body);
    }
    return { statics: bowlSpec({ width: 900, height: 640 }), movers, bullets: [], churn: null };
}

// The churn timeline is pure bookkeeping (releases by frame count, evictions by
// age), no physics feedback, so the whole membership schedule is precomputed
// once and both engines replay the identical sequence of mutations.
function churnSpec(options, maxFrames) {
    const random = makeRandom(24681);
    const grid = tileGrid(options.statics);
    const tiles = grid.tiles.slice();

    const order = tiles.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const swap = order[i];
        order[i] = order[j];
        order[j] = swap;
    }

    const debrisLife = 40;
    const live = [];
    let releaseIndex = 0;
    const frames = [];

    for (let frame = 1; frame <= maxFrames; frame++) {
        const ops = { release: [], evict: [], add: [] };

        for (let k = 0; k < options.releasePerFrame && releaseIndex < order.length; k++) {
            const tileIndex = order[releaseIndex++];
            ops.release.push({
                tile: tileIndex,
                vx: (random() - 0.5) * 6,
                vy: 4 + random() * 4
            });
            live.push({ tile: tileIndex, bornFrame: frame });
        }

        let evicted = 0;
        while (live.length > 0 && frame - live[0].bornFrame > debrisLife) {
            ops.evict.push(live.shift().tile);
            evicted++;
        }

        for (let k = 0; k < evicted; k++) {
            const replacement = {
                x: 60 + random() * 1880, y: 40 + random() * 2100,
                w: grid.tileWidth, h: grid.tileHeight
            };
            tiles.push(replacement);
            order.push(tiles.length - 1);
            ops.add.push(tiles.length - 1);
        }

        frames.push(ops);
    }

    return {
        statics: pageStatics(),
        movers: [],
        bullets: [],
        churn: { tiles, frames }
    };
}

// Matter adapter

// ALLOW_SLEEP is a diagnostic knob: page-destroyer cannot ship with sleeping
// (the hangs-in-mid-air bug class), but it shows how much of each engine's
// no-sleep cost is bodies that would otherwise be asleep. It flips BOTH
// engines so the comparison stays fair; check() reports how many bodies each
// engine actually put to sleep, since their thresholds differ.
const ALLOW_SLEEP = !!process.env.ALLOW_SLEEP;

function buildMatterScene(Matter, spec) {
    const { Engine, Composite, Bodies, Body, Sleeping } = Matter;
    const engine = Engine.create({ enableSleeping: ALLOW_SLEEP });
    const world = engine.world;

    for (const s of spec.statics) {
        Composite.add(world, Bodies.rectangle(s.x, s.y, s.w, s.h, { isStatic: true }));
    }

    for (const m of spec.movers) {
        let body;
        if (m.shape === 'circle') {
            body = Bodies.circle(m.x, m.y, m.r, { friction: m.friction, restitution: m.restitution });
        } else if (m.shape === 'poly') {
            body = Bodies.polygon(m.x, m.y, m.sides, m.r, { friction: m.friction, restitution: m.restitution });
        } else {
            body = Bodies.rectangle(m.x, m.y, m.w, m.h, { friction: m.friction, restitution: m.restitution });
        }
        Body.setAngle(body, m.angle);
        Composite.add(world, body);
    }

    const bullets = [];
    for (const b of spec.bullets) {
        const bullet = Bodies.rectangle(b.x, b.y, b.w, b.h, { isSensor: true, frictionAir: 0 });
        Body.setVelocity(bullet, { x: b.vx, y: b.vy });
        Composite.add(world, bullet);
        bullets.push({ body: bullet, spec: b });
    }

    const tileBodies = [];
    if (spec.churn) {
        // only tiles never introduced by an `add` op exist up front; they are
        // born dynamic then setStatic, mirroring suite.js (the game's tile path)
        const added = new Set();
        for (const ops of spec.churn.frames) {
            for (const index of ops.add) {
                added.add(index);
            }
        }
        for (let i = 0; i < spec.churn.tiles.length; i++) {
            if (added.has(i)) {
                tileBodies.push(null);
                continue;
            }
            const t = spec.churn.tiles[i];
            const tile = Bodies.rectangle(t.x, t.y, t.w, t.h);
            Body.setStatic(tile, true);
            Composite.add(world, tile);
            tileBodies.push(tile);
        }
    }

    let frame = 0;

    return {
        engine,
        step() {
            if (spec.churn) {
                const ops = spec.churn.frames[frame++];
                if (!ops) {
                    throw new Error('churn schedule exhausted');
                }
                for (const release of ops.release) {
                    const tile = tileBodies[release.tile];
                    Body.setStatic(tile, false);
                    Body.setVelocity(tile, { x: release.vx, y: release.vy });
                    // setVelocity does not wake a sleeping body: without this a
                    // released tile freezes in mid-air (the exact bug class that
                    // forced sleeping off in the game). Only needed under
                    // ALLOW_SLEEP, harmless otherwise.
                    Sleeping.set(tile, false);
                }
                for (const tileIndex of ops.evict) {
                    Composite.remove(world, tileBodies[tileIndex]);
                    tileBodies[tileIndex] = null;
                }
                for (const tileIndex of ops.add) {
                    const t = spec.churn.tiles[tileIndex];
                    const replacement = Bodies.rectangle(t.x, t.y, t.w, t.h);
                    Body.setStatic(replacement, true);
                    Composite.add(world, replacement);
                    tileBodies[tileIndex] = replacement;
                }
            }
            Engine.update(engine, TICK_MS);
            for (const entry of bullets) {
                if (entry.body.position.x > 2100) {
                    Body.setPosition(entry.body, { x: -60, y: entry.spec.resetY });
                    Body.setVelocity(entry.body, { x: entry.spec.vx, y: entry.spec.vy });
                }
            }
        },
        check() {
            const bodies = Composite.allBodies(world);
            let movers = 0;
            let nonFinite = 0;
            let minY = Infinity;
            let maxY = -Infinity;
            let asleep = 0;
            for (const body of bodies) {
                if (!body.isStatic) {
                    movers++;
                    minY = Math.min(minY, body.position.y);
                    maxY = Math.max(maxY, body.position.y);
                    if (body.isSleeping) {
                        asleep++;
                    }
                }
                if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y)) {
                    nonFinite++;
                }
            }
            return { bodies: bodies.length, movers, nonFinite, asleep, minY: Math.round(minY), maxY: Math.round(maxY) };
        }
    };
}

// Rapier adapter

function regularPolygon(sides, radius) {
    const points = new Float32Array(sides * 2);
    for (let i = 0; i < sides; i++) {
        const theta = (i / sides) * Math.PI * 2;
        points[i * 2] = Math.cos(theta) * radius;
        points[i * 2 + 1] = Math.sin(theta) * radius;
    }
    return points;
}

function buildRapierScene(RAPIER, spec, options) {
    const world = new RAPIER.World(RAPIER_GRAVITY);
    world.timestep = 1 / 60;
    // sensitivity knob: rapier's default 4 TGS substeps buy quality matter
    // doesn't have; RAPIER_ITERS=1 trades it back for speed
    if (process.env.RAPIER_ITERS) {
        world.numSolverIterations = Number(process.env.RAPIER_ITERS);
    }
    // the scene is pixel-scale (gravity 1000 px/s^2 ~= 9.81 m/s^2 at ~100 px/m);
    // lengthUnit rescales rapier's meter-tuned tolerances (contact prediction,
    // penetration slop) to match, which is its documented pixel-world setup.
    // Measured perf-neutral either way (see README), so the documented value
    // is the default.
    world.lengthUnit = Number(process.env.RAPIER_LENGTH_UNIT || 100);

    function materialise(colliderDesc, friction, restitution) {
        return colliderDesc
            .setFriction(friction)
            .setRestitution(restitution)
            .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
            .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    }

    // sleep and damping settings only matter if the body is later released to
    // dynamic (churn tiles), where they must match the matter arms: sleeping
    // disabled, frictionAir 0.01
    function addStatic(t) {
        const rb = world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed()
                .setTranslation(t.x, t.y)
                .setCanSleep(ALLOW_SLEEP)
                .setLinearDamping(RAPIER_DAMPING)
                .setAngularDamping(RAPIER_DAMPING)
        );
        world.createCollider(materialise(RAPIER.ColliderDesc.cuboid(t.w / 2, t.h / 2), DEFAULT_FRICTION, DEFAULT_RESTITUTION), rb);
        return rb;
    }

    for (const s of spec.statics) {
        addStatic(s);
    }

    // dynamics tracked for readback; a Set-free flat array with swap-removal so
    // the bridge arm's per-frame loop is as cheap as JS allows
    const dynamics = [];

    function trackDynamic(rb) {
        rb.userData = dynamics.length;
        dynamics.push(rb);
    }

    function untrackDynamic(rb) {
        const index = rb.userData;
        const last = dynamics.pop();
        if (last !== rb) {
            dynamics[index] = last;
            last.userData = index;
        }
    }

    const canSleep = ALLOW_SLEEP;

    for (const m of spec.movers) {
        const rbDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(m.x, m.y)
            .setRotation(m.angle)
            .setCanSleep(canSleep)
            .setLinearDamping(m.frictionAir > 0 ? RAPIER_DAMPING : 0)
            .setAngularDamping(m.frictionAir > 0 ? RAPIER_DAMPING : 0);
        const rb = world.createRigidBody(rbDesc);
        let shape;
        if (m.shape === 'circle') {
            shape = RAPIER.ColliderDesc.ball(m.r);
        } else if (m.shape === 'poly') {
            shape = RAPIER.ColliderDesc.convexHull(regularPolygon(m.sides, m.r));
        } else {
            shape = RAPIER.ColliderDesc.cuboid(m.w / 2, m.h / 2);
        }
        world.createCollider(materialise(shape, m.friction, m.restitution), rb);
        trackDynamic(rb);
    }

    const bullets = [];
    for (const b of spec.bullets) {
        const rb = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(b.x, b.y)
                .setCanSleep(false)
                .setLinvel(b.vx * PX_PER_TICK_TO_PX_PER_S, b.vy * PX_PER_TICK_TO_PX_PER_S)
        );
        const desc = RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2).setSensor(true);
        world.createCollider(desc, rb);
        bullets.push({ rb, spec: b });
        trackDynamic(rb);
    }

    const tileBodies = [];
    if (spec.churn) {
        const added = new Set();
        for (const ops of spec.churn.frames) {
            for (const index of ops.add) {
                added.add(index);
            }
        }
        for (let i = 0; i < spec.churn.tiles.length; i++) {
            if (added.has(i)) {
                tileBodies.push(null);
                continue;
            }
            tileBodies.push(addStatic(spec.churn.tiles[i]));
        }
    }

    // preallocated pose buffer: 3 doubles per body, renderer-shaped
    const poses = new Float64Array(3 * Math.max(64, dynamics.length + 2048));
    const readback = options.readback;

    let frame = 0;

    return {
        world,
        step() {
            if (spec.churn) {
                const ops = spec.churn.frames[frame++];
                if (!ops) {
                    throw new Error('churn schedule exhausted');
                }
                for (const release of ops.release) {
                    const rb = tileBodies[release.tile];
                    rb.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
                    rb.setLinvel({
                        x: release.vx * PX_PER_TICK_TO_PX_PER_S,
                        y: release.vy * PX_PER_TICK_TO_PX_PER_S
                    }, true);
                    trackDynamic(rb);
                }
                for (const tileIndex of ops.evict) {
                    const rb = tileBodies[tileIndex];
                    untrackDynamic(rb);
                    world.removeRigidBody(rb);
                    tileBodies[tileIndex] = null;
                }
                for (const tileIndex of ops.add) {
                    tileBodies[tileIndex] = addStatic(spec.churn.tiles[tileIndex]);
                }
            }

            world.step();

            for (const entry of bullets) {
                const t = entry.rb.translation();
                if (t.x > 2100) {
                    entry.rb.setTranslation({ x: -60, y: entry.spec.resetY }, true);
                    entry.rb.setLinvel({
                        x: entry.spec.vx * PX_PER_TICK_TO_PX_PER_S,
                        y: entry.spec.vy * PX_PER_TICK_TO_PX_PER_S
                    }, true);
                }
            }

            if (readback) {
                const count = dynamics.length;
                for (let i = 0; i < count; i++) {
                    const rb = dynamics[i];
                    const t = rb.translation();
                    poses[i * 3] = t.x;
                    poses[i * 3 + 1] = t.y;
                    poses[i * 3 + 2] = rb.rotation();
                }
            }
        },
        check() {
            let bodies = 0;
            let movers = 0;
            let nonFinite = 0;
            let minY = Infinity;
            let maxY = -Infinity;
            let escaped = 0;
            let asleep = 0;
            world.bodies.forEach(rb => {
                bodies++;
                const t = rb.translation();
                if (!rb.isFixed()) {
                    movers++;
                    minY = Math.min(minY, t.y);
                    maxY = Math.max(maxY, t.y);
                    if (t.y > 3000) {
                        escaped++;
                    }
                    if (rb.isSleeping()) {
                        asleep++;
                    }
                }
                if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) {
                    nonFinite++;
                }
            });
            return { bodies, movers, nonFinite, escaped, asleep, minY: Math.round(minY), maxY: Math.round(maxY) };
        }
    };
}

// Scenarios

const MAX_CHURN_FRAMES = 4000;

const scenarios = [
    {
        key: 'stack',
        title: 'Box stack settling',
        group: 'General',
        warmup: 500,
        blockUpdates: 20,
        spec: () => stackSpec()
    },
    {
        key: 'mixed-shapes',
        title: 'Mixed shapes pile',
        group: 'General',
        warmup: 500,
        blockUpdates: 20,
        spec: () => mixedSpec()
    },
    {
        key: 'page-calm',
        title: 'Page, calm (5000 tiles, 300 debris)',
        group: 'Page Rage',
        warmup: 600,
        blockUpdates: 10,
        spec: () => pageSpec({ statics: 5000, movers: 300, raining: false })
    },
    {
        key: 'page-firing',
        title: 'Page, firing (8 sensor bullets)',
        group: 'Page Rage',
        warmup: 600,
        blockUpdates: 10,
        spec: () => pageSpec({ statics: 5000, movers: 300, raining: false, bullets: 8 })
    },
    {
        key: 'page-storm',
        title: 'Page, 800-mover storm',
        group: 'Page Rage',
        warmup: 300,
        blockUpdates: 10,
        spec: () => pageSpec({ statics: 5000, movers: 800, raining: true })
    },
    {
        key: 'page-churn',
        title: 'Page, being destroyed',
        group: 'Page Rage',
        warmup: 240,
        blockUpdates: 10,
        spec: () => churnSpec({ statics: 5000, releasePerFrame: 12 }, MAX_CHURN_FRAMES)
    }
];

// Arms

const ARMS = [
    { key: 'upstream', label: 'upstream 0.20.0', kind: 'matter', tree: 'baseline', mode: 'sweep' },
    { key: 'fork-grid', label: 'fork (gridStatic)', kind: 'matter', tree: 'fork', mode: 'gridStatic' },
    { key: 'rapier-step', label: 'rapier (step only)', kind: 'rapier', readback: false },
    { key: 'rapier-bridge', label: 'rapier (step + readback)', kind: 'rapier', readback: true }
];

function loadIsolated(mainPath) {
    const root = path.resolve(path.dirname(mainPath), '..', '..');
    for (const cached of Object.keys(require.cache)) {
        if (cached.startsWith(root + path.sep)) {
            delete require.cache[cached];
        }
    }
    // eslint-disable-next-line global-require
    return require(mainPath);
}

function makeArm(arm, spec, RAPIER) {
    if (arm.kind === 'matter') {
        const Matter = loadIsolated(arm.tree === 'fork' ? FORK_MAIN : BASELINE_MAIN);
        if ('_mode' in Matter.Detector) {
            Matter.Detector._mode = arm.mode;
        }
        return buildMatterScene(Matter, spec);
    }
    return buildRapierScene(RAPIER, spec, { readback: arm.readback });
}

function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[middle];
    }
    return (sorted[middle - 1] + sorted[middle]) / 2;
}

function meanOfBest(values, take) {
    return values.slice().sort((a, b) => a - b).slice(0, take)
        .reduce((total, value) => total + value, 0) / take;
}

async function runScenario(scenario, blocks) {
    // eslint-disable-next-line global-require
    const RAPIER = require(RAPIER_PKG);
    await RAPIER.init();

    const arms = ARMS.map(arm => {
        // every arm gets its own spec object: the schedule replay mutates
        // nothing, but body lists are iterated hot and sharing would let one
        // arm's hidden-class history warm another's
        const spec = scenario.spec();
        return Object.assign({}, arm, { instance: makeArm(arm, spec, RAPIER) });
    });

    for (let i = 0; i < scenario.warmup; i++) {
        for (let a = 0; a < arms.length; a++) {
            arms[a].instance.step();
        }
    }

    const blockTimes = arms.map(() => []);

    for (let block = 0; block < blocks; block++) {
        for (let offset = 0; offset < arms.length; offset++) {
            const index = (block + offset) % arms.length;
            const instance = arms[index].instance;
            const start = hr();
            for (let update = 0; update < scenario.blockUpdates; update++) {
                instance.step();
            }
            blockTimes[index].push((hr() - start) / scenario.blockUpdates / 1e3);
        }
    }

    const takeBest = Math.max(3, Math.round(blocks * 0.2));

    const results = arms.map((arm, index) => ({
        key: arm.key,
        label: arm.label,
        median: median(blockTimes[index]),
        best: meanOfBest(blockTimes[index], takeBest)
    }));

    const checks = arms.map(arm => arm.instance.check());

    return {
        key: scenario.key,
        title: scenario.title,
        group: scenario.group,
        bodies: checks[0].bodies,
        movers: checks[0].movers,
        blocks,
        blockUpdates: scenario.blockUpdates,
        results,
        checks
    };
}

// Allocation (JS heap only: rapier's WASM linear memory is invisible to
// heapUsed, so rapier numbers here are pure bridge garbage — which is exactly
// the number wanted)

const ALLOC_STEPS = 50;
const ALLOC_WINDOWS = 7;
const ALLOC_MAX_ATTEMPTS = 40;

const nextTick = () => new Promise(resolve => setImmediate(resolve));

async function measureAllocWindow(instance, gcFeed) {
    const { performance } = require('perf_hooks');
    global.gc();
    await nextTick();
    const windowStart = performance.now();
    const heapBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < ALLOC_STEPS; i++) {
        instance.step();
    }
    const heapAfter = process.memoryUsage().heapUsed;
    const windowEnd = performance.now();
    await nextTick();
    await nextTick();
    const collected = gcFeed.starts.some(start => start >= windowStart && start <= windowEnd);
    gcFeed.starts.length = 0;
    if (collected) {
        return null;
    }
    return (heapAfter - heapBefore) / ALLOC_STEPS;
}

async function runAlloc(scenario) {
    const { PerformanceObserver } = require('perf_hooks');
    // eslint-disable-next-line global-require
    const RAPIER = require(RAPIER_PKG);
    await RAPIER.init();

    const gcFeed = { starts: [] };
    const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
            gcFeed.starts.push(entry.startTime);
        }
    });
    observer.observe({ entryTypes: ['gc'] });

    const results = [];
    for (const arm of ARMS) {
        const instance = makeArm(arm, scenario.spec(), RAPIER);
        for (let i = 0; i < Math.min(scenario.warmup, 200); i++) {
            instance.step();
        }
        const clean = [];
        let attempts = 0;
        while (clean.length < ALLOC_WINDOWS && attempts < ALLOC_MAX_ATTEMPTS) {
            attempts++;
            // eslint-disable-next-line no-await-in-loop
            const bytes = await measureAllocWindow(instance, gcFeed);
            if (bytes !== null) {
                clean.push(bytes);
            }
        }
        results.push({
            key: arm.key,
            label: arm.label,
            bytesPerStep: clean.length > 0 ? median(clean) : null,
            windows: clean.length
        });
        global.gc();
    }

    observer.disconnect();

    return { key: scenario.key, title: scenario.title, group: scenario.group, results };
}

// Baseline provisioning

function ensureBaseline() {
    if (fs.existsSync(BASELINE_MAIN)) {
        return;
    }
    process.stderr.write('provisioning stock baseline worktree at ' + path.relative(FORK_ROOT, BASELINE_ROOT) + ' (' + BASELINE_REF + ')\n');
    fs.mkdirSync(path.dirname(BASELINE_ROOT), { recursive: true });
    execFileSync('git', ['worktree', 'add', '--detach', BASELINE_ROOT, BASELINE_REF], {
        cwd: FORK_ROOT,
        stdio: 'inherit'
    });
}

// Reporting

function formatPercent(value) {
    const sign = value > 0 ? '+' : '';
    return sign + value.toFixed(0) + '%';
}

function figure(value) {
    return '`' + value + '`';
}

function formatAgainst(value, baseline, unit) {
    return figure(value.toFixed(unit === 'us' ? 0 : 1) + unit) +
        ' (' + figure(formatPercent(100 * (value - baseline) / baseline)) + ')';
}

function buildTable(rows) {
    const lines = [];
    lines.push('| Scenario | Bodies | Upstream ' + figure(BASELINE_REF) + ' | Fork (gridStatic) | Rapier (step only) | Rapier (step + readback) |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    let group = null;
    for (const row of rows) {
        if (row.group !== group) {
            group = row.group;
            lines.push('| **' + group + '** | | | | | |');
        }
        const upstream = row.results.find(result => result.key === 'upstream');
        const forkGrid = row.results.find(result => result.key === 'fork-grid');
        const rapierStep = row.results.find(result => result.key === 'rapier-step');
        const rapierBridge = row.results.find(result => result.key === 'rapier-bridge');
        lines.push('| ' + row.title +
            ' | ' + figure(row.bodies.toLocaleString('en-US')) +
            ' | ' + figure(upstream.best.toFixed(0) + 'us') +
            ' | ' + formatAgainst(forkGrid.best, upstream.best, 'us') +
            ' | ' + formatAgainst(rapierStep.best, upstream.best, 'us') +
            ' | ' + formatAgainst(rapierBridge.best, upstream.best, 'us') + ' |');
    }
    return lines.join('\n');
}

function buildBridgeTable(rows) {
    const lines = [];
    lines.push('| Scenario | Movers read back | Rapier step | Rapier step + readback | Bridge tax |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of rows) {
        const rapierStep = row.results.find(result => result.key === 'rapier-step');
        const rapierBridge = row.results.find(result => result.key === 'rapier-bridge');
        const check = row.checks[ARMS.findIndex(arm => arm.key === 'rapier-bridge')];
        const tax = rapierBridge.best - rapierStep.best;
        lines.push('| ' + row.title +
            ' | ' + figure(String(check.movers)) +
            ' | ' + figure(rapierStep.best.toFixed(0) + 'us') +
            ' | ' + figure(rapierBridge.best.toFixed(0) + 'us') +
            ' | ' + figure('+' + tax.toFixed(0) + 'us (' + formatPercent(100 * tax / rapierStep.best) + ')') + ' |');
    }
    return lines.join('\n');
}

function buildAllocTable(rows) {
    const lines = [];
    lines.push('| Scenario | Upstream ' + figure(BASELINE_REF) + ' | Fork (gridStatic) | Rapier (step only) | Rapier (step + readback) |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of rows) {
        const cells = ['upstream', 'fork-grid', 'rapier-step', 'rapier-bridge'].map(key => {
            const result = row.results.find(entry => entry.key === key);
            if (result.bytesPerStep === null) {
                return 'n/a';
            }
            return figure((result.bytesPerStep / 1024).toFixed(1) + ' KB');
        });
        lines.push('| ' + row.title + ' | ' + cells.join(' | ') + ' |');
    }
    return lines.join('\n');
}

// Entry points

const args = process.argv.slice(2);
const scenarioArg = args.find(arg => arg.startsWith('--scenario='));
const allocArg = args.find(arg => arg.startsWith('--alloc='));
const onlyArg = args.find(arg => arg.startsWith('--only='));
const blocksArg = args.find(arg => arg.startsWith('--blocks='));
const quick = args.includes('--quick');
const defaultBlocks = quick ? 9 : 24;
const blocks = blocksArg ? Number(blocksArg.split('=')[1]) : defaultBlocks;
const repeatsArg = args.find(arg => arg.startsWith('--repeats='));
const repeats = repeatsArg ? Number(repeatsArg.split('=')[1]) : (quick ? 1 : 3);
const allocOnly = args.includes('--alloc-only');
const wantAlloc = allocOnly || args.includes('--alloc');

function findScenario(key) {
    const scenario = scenarios.find(entry => entry.key === key);
    if (!scenario) {
        console.error('unknown scenario: ' + key);
        process.exit(1);
    }
    return scenario;
}

if (allocArg) {
    runAlloc(findScenario(allocArg.split('=')[1])).then(result => {
        process.stdout.write('__RESULT__' + JSON.stringify(result) + '\n');
    });
} else if (scenarioArg) {
    runScenario(findScenario(scenarioArg.split('=')[1]), blocks).then(result => {
        process.stdout.write('__RESULT__' + JSON.stringify(result) + '\n');
    });
} else {
    ensureBaseline();

    const only = onlyArg ? onlyArg.split('=')[1].split(',') : null;
    const selected = only ? scenarios.filter(scenario => only.includes(scenario.key)) : scenarios;
    if (selected.length === 0) {
        console.error('no scenarios matched --only');
        process.exit(1);
    }

    const rapierVersion = JSON.parse(fs.readFileSync(
        path.join(FORK_ROOT, 'node_modules', RAPIER_PKG, 'package.json'), 'utf8')).version;
    console.log('matter (upstream ' + BASELINE_REF + ' + fork) vs rapier2d-simd ' + rapierVersion + ' (WASM)');
    console.log(blocks + ' timed blocks per arm, 4 arms interleaved in one process, ' +
        repeats + ' process' + (repeats === 1 ? '' : 'es') + ' per scenario, each arm keeping its best');
    console.log('');

    function runChild(execArgs, scriptArgs) {
        const child = spawnSync(process.execPath, execArgs.concat([__filename], scriptArgs), {
            encoding: 'utf8',
            maxBuffer: 1 << 24
        });
        if (child.status !== 0) {
            console.log(' FAILED');
            console.error(child.stderr);
            process.exit(1);
        }
        const marker = child.stdout.indexOf('__RESULT__');
        return JSON.parse(child.stdout.slice(marker + '__RESULT__'.length));
    }

    function mergeRepeats(runs) {
        const merged = JSON.parse(JSON.stringify(runs[0]));
        for (const result of merged.results) {
            const samples = runs.map(run => run.results.find(other => other.key === result.key));
            result.best = Math.min.apply(null, samples.map(sample => sample.best));
            result.median = Math.min.apply(null, samples.map(sample => sample.median));
        }
        return merged;
    }

    const rows = [];
    for (const scenario of (allocOnly ? [] : selected)) {
        process.stdout.write((scenario.key + ' ').padEnd(26, '.'));
        const runs = [];
        for (let repeat = 0; repeat < repeats; repeat++) {
            runs.push(runChild([], ['--scenario=' + scenario.key, '--blocks=' + blocks]));
        }
        const row = mergeRepeats(runs);
        rows.push(row);

        const upstream = row.results.find(result => result.key === 'upstream');
        const forkGrid = row.results.find(result => result.key === 'fork-grid');
        const rapierBridge = row.results.find(result => result.key === 'rapier-bridge');
        const badArm = row.checks.find(check => check.nonFinite > 0);
        const countMismatch = row.checks.some(check =>
            check.bodies !== row.checks[0].bodies || check.movers !== row.checks[0].movers);
        console.log(' up ' + upstream.best.toFixed(0).padStart(6) + 'us | fork ' +
            forkGrid.best.toFixed(0).padStart(6) + 'us | rapier+bridge ' +
            rapierBridge.best.toFixed(0).padStart(6) + 'us' +
            (badArm ? '  NON-FINITE BODIES, RESULT INVALID' : '') +
            (countMismatch ? '  BODY COUNT MISMATCH ACROSS ARMS' : ''));
    }

    if (rows.length > 0) {
        console.log('');
        console.log(buildTable(rows));
        console.log('');
        console.log('Times are us per step, mean of the fastest fifth of blocks.');
        console.log('');
        console.log(buildBridgeTable(rows));
        console.log('');
        for (const row of rows) {
            const counts = row.checks.map((check, index) => ARMS[index].key + ' ' + check.bodies + 'b/' + check.movers + 'm' +
                (check.asleep ? ' asleep:' + check.asleep : '') + ' y[' + check.minY + '..' + check.maxY + ']').join(', ');
            console.log('  ' + row.key.padEnd(16) + counts);
        }
    }

    if (wantAlloc) {
        console.log('');
        console.log('JS-heap allocation per step (rapier WASM memory not included: rapier cells are pure bridge garbage)');
        const allocRows = [];
        for (const scenario of selected) {
            process.stdout.write((scenario.key + ' ').padEnd(26, '.'));
            const row = runChild(
                ['--expose-gc', '--min-semi-space-size=64', '--max-semi-space-size=64'],
                ['--alloc=' + scenario.key]
            );
            allocRows.push(row);
            console.log(' done');
        }
        console.log('');
        console.log(buildAllocTable(allocRows));
    }
}
