/* eslint-env node */
// Upstream-vs-fork benchmark suite.
//
// Every other bench in here compares the fork against an EARLIER FORK TAG, to
// gate one change at a time. This one answers the other question: what does a
// consumer get by taking the fork instead of stock `matter-js@0.20.0`? It runs a
// fixed set of scenarios, half of them ordinary matter workloads (so a
// regression outside the target regime is visible) and half of them the
// Page Rage regime the fork is tuned for.
//
// Three arms per scenario, all in one process against identical scenes, timed in
// alternating short blocks (the `bench/ab-inline.js` method: interference has to
// land inside a ~10ms window to bias one arm, and paired blocks remove what
// does):
//
//   1. upstream        stock 0.20.0, its only broadphase (sweep)
//   2. fork (sweep)    the fork with the SAME broadphase as stock, so the
//                      difference is the micro-optimisations alone
//   3. fork (shipped)  the fork as page-rage consumes it (gridStatic)
//
// Each scenario runs in its own child process so heap growth and JIT state from
// one cannot bias the next. The baseline tree is provisioned automatically as a
// git worktree at `.bench/stock-0.20.0`.
//
// Usage:
//   node bench/suite.js                  all scenarios, markdown table at the end
//   node bench/suite.js --quick          fewer blocks (rough numbers, ~3x faster)
//   node bench/suite.js --only=page-calm,stack
//   node bench/suite.js --blocks=40
//   BASELINE_REF=0.20.0 node bench/suite.js
"use strict";

const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const FORK_ROOT = path.join(__dirname, '..');
const FORK_MAIN = path.join(FORK_ROOT, 'src', 'module', 'main.js');
const BASELINE_REF = process.env.BASELINE_REF || '0.20.0';
const BASELINE_ROOT = path.join(FORK_ROOT, '.bench', 'stock-' + BASELINE_REF);
const BASELINE_MAIN = path.join(BASELINE_ROOT, 'src', 'module', 'main.js');

const hr = () => Number(process.hrtime.bigint());

