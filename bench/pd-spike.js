/* eslint-env node */
"use strict";
// Reproduce the page-destroyer "shoot = frame dip" spike in isolation and
// attribute it: sort phase vs sweep phase of Detector.collisions, native sort
// vs the fork's insertion sort, calm vs post-blast. n ~ 7300 static tiles to
// match the captured trace (physics.step bodies=7295, p50=6.6ms, spikes=67ms).
const Matter = require('../build/matter.js');
const { Bodies, Body, Composite, Engine, Collision } = Matter;
const now = () => Number(process.hrtime.bigint()) / 1e6;

// ---- instrumented Detector.collisions (the real algorithm + timers/counters)
const stats = { tSort: 0, tSweep: 0, iter: 0, collide: 0, nonStatic: 0 };
let useInsertion = true;
const realCollides = Collision.collides;

function instrumentedCollisions(detector) {
  const pairs = detector.pairs;
  const bodies = detector.bodies;
  const bodiesLength = bodies.length;
  const canCollide = Matter.Detector.canCollide;
  const collisions = detector.collisions;
  let collisionIndex = 0;
  let i, j;

  const s0 = now();
  if (useInsertion) {
    for (i = 1; i < bodiesLength; i++) {
      const insertBody = bodies[i];
      const insertX = insertBody.bounds.min.x;
      let k = i - 1;
      while (k >= 0 && bodies[k].bounds.min.x > insertX) {
        bodies[k + 1] = bodies[k];
        k--;
      }
      bodies[k + 1] = insertBody;
    }
  } else {
    bodies.sort((a, b) => a.bounds.min.x - b.bounds.min.x);
  }
  stats.tSort += now() - s0;

  const w0 = now();
  for (i = 0; i < bodiesLength; i++) {
    const bodyA = bodies[i];
    let boundsA = bodyA.bounds;
    const boundXMax = bodyA.bounds.max.x;
    const boundYMax = bodyA.bounds.max.y;
    const boundYMin = bodyA.bounds.min.y;
    const bodyAStatic = bodyA.isStatic || bodyA.isSleeping;
    const partsALength = bodyA.parts.length;
    const partsASingle = partsALength === 1;
    for (j = i + 1; j < bodiesLength; j++) {
      stats.iter++;
      const bodyB = bodies[j];
      let boundsB = bodyB.bounds;
      if (boundsB.min.x > boundXMax) break;
      if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) continue;
      if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) continue;
      if (!canCollide(bodyA.collisionFilter, bodyB.collisionFilter)) continue;
      const partsBLength = bodyB.parts.length;
      if (partsASingle && partsBLength === 1) {
        stats.collide++;
        const collision = realCollides(bodyA, bodyB, pairs);
        if (collision) collisions[collisionIndex++] = collision;
      } else {
        const partsAStart = partsALength > 1 ? 1 : 0;
        const partsBStart = partsBLength > 1 ? 1 : 0;
        for (let k = partsAStart; k < partsALength; k++) {
          const partA = bodyA.parts[k];
          boundsA = partA.bounds;
          for (let z = partsBStart; z < partsBLength; z++) {
            const partB = bodyB.parts[z];
            boundsB = partB.bounds;
            if (boundsA.min.x > boundsB.max.x || boundsA.max.x < boundsB.min.x
              || boundsA.max.y < boundsB.min.y || boundsA.min.y > boundsB.max.y) continue;
            stats.collide++;
            const c2 = realCollides(partA, partB, pairs);
            if (c2) collisions[collisionIndex++] = c2;
          }
        }
      }
    }
  }
  stats.tSweep += now() - w0;
  if (collisions.length !== collisionIndex) collisions.length = collisionIndex;
  return collisions;
}
Matter.Detector.collisions = instrumentedCollisions;

