# Working in this fork

A performance fork of `matter-js@0.20.0`. Its one consumer is
[Page Rage](https://page-rage.com), which shatters a web page into thousands of
static tiles with debris moving through them, so the regime this fork optimises
for is **a dense static field with a few hundred movers**, plus **sustained
membership change** while the page is being destroyed.

Upstream is dormant (no master commits since mid-2024), so changes live here
rather than going upstream.

## The release loop

Work happens here; the consumer pins a release TAG. Run it in this order, and do
not skip step 1 or step 4.

```bash
# 1. BUMP THE VERSION FIRST. `package.json` version IS the release tag without
#    its leading `v`, e.g. tag v0.20.0-perf17 -> version "0.20.0-perf17".
#    Edit package.json directly; do NOT use `npm version`, whose `preversion`
#    hook runs `test-node -- --save=true` and REWRITES the example references.

# 2. gate correctness
npm run test-unit
npm run audit-shapes
NODE_OPTIONS=--openssl-legacy-provider npm run build-dev
node --expose-gc node_modules/.bin/jest --force-exit --no-cache --runInBand \
  --roots ./test --testPathPattern "test/Examples.spec.js"

# 3. measure (see "Measuring" below)

# 4. REBUILD THE SHIPPED BUNDLE. Consumers install a tarball and run no build
#    step, so a stale build/matter.js ships stale code AND a stale version.
NODE_OPTIONS=--openssl-legacy-provider npm run build

# 5. commit, tag, push to the fork remote (NOT `origin`, which is upstream)
git commit -am "perf: ..."
git tag v0.20.0-perf17
git push fork master v0.20.0-perf17
```

### Why the version bump is load-bearing

`Matter.version` reports the fork tag (`0.20.0-perf17`), not `0.20.0`. That
exists so a consumer can assert in CI that it resolved the release it pinned;
Page Rage does this in a unit test and again over its built bundle. Before
`perf16` every tag reported `0.20.0`, so telling `perf7` from `perf15` meant
grepping the bundle for a symbol that happened to be added in the release you
wanted, which is a guess that rots silently.

`test/Version.spec.js` (part of `npm run test-unit`) makes two thirds of this
mechanical: it fails if the version is not a `-perfN` release version, and if
the committed `build/matter.js` does not report the current `package.json`
version. That is the forgot-to-rebuild case. **The remaining gap is a tag name
that disagrees with `package.json`**, which nothing here can see, because the
tag does not exist yet when the tests run. Read the version back before tagging:

```bash
node -e "console.log(require('./build/matter.js').version)"   # must equal the tag, minus the leading v
```

## Hard rules

These are load-bearing; each has cost real time when broken.

- **Bit-identical is the default bar.** A change should not alter the
  simulation. The gate is `test/Determinism.spec.js` plus the 46-example
  suite, which prints `·` (no change) / `●` (extrinsics changed) / `◆`
  (intrinsics changed) per example. A change advertised as bit-identical must
  print `·` on all 46.
- **Never regroup arithmetic.** Only hoist EXACT subexpressions. `a*b*c` is not
  `a*(b*c)` in floating point, and reassociation silently breaks a
  bit-identical claim that the examples suite may not catch.
- **Every per-body / per-pair / per-contact scratch field is declared in its
  factory** (`Body.create`, `Pair.create`, ...). A lazily added field splits the
  population's hidden class and degrades every hot property site engine-wide:
  measured 1.3-4.8x per phase. Enforced by `test/Shape.spec.js` and
  `npm run audit-shapes`.
- **No holey arrays reachable from the engine.** A bare `new Array(n)` without
  `.fill` is that class. `npm run audit-shapes` checks it.
- **`gridStatic` is what the consumer runs**, pinned at boot. The sweep path
  must keep working but is not the hot path.

## Gates

| command | covers |
| --- | --- |
| `npm run test-unit` | Body, Engine, Detector, Determinism, Shape, Version |
| `npm run audit-shapes` | V8 natives: one body map per population, no dictionary-mode objects, no sizeable holey arrays |
| Examples suite (below) | the 46-example similarity gate |
| `node bench/grid-correctness.js` | gridStatic vs sweep pair differential, 5 scenes x 5 cell sizes |
| `CHECK=1 node bench/ab-churn.js <baseline> 500` | per-step body-state equivalence under membership change |

**`npm run test-node` cannot run while `.bench/` exists.** `bench-suite`
provisions baseline worktrees under `.bench/`, and the script's
`./test/Examples.spec.js` argument is a jest PATH REGEX, so it also matches the
copy in there and fails on a `build/matter.dev` it never built. That red is the
harness, not the change. Run the real gate directly with the `--roots ./test`
form in the release loop above, or remove the worktree first.

## Measuring

- **Interleave arms, always.** Whole-scene timing swings several percent
  run-to-run on a busy machine. `bench/ab-inline.js` runs two builds in ONE
  process against identical scenes in alternating blocks and asserts
  bit-identical final state as a side effect. Prefer it to `bench/ab-src.sh`,
  which spawns a fresh process per sample and gave opposite verdicts for the
  same change on identical trees.
- **Run the arms BOTH ways.** `ab-churn` has a measured resident-arm bias of
  ~7-10% for some change classes: it called the resident build slower in BOTH
  orientations. If the blame follows residency rather than the code, the
  harness is the finding. Clean interleaved single-build process runs
  adjudicate.
- **Measure the CHURN regime too.** Every other bench holds the body set
  constant, so every cache in this fork hits 100% of the time, which is the
  opposite of a page being destroyed. `bench/profile-churn.js` and
  `bench/ab-churn.js` cover it.
- **To compare two RELEASES**, use `BASELINE_REF`:
  `BASELINE_REF=v0.20.0-perf16 npm run bench-suite`. This is the only
  whole-suite instrument that can see a single release. Two cautions: read its
  GENERAL scenes, which are small and hold a ~2% spread; its page scenes run on
  the sweep arm, which carries a much wider session spread. And its baseline arm
  is hardcoded `mode: 'sweep'` (`bench/suite.js`), so its `gridStatic` column
  compares gridStatic against the OTHER release's SWEEP and is not a release
  comparison at all.
- **A bench that releases page tiles must build them DYNAMIC and then make them
  static.** `Body.setStatic(body, false)` on a body CREATED static leaves `mass`
  at `Infinity`, the solver divides by a zero inverse mass, and every released
  body goes non-finite within a few steps, silently. Assert zero NaN movers
  before believing any churn number.

## Publishing README numbers

The README's fork-vs-upstream table has a self-check in its methodology block:
keeping the fastest reading per cell should bring every upstream number within
`7%` of the previous release's. That agreement is what proves the table measured
the engine rather than a busy laptop.

**A release whose win is smaller than that table's session noise gets measured
build-to-build, not published into those cells.** This happened at `perf15`: the
machine could not reproduce four upstream cells within `7%` however many samples
were taken (`page-8k` read `+20%` over ten) while the fork columns held a `1.4%`
spread on the same cell. Republishing would have moved the public percentages in
both directions for environmental reasons, making the drop-in headline worse and
the `gridStatic` headline better, neither because of any code change. Allocation
IS safe to republish; it reproduces within `1%`.

## Gotchas

- **`origin` is UPSTREAM** (`liabru/matter-js`). Push to `fork`.
- The min build fails on Node 22+ without
  `NODE_OPTIONS=--openssl-legacy-provider` (webpack 4 / terser vs OpenSSL 3).
  Only affects `matter.min.js`; the consumer loads the non-min `matter.js`.
- `ncu` and Dependabot misread the `-perfN` suffix as a prerelease.
- The consumer can develop against this repo's SOURCE with `MATTER_LOCAL=1`, in
  which case `Matter.version` reports `*` (the DefinePlugin never ran). That is
  deliberate: it makes "am I on the local clone" detectable, and the consumer's
  CI asserts it is not.

## Decision record

The full per-era history (what landed, what was measured, and what was evaluated
and REJECTED with numbers) lives in the consumer's repo, because that is where
the profiling harness and the product context are:

- `docs/matter-js.md` - every era `perf2` through `perf16`, and the rejected list
  per era. **Read the rejected lists before proposing an optimisation**; this
  fork is sixteen eras deep and most obvious ideas have been tried and measured.
- `docs/performance.md` - the numbered investigation record.