function makeRandom(seed) {
    let state = seed;
    return function random() {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

// Scene helpers

// The "page": a dense field of small static tiles with dynamic debris moving
// through it. Mirrors `bench/profile-game.js` so numbers stay comparable with
// the per-change benches.
function buildPage(Matter, options) {
    const { Engine, Composite, Bodies, Body } = Matter;
    const random = makeRandom(24681);
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;

    // floor and walls so debris piles instead of escaping
    Composite.add(world, Bodies.rectangle(1000, 2400, 2200, 60, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(-40, 1200, 60, 2600, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(2040, 1200, 60, 2600, { isStatic: true }));

    const cols = Math.round(Math.sqrt(options.statics * (2000 / 2300)));
    const rows = Math.ceil(options.statics / cols);
    const tileWidth = Math.max(10, 1960 / cols - 6);
    const tileHeight = Math.max(8, 2200 / rows - 6);
    let placed = 0;
    for (let row = 0; row < rows && placed < options.statics; row++) {
        for (let col = 0; col < cols && placed < options.statics; col++) {
            Composite.add(world, Bodies.rectangle(
                30 + col * (1960 / cols), 30 + row * (2200 / rows),
                tileWidth, tileHeight,
                { isStatic: true }
            ));
            placed++;
        }
    }

    for (let i = 0; i < options.movers; i++) {
        const spawnY = options.raining ? -40 - random() * 900 : 2340 - (i % 8) * 26;
        const body = Bodies.rectangle(
            60 + random() * 1880, spawnY,
            12 + random() * 20, 12 + random() * 20,
            { friction: 0.4, restitution: 0.2 }
        );
        Body.setAngle(body, random() * Math.PI);
        Composite.add(world, body);
    }

    // fast sensor bullets streaking through the field, wrapped on exit: the
    // game's projectiles are sensors with no gravity and a high straight-line
    // velocity, and they are what turns a calm page into a broadphase problem
    const bullets = [];
    for (let i = 0; i < (options.bullets || 0); i++) {
        const bullet = Bodies.rectangle(-60 - i * 260, 120 + (i % 6) * 320, 14, 6, {
            isSensor: true,
            frictionAir: 0
        });
        Body.setVelocity(bullet, { x: 30, y: 0 });
        Composite.add(world, bullet);
        bullets.push(bullet);
    }

    return {
        engine,
        step() {
            Engine.update(engine, 1000 / 60);
            for (let i = 0; i < bullets.length; i++) {
                const bullet = bullets[i];
                if (bullet.position.x > 2100) {
                    Body.setPosition(bullet, { x: -60, y: 120 + (i % 6) * 320 });
                    Body.setVelocity(bullet, { x: 30, y: 0 });
                }
            }
        }
    };
}

// The page under sustained MEMBERSHIP change: tiles released into debris, debris
// evicted, replacements materialised, every single frame. Mirrors
// `bench/profile-churn.js`, including its build-dynamic-then-`setStatic` tiles
// (a body born static releases with infinite mass and goes non-finite).
function buildChurn(Matter, options) {
    const { Engine, Composite, Bodies, Body } = Matter;
    const random = makeRandom(24681);
    const engine = Engine.create({ enableSleeping: false });
    const world = engine.world;

    Composite.add(world, Bodies.rectangle(1000, 2600, 2200, 60, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(-40, 1200, 60, 2600, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(2040, 1200, 60, 2600, { isStatic: true }));

    const cols = Math.round(Math.sqrt(options.statics * (2000 / 2300)));
    const rows = Math.ceil(options.statics / cols);
    const tileWidth = Math.max(10, 1960 / cols - 6);
    const tileHeight = Math.max(8, 2200 / rows - 6);
    const tiles = [];
    let placed = 0;
    for (let row = 0; row < rows && placed < options.statics; row++) {
        for (let col = 0; col < cols && placed < options.statics; col++) {
            const tile = Bodies.rectangle(
                30 + col * (1960 / cols), 30 + row * (2200 / rows),
                tileWidth, tileHeight
            );
            Body.setStatic(tile, true);
            Composite.add(world, tile);
            tiles.push(tile);
            placed++;
        }
    }

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
    let frame = 0;

    function churn() {
        frame++;

        for (let k = 0; k < options.releasePerFrame && releaseIndex < order.length; k++) {
            const tile = tiles[order[releaseIndex++]];
            Body.setStatic(tile, false);
            Body.setVelocity(tile, { x: (random() - 0.5) * 6, y: 4 + random() * 4 });
            live.push({ body: tile, bornFrame: frame });
        }

        // evict by age: a released tile usually comes to rest on the tiles below
        // it rather than leaving the field, so a height cut-off never fires
        let evicted = 0;
        while (live.length > 0 && frame - live[0].bornFrame > debrisLife) {
            Composite.remove(world, live.shift().body);
            evicted++;
        }

        // top the field back up, the way viewport windowing materialises new
        // statics as the camera moves
        for (let k = 0; k < evicted; k++) {
            const replacement = Bodies.rectangle(
                60 + random() * 1880, 40 + random() * 2100, tileWidth, tileHeight
            );
            Body.setStatic(replacement, true);
            Composite.add(world, replacement);
            tiles.push(replacement);
            order.push(tiles.length - 1);
        }
    }

    return {
        engine,
        step() {
            churn();
            Engine.update(engine, 1000 / 60);
        }
    };
}

function addBowl(Matter, world, options) {
    const { Composite, Bodies } = Matter;
    Composite.add(world, Bodies.rectangle(options.width / 2, options.height, options.width + 200, 60, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(-30, options.height / 2, 60, options.height * 2, { isStatic: true }));
    Composite.add(world, Bodies.rectangle(options.width + 30, options.height / 2, 60, options.height * 2, { isStatic: true }));
}

// Scenarios

const scenarios = [
    {
        key: 'stack',
        title: 'Box stack settling',
        group: 'General',
        note: '336 boxes dropped into a walled bowl and left to pile',
        warmup: 500,
        blockUpdates: 20,
        build(Matter) {
            const { Engine, Composite, Composites, Bodies } = Matter;
            const engine = Engine.create({ enableSleeping: false });
            addBowl(Matter, engine.world, { width: 900, height: 640 });
            Composite.add(engine.world, Composites.stack(80, 40, 24, 14, 6, 6, function(x, y) {
                return Bodies.rectangle(x, y, 26, 26, { friction: 0.4, restitution: 0.2 });
            }));
            return {
                engine,
                step() {
                    Engine.update(engine, 1000 / 60);
                }
            };
        }
    },
    {
        key: 'mixed-shapes',
        title: 'Mixed shapes pile',
        group: 'General',
        note: '300 circles, polygons and boxes settled together (narrowphase variety)',
        warmup: 500,
        blockUpdates: 20,
        build(Matter) {
            const { Engine, Composite, Bodies, Body } = Matter;
            const random = makeRandom(13579);
            const engine = Engine.create({ enableSleeping: false });
            addBowl(Matter, engine.world, { width: 900, height: 640 });
            for (let i = 0; i < 300; i++) {
                const x = 40 + random() * 820;
                const y = -20 - random() * 900;
                const size = 10 + random() * 14;
                const roll = random();
                const body = (function makeBody() {
                    if (roll < 0.34) {
                        return Bodies.circle(x, y, size * 0.6, { friction: 0.4, restitution: 0.2 });
                    }
                    if (roll < 0.67) {
                        return Bodies.polygon(x, y, 3 + Math.floor(random() * 6), size * 0.7, { friction: 0.4, restitution: 0.2 });
                    }
                    return Bodies.rectangle(x, y, size * 1.6, size, { friction: 0.4, restitution: 0.2 });
                })();
                Body.setAngle(body, random() * Math.PI);
                Composite.add(engine.world, body);
            }
            return {
                engine,
                step() {
                    Engine.update(engine, 1000 / 60);
                }
            };
        }
    },
    {
        key: 'constraints',
        title: 'Constraint chains',
        group: 'General',
        note: '8 pinned 24-link chains plus 120 falling boxes (the fork only skips constraint passes when a world has none)',
        warmup: 400,
        blockUpdates: 20,
        build(Matter) {
            const { Engine, Composite, Bodies, Body, Constraint } = Matter;
            const random = makeRandom(31337);
            const engine = Engine.create({ enableSleeping: false });
            addBowl(Matter, engine.world, { width: 900, height: 640 });
            for (let chain = 0; chain < 8; chain++) {
                const anchorX = 60 + chain * 100;
                let previous = null;
                for (let link = 0; link < 24; link++) {
                    const body = Bodies.rectangle(anchorX, 40 + link * 14, 18, 10, {
                        friction: 0.4,
                        collisionFilter: { group: -(chain + 1) }
                    });
                    Composite.add(engine.world, body);
                    Composite.add(engine.world, Constraint.create({
                        bodyA: previous,
                        pointA: previous ? { x: 0, y: 6 } : { x: anchorX, y: 30 },
                        bodyB: body,
                        pointB: { x: 0, y: -6 },
                        stiffness: 0.8,
                        length: 4
                    }));
                    previous = body;
                }
            }
            for (let i = 0; i < 120; i++) {
                const body = Bodies.rectangle(40 + random() * 820, -20 - random() * 700, 18, 18, {
                    friction: 0.4,
                    restitution: 0.2
                });
                Body.setAngle(body, random() * Math.PI);
                Composite.add(engine.world, body);
            }
            return {
                engine,
                step() {
                    Engine.update(engine, 1000 / 60);
                }
            };
        }
    },
    {
        key: 'sleeping',
        title: 'Sleeping enabled',
        group: 'General',
        note: '400 boxes settled with `enableSleeping: true`, so most are asleep (the fork keeps the whole-world force pass here)',
        warmup: 700,
        blockUpdates: 20,
        build(Matter) {
            const { Engine, Composite, Composites, Bodies } = Matter;
            const engine = Engine.create({ enableSleeping: true });
            addBowl(Matter, engine.world, { width: 900, height: 640 });
            Composite.add(engine.world, Composites.stack(80, 40, 25, 16, 6, 6, function(x, y) {
                return Bodies.rectangle(x, y, 26, 26, { friction: 0.4, restitution: 0.1 });
            }));
            return {
                engine,
                step() {
                    Engine.update(engine, 1000 / 60);
                }
            };
        }
    },
    {
        key: 'moving-platforms',
        title: 'Moving static platforms',
        group: 'General',
        note: '16 statics translated every frame under 300 falling boxes (a static that moves must be re-indexed every step)',
        warmup: 400,
        blockUpdates: 20,
        build(Matter) {
            const { Engine, Composite, Bodies, Body, Detector } = Matter;
            const random = makeRandom(97531);
            const engine = Engine.create({ enableSleeping: false });
            addBowl(Matter, engine.world, { width: 900, height: 640 });
            const platforms = [];
            for (let i = 0; i < 16; i++) {
                const platform = Bodies.rectangle(120 + (i % 4) * 220, 120 + Math.floor(i / 4) * 130, 160, 20, { isStatic: true });
                if (typeof Detector.setGridDynamic === 'function') {
                    Detector.setGridDynamic(platform, true);
                }
                Composite.add(engine.world, platform);
                platforms.push({ body: platform, phase: random() * Math.PI * 2, originX: platform.position.x });
            }
            for (let i = 0; i < 300; i++) {
                const body = Bodies.rectangle(40 + random() * 820, -20 - random() * 900, 16, 16, {
                    friction: 0.4,
                    restitution: 0.2
                });
                Composite.add(engine.world, body);
            }
            let tick = 0;
            return {
                engine,
                step() {
                    tick++;
                    for (let i = 0; i < platforms.length; i++) {
                        const platform = platforms[i];
                        Body.setPosition(platform.body, {
                            x: platform.originX + Math.sin(tick * 0.02 + platform.phase) * 70,
                            y: platform.body.position.y
                        });
                    }
                    Engine.update(engine, 1000 / 60);
                }
            };
        }
    },
    {
        key: 'page-calm',
        title: 'Page, calm',
        group: 'Page Rage',
        note: '5000 static tiles, 300 settled debris (the traversal regime)',
        warmup: 600,
        blockUpdates: 10,
        build(Matter) {
            return buildPage(Matter, { statics: 5000, movers: 300, raining: false });
        }
    },
    {
        key: 'page-settle',
        title: 'Page, debris raining',
        group: 'Page Rage',
        note: '5000 static tiles, 300 debris falling and piling',
        warmup: 240,
        blockUpdates: 10,
        build(Matter) {
            return buildPage(Matter, { statics: 5000, movers: 300, raining: true });
        }
    },
    {
        key: 'page-firing',
        title: 'Page, firing',
        group: 'Page Rage',
        note: 'calm page plus 8 fast sensor bullets streaking through the field',
        warmup: 600,
        blockUpdates: 10,
        build(Matter) {
            return buildPage(Matter, { statics: 5000, movers: 300, raining: false, bullets: 8 });
        }
    },
    {
        key: 'page-storm',
        title: 'Page, 800-mover storm',
        group: 'Page Rage',
        note: '5000 static tiles with 800 debris bodies in flight',
        warmup: 300,
        blockUpdates: 10,
        build(Matter) {
            return buildPage(Matter, { statics: 5000, movers: 800, raining: true });
        }
    },
    {
        key: 'page-churn',
        title: 'Page, being destroyed',
        group: 'Page Rage',
        note: '12 tiles released, evicted and replaced every frame, so every cached body set is invalidated every step',
        warmup: 240,
        blockUpdates: 10,
        build(Matter) {
            return buildChurn(Matter, { statics: 5000, releasePerFrame: 12 });
        }
    },
    {
        key: 'page-2k',
        title: 'Page, calm (2000 tiles)',
        group: 'Page Rage',
        note: 'the calm page at a smaller page size',
        warmup: 600,
        blockUpdates: 10,
        build(Matter) {
            return buildPage(Matter, { statics: 2000, movers: 300, raining: false });
        }
    },
    {
        key: 'page-8k',
        title: 'Page, calm (8000 tiles)',
        group: 'Page Rage',
        note: 'the calm page at a larger page size',
        warmup: 600,
        blockUpdates: 10,
        build(Matter) {
            return buildPage(Matter, { statics: 8000, movers: 300, raining: false });
        }
    }
];

// Arms

const ARMS = [
    { key: 'upstream', label: 'upstream 0.20.0', tree: 'baseline', mode: 'sweep' },
    { key: 'fork-sweep', label: 'fork (sweep)', tree: 'fork', mode: 'sweep' },
    { key: 'fork-grid', label: 'fork (gridStatic)', tree: 'fork', mode: 'gridStatic' }
];

// Two of the arms are the same tree in different configurations, so they must
// not share a module instance: `Detector._mode` lives on the module, and a
// cached `require` would hand both arms the same one (whichever configured
// itself last would silently win for both). Purging the tree's cache subtree
// first gives every arm its own module graph.
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

function makeArm(arm, scenario) {
    const Matter = loadIsolated(arm.tree === 'fork' ? FORK_MAIN : BASELINE_MAIN);
    // stock has no `_mode`: it is sweep-only, which is exactly what this arm wants
    if ('_mode' in Matter.Detector) {
        Matter.Detector._mode = arm.mode;
    }
    const built = scenario.build(Matter);
    return { Matter, engine: built.engine, step: built.step };
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

function runScenario(scenario, blocks) {
    const arms = ARMS.map(arm => Object.assign({}, arm, { instance: makeArm(arm, scenario) }));

    for (let i = 0; i < scenario.warmup; i++) {
        for (let a = 0; a < arms.length; a++) {
            arms[a].instance.step();
        }
    }

    const blockTimes = arms.map(() => []);

    for (let block = 0; block < blocks; block++) {
        // rotate which arm leads each block so none of them always pays for a
        // cold cache or always lands on the same slice of background noise
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

    // sanity: the arms must have simulated the same scene, and a non-finite body
    // means the scene silently stopped being a physics workload (the born-static
    // release trap). Neither is a timing result worth reporting.
    const checks = arms.map(arm => {
        const bodies = arm.instance.Matter.Composite.allBodies(arm.instance.engine.world);
        let movers = 0;
        let nonFinite = 0;
        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (!body.isStatic) {
                movers++;
            }
            if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y)) {
                nonFinite++;
            }
        }
        return { bodies: bodies.length, movers, nonFinite };
    });

    return {
        key: scenario.key,
        title: scenario.title,
        group: scenario.group,
        note: scenario.note,
        bodies: checks[0].bodies,
        movers: checks[0].movers,
        blocks,
        blockUpdates: scenario.blockUpdates,
        results,
        checks
    };
}

// Allocation
//
// Less per-frame garbage is a separate axis from step time: it is what keeps a
// destruction burst from being interrupted by GC. Measured exactly rather than
// by proxy: the child runs with a young generation pinned large enough that a
// short window of steps cannot fill it, so the `gc()`-to-`heapUsed` delta over
// that window IS the bytes allocated, garbage included.
//
// A collection landing inside a window would silently undercount it, and that
// error is biased: it lands on the arm that allocates most. So every window is
// checked against the process GC feed and a contaminated one is thrown away
// rather than averaged in (which is what an earlier median-of-N version of this
// did, and it reported an arm allocating 5x less than a near-identical scene).
const ALLOC_STEPS = 50;
const ALLOC_WINDOWS = 7;
const ALLOC_MAX_ATTEMPTS = 40;

const nextTick = () => new Promise(resolve => setImmediate(resolve));

async function measureAllocWindow(instance, gcFeed) {
    const { performance } = require('perf_hooks');
    global.gc();
    // the observer delivers entries a tick or more after the collection they
    // describe, so a window is judged by entry START TIMES rather than by a
    // counter: the forced collection above always lands after this drain
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
    const gcFeed = { starts: [] };
    const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
            gcFeed.starts.push(entry.startTime);
        }
    });
    observer.observe({ entryTypes: ['gc'] });

    const results = [];
    for (const arm of ARMS) {
        const instance = makeArm(arm, scenario);
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
            windows: clean.length,
            spread: clean.length > 1 ? Math.max.apply(null, clean) / Math.min.apply(null, clean) : 1
        });
        global.gc();
    }

    observer.disconnect();

    return {
        key: scenario.key,
        title: scenario.title,
        group: scenario.group,
        results
    };
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

// every figure is its own code span, and each fork column carries its own delta
// against upstream, so the two of them can be read independently rather than
// through a single shared change column
function figure(value) {
    return '`' + value + '`';
}

function formatAgainst(value, baseline, unit) {
    return figure(value.toFixed(unit === 'us' ? 0 : 1) + unit) +
        ' (' + figure(formatPercent(100 * (value - baseline) / baseline)) + ')';
}

const GROUP_LINKS = { 'Page Rage': 'https://page-rage.com' };

function buildTable(rows) {
    const lines = [];
    lines.push('| Scenario | Bodies | Upstream ' + figure(BASELINE_REF) + ' | Fork | Fork (new gridStatic algorithm) |');
    lines.push('| --- | --- | --- | --- | --- |');
    let group = null;
    for (const row of rows) {
        if (row.group !== group) {
            group = row.group;
            const label = GROUP_LINKS[group] ? '[' + group + '](' + GROUP_LINKS[group] + ')' : group;
            lines.push('| **' + label + '** | | | | |');
        }
        const upstream = row.results.find(result => result.key === 'upstream');
        const forkSweep = row.results.find(result => result.key === 'fork-sweep');
        const forkGrid = row.results.find(result => result.key === 'fork-grid');
        lines.push('| ' + row.title +
            ' | ' + figure(row.bodies.toLocaleString('en-US')) +
            ' | ' + figure(upstream.best.toFixed(0) + 'us') +
            ' | ' + formatAgainst(forkSweep.best, upstream.best, 'us') +
            ' | ' + formatAgainst(forkGrid.best, upstream.best, 'us') + ' |');
    }
    return lines.join('\n');
}

function formatAllocRow(row) {
    const upstream = row.results.find(result => result.key === 'upstream');
    const forkSweep = row.results.find(result => result.key === 'fork-sweep');
    const forkGrid = row.results.find(result => result.key === 'fork-grid');
    const measured = [upstream, forkSweep, forkGrid].every(result => result.bytesPerStep !== null);
    if (!measured) {
        return { upstream: 'n/a', forkSweep: 'n/a', forkGrid: 'n/a' };
    }
    const baseline = upstream.bytesPerStep / 1024;
    return {
        upstream: figure(baseline.toFixed(1) + ' KB'),
        forkSweep: formatAgainst(forkSweep.bytesPerStep / 1024, baseline, ' KB'),
        forkGrid: formatAgainst(forkGrid.bytesPerStep / 1024, baseline, ' KB')
    };
}

function buildAllocTable(rows) {
    const lines = [];
    lines.push('| Scenario | Upstream ' + figure(BASELINE_REF) + ' | Fork | Fork (new gridStatic algorithm) |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of rows) {
        const cells = formatAllocRow(row);
        lines.push('| ' + row.title + ' | ' + cells.upstream + ' | ' + cells.forkSweep + ' | ' + cells.forkGrid + ' |');
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
// `--alloc-only` skips the timing pass, which is the long one: regenerating the
// memory table alone does not need three timed processes per scenario
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
    // child mode: measure allocation for one scenario
    runAlloc(findScenario(allocArg.split('=')[1])).then(result => {
        process.stdout.write('__RESULT__' + JSON.stringify(result) + '\n');
    });
} else if (scenarioArg) {
    // child mode: time one scenario and hand the result back as JSON. `--quick`
    // buys its speed from the block count only, never from the warmup: the two
    // trees are deterministic but re-baselined against each other, so their
    // scenes DIVERGE, and a scene cut short is still chaotic enough that the
    // arms are doing genuinely different amounts of work. Short-warmup runs
    // reported a 19% regression on a scenario that reproduces at -16%.
    process.stdout.write('__RESULT__' + JSON.stringify(runScenario(findScenario(scenarioArg.split('=')[1]), blocks)) + '\n');
} else {
    ensureBaseline();

    const only = onlyArg ? onlyArg.split('=')[1].split(',') : null;
    const selected = only ? scenarios.filter(scenario => only.includes(scenario.key)) : scenarios;
    if (selected.length === 0) {
        console.error('no scenarios matched --only');
        process.exit(1);
    }

    console.log('matter-js benchmark suite: fork vs stock ' + BASELINE_REF);
    console.log(blocks + ' timed blocks per arm, arms interleaved in one process, ' +
        repeats + ' process' + (repeats === 1 ? '' : 'es') + ' per scenario, each arm keeping its best');
    if (blocks < 8) {
        console.log('WARNING: fewer than 8 blocks leaves nothing to reject noise with, treat these as indicative only');
    }
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

    // Interleaved blocks remove interference that lands inside a block, but not
    // a whole process that ran hot: one published run had a single arm read 35%
    // above the same arm in three neighbouring runs. So each scenario is run in
    // several fresh processes and each arm keeps its own best, which is the only
    // reading no amount of background noise can have inflated.
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
            runs.push(runChild([], [
                '--scenario=' + scenario.key,
                '--blocks=' + blocks
            ].concat(quick ? ['--quick'] : [])));
        }
        const row = mergeRepeats(runs);
        rows.push(row);

        const upstream = row.results.find(result => result.key === 'upstream');
        const forkGrid = row.results.find(result => result.key === 'fork-grid');
        const change = 100 * (forkGrid.best - upstream.best) / upstream.best;
        const badArm = row.checks.find(check => check.nonFinite > 0);
        console.log(' ' + upstream.best.toFixed(0).padStart(6) + 'us -> ' +
            forkGrid.best.toFixed(0).padStart(6) + 'us  ' + formatPercent(change).padStart(6) +
            (badArm ? '  NON-FINITE BODIES, RESULT INVALID' : ''));
    }

    if (rows.length > 0) {
        console.log('');
        console.log(buildTable(rows));
        console.log('');
        console.log('Times are us per `Engine.update`, mean of the fastest fifth of blocks.');
        for (const row of rows) {
            const detail = row.results.map(result => result.label + ' median ' + result.median.toFixed(0) + 'us').join(', ');
            console.log('  ' + row.key.padEnd(18) + row.bodies + ' bodies (' + row.movers + ' movers): ' + detail);
        }
    }

    if (wantAlloc) {
        console.log('');
        console.log('allocation per step');
        const allocRows = [];
        for (const scenario of selected) {
            process.stdout.write((scenario.key + ' ').padEnd(26, '.'));
            // the young generation is pinned at both ends: left to grow
            // adaptively, V8 starts it small and scavenges inside a window
            const row = runChild(
                ['--expose-gc', '--min-semi-space-size=64', '--max-semi-space-size=64'],
                ['--alloc=' + scenario.key]
            );
            allocRows.push(row);
            const cells = formatAllocRow(row);
            const dirty = row.results.filter(result => result.windows < ALLOC_WINDOWS);
            console.log(' ' + cells.upstream.replace(/`/g, '').padStart(9) + ' -> ' +
                cells.forkSweep.replace(/`/g, '') + ' -> ' + cells.forkGrid.replace(/`/g, '') +
                (dirty.length > 0 ? '  (' + dirty.map(result => result.key + ': ' + result.windows + '/' + ALLOC_WINDOWS + ' clean windows').join(', ') + ')' : ''));
        }
        console.log('');
        console.log(buildAllocTable(allocRows));
    }
}
