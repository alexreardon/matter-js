/* eslint-env node */
// Broadphase A/B harness for the page-destroyer regime: a large STATIC field
// (the intact page) plus a few MOVERS (debris or fast "bullets"). Models three
// page shapes so we can see the grid-vs-sweep delta across density, not just on
// the dense worst case.
//
//   SCENE=sparse|medium|dense   page shape (default dense)
//   MODE=sweep|grid             broadphase (default sweep); sets Detector._mode
//   MOVERS=n                    number of dynamic bodies (default 6)
//   BULLETS=1                   movers are fast bouncing bodies (wide swept AABB)
//   CELL=32                     grid cell size px (grid mode only)
//   UPDATES=1200 WARMUP=200     timing window
//   PHASES=1                    print Detector.collisions split
//
// Requires the fork SOURCE directly (no webpack build needed).
"use strict";

const Matter = require('../src/module/main.js');
const { Engine, Composite, Bodies, Body, Detector } = Matter;

const SCENE = process.env.SCENE || 'dense';
const MODE = process.env.MODE || 'sweep';
const MOVERS = process.env.MOVERS != null ? Number(process.env.MOVERS) : 6;
const BULLETS = process.env.BULLETS === '1';
const CELL = process.env.CELL != null ? Number(process.env.CELL) : 32;
const UPDATES = process.env.UPDATES != null ? Number(process.env.UPDATES) : 1200;
const WARMUP = process.env.WARMUP != null ? Number(process.env.WARMUP) : 200;

// the grid path reads these; the unmodified sweep ignores them
Detector._mode = MODE;
Detector._cellSize = CELL;

const hr = () => Number(process.hrtime.bigint());

let seed = 98765;
const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};

const W = 1280;

function addWalls(world, h) {
    Composite.add(world, [
        Bodies.rectangle(W / 2, h + 30, W + 200, 60, { isStatic: true }),
        Bodies.rectangle(W / 2, -30, W + 200, 60, { isStatic: true }),
        Bodies.rectangle(-30, h / 2, 60, h + 200, { isStatic: true }),
        Bodies.rectangle(W + 30, h / 2, 60, h + 200, { isStatic: true })
    ]);
}

// sparse: a blog-ish page, a few hundred well-spread statics of varied size
function buildSparse(world) {
    let n = 0;
    for (let i = 0; i < 250; i++) {
        const isImage = rand() < 0.15;
        const w = isImage ? 110 + rand() * 80 : 30 + rand() * 190;
        const h = isImage ? 80 + rand() * 70 : 13 + rand() * 7;
        Composite.add(world, Bodies.rectangle(40 + rand() * (W - 120), 30 + rand() * 1500, w, h, { isStatic: true }));
        n++;
    }
    return n;
}

// medium: an aligned card/table layout (rows + columns share coords = mild
// sweep clustering)
function buildMedium(world) {
    let n = 0;
    const cols = 30;
    const rows = 50;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            Composite.add(world, Bodies.rectangle(40 + c * 41, 40 + r * 30, 34, 14, { isStatic: true }));
            n++;
        }
    }
    return n;
}

// dense: a /site-like filled 2D field of small tiles, viewport-sized so
// windowing would not trim it. The sweep worst case.
function buildDense(world) {
    let n = 0;
    const tile = 16;
    const cols = 80;
    const rows = 70;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            Composite.add(world, Bodies.rectangle(20 + c * tile, 20 + r * tile, tile - 1, tile - 1, { isStatic: true }));
            n++;
        }
    }
    return n;
}

function buildScene() {
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;
    const sceneHeight = SCENE === 'sparse' ? 1600 : SCENE === 'medium' ? 1560 : 1160;
    addWalls(world, sceneHeight);

    const staticCount =
        SCENE === 'sparse' ? buildSparse(world) :
        SCENE === 'medium' ? buildMedium(world) :
        buildDense(world);

    // movers
    for (let i = 0; i < MOVERS; i++) {
        if (BULLETS) {
            // fast bouncing body: wide velocity-inflated AABB sweeping the field
            const b = Bodies.rectangle(100 + rand() * (W - 200), 100 + rand() * 600, 10, 6, {
                friction: 0, frictionAir: 0, restitution: 1, density: 0.01
            });
            Body.setVelocity(b, { x: (rand() < 0.5 ? -1 : 1) * 28, y: (rand() - 0.5) * 20 });
            Composite.add(world, b);
        } else {
            const w = 16 + rand() * 22;
            const b = Bodies.rectangle(60 + rand() * (W - 120), -40 - rand() * 500, w, w, { friction: 0.4, restitution: 0.2 });
            Body.setAngle(b, rand() * Math.PI);
            Composite.add(world, b);
        }
    }

    return { engine, staticCount };
}

// opt-in broadphase split
let bpTime = 0;
let bpCalls = 0;
if (process.env.PHASES) {
    const orig = Detector.collisions;
    Detector.collisions = function () {
        const t = hr();
        const r = orig.apply(this, arguments);
        bpTime += hr() - t;
        bpCalls++;
        return r;
    };
}

const built = buildScene();
const engine = built.engine;
const delta = 1000 / 60;

for (let i = 0; i < WARMUP; i++) Engine.update(engine, delta);
bpTime = 0; bpCalls = 0;

const tStart = hr();
for (let i = 0; i < UPDATES; i++) Engine.update(engine, delta);
const tTotal = hr() - tStart;

const total = Composite.allBodies(engine.world).length;
console.log(
    `scene=${SCENE} mode=${MODE}${BULLETS ? ' bullets' : ''} movers=${MOVERS}` +
    (MODE === 'grid' ? ` cell=${CELL}` : '') +
    ` | bodies=${total} (static ${built.staticCount + 4})`
);
console.log(
    `  ${(tTotal / 1e6).toFixed(1)} ms total | ${(tTotal / UPDATES / 1e3).toFixed(2)} us/update` +
    (process.env.PHASES ? ` | broadphase ${(bpTime / UPDATES / 1e3).toFixed(2)} us/update (${(100 * bpTime / tTotal).toFixed(0)}%)` : '')
);