// ---- build scene: dense static grid, y-major add order (matches materialise)
function buildWorld({ cols, rows, tile }) {
  const engine = Engine.create();
  engine.gravity.y = 1;
  const world = engine.world;
  const all = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = Bodies.rectangle(c * tile + tile / 2, r * tile + tile / 2, tile - 1, tile - 1, {
        isStatic: true,
        label: 'destructible',
      });
      all.push(b);
    }
  }
  // add y-major (row by row), matching staticByRow materialisation order
  Composite.add(world, all);
  Composite.add(world, Bodies.rectangle((cols * tile) / 2, rows * tile + 40, cols * tile + 200, 60, { isStatic: true, label: 'floor' }));
  return { engine, world, grid: all, cols, rows, tile };
}

function resetStats() { stats.tSort = 0; stats.tSweep = 0; stats.iter = 0; stats.collide = 0; }

function stepN({ engine, n }) {
  const perStep = [];
  for (let i = 0; i < n; i++) {
    resetStats();
    const t0 = now();
    Engine.update(engine, 1000 / 60);
    perStep.push({ ms: now() - t0, tSort: stats.tSort, tSweep: stats.tSweep, iter: stats.iter, collide: stats.collide });
  }
  return perStep;
}

function median(arr) { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function summarize(label, perStep) {
  const ms = perStep.map((p) => p.ms);
  const peak = perStep.reduce((m, p) => (p.ms > m.ms ? p : m), perStep[0]);
  console.log(`  ${label}: median=${median(ms).toFixed(1)}ms  peak=${peak.ms.toFixed(1)}ms  (peak: sort=${peak.tSort.toFixed(1)} sweep=${peak.tSweep.toFixed(1)} iter=${(peak.iter/1e6).toFixed(1)}M collide=${peak.collide})`);
  return peak;
}

// ---- blast: release a cluster, fling outward (mimics destructible release)
function blast({ grid, cols, rows, tile, cx, cy, radiusTiles, speed }) {
  let released = 0;
  grid.forEach((b) => {
    if (b.isStatic === false) return;
    const dx = b.position.x - cx;
    const dy = b.position.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > radiusTiles * tile) return;
    Body.setStatic(b, false);
    const inv = dist > 0 ? 1 / dist : 0;
    Body.setVelocity(b, { x: dx * inv * speed, y: dy * inv * speed - speed * 0.3 });
    released++;
  });
  return released;
}

function run({ useIns, cols, rows, tile }) {
  useInsertion = useIns;
  const sceneStr = `${cols}x${rows}=${cols * rows} tiles, sort=${useIns ? 'INSERTION (fork)' : 'native Array.sort (stock)'}`;
  console.log(`\n=== ${sceneStr} ===`);
  const sim = buildWorld({ cols, rows, tile });
  stepN({ engine: sim.engine, n: 3 }); // warm
  const calm = stepN({ engine: sim.engine, n: 20 });
  summarize('calm (all static)', calm);

  // repeated blasts near the centre, like sustained fire
  const cx = (cols * tile) / 2;
  const cyBase = (rows * tile) / 2;
  let peakOverall = { ms: 0 };
  for (let shot = 0; shot < 6; shot++) {
    const n = blast({ grid: sim.grid, cols, rows, tile, cx: cx + (shot % 3 - 1) * 80, cy: cyBase + (shot % 2) * 60, radiusTiles: 3, speed: 14 });
    const post = stepN({ engine: sim.engine, n: 12 });
    const peak = summarize(`after shot ${shot + 1} (released ${n}, dynamic now=${sim.grid.filter((b) => !b.isStatic).length})`, post);
    if (peak.ms > peakOverall.ms) peakOverall = peak;
  }
  return peakOverall;
}

const TILE = 20;
const COLS = 110;
const ROWS = 66; // 7260 tiles ~ trace's 7295
run({ useIns: true, cols: COLS, rows: ROWS, tile: TILE });
run({ useIns: false, cols: COLS, rows: ROWS, tile: TILE });
