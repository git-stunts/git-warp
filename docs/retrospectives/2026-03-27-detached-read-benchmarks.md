# Retrospective: Detached Read Benchmarks

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** Detached read performance baseline
**Backlog:** `OG-005`
**Design:** `docs/design/detached-read-benchmarks.md`

## What Landed

- Added `test/benchmark/detachedReadBenchmark.fixture.js` as the shared seeded
  fixture and benchmark plan module.
- Added `test/unit/benchmark/detachedReadBenchmark.fixture.test.js` as the
  deterministic spec for scenario coverage and fixture semantics.
- Added `test/benchmark/DetachedReadBoundary.benchmark.js` as the detached-read
  benchmark suite.
- Added `npm run benchmark:detached-reads` for targeted reruns of that suite.

## Benchmark Snapshot

Environment at measurement time:

- Node.js `v25.8.1`
- Apple M1 Pro
- `darwin arm64`
- `global.gc` unavailable

Observed medians:

- `250` patches: live `13.94ms`, coordinate `6.95ms`, strand `7.24ms`
- `1000` patches: live `146.20ms`, coordinate `25.48ms`, strand `27.74ms`
- `2500` patches: live `872.43ms`, coordinate `62.81ms`, strand `65.70ms`

At these scales, detached coordinate and strand reads were faster than the
warm live `materialize()` baseline on this fixture.

## Design Alignment Audit

- `aligned` — the slice measures all three intended read surfaces: live,
  coordinate, and strand.
- `aligned` — the unit spec proves the fixture semantics before the benchmark is
  used.
- `aligned` — live and coordinate now resolve the same frontier, which isolates
  detached entry-point behavior more honestly than the first draft.
- `aligned` — the strand fixture diverges through overlay patches rather
  than through an unrelated shorter replay distance.
- `aligned` — the benchmark remains informational and does not enforce hard CI
  latency gates.
- `aligned` — the slice landed with a dedicated rerun script instead of asking
  contributors to remember a long ad hoc command.

## Drift

There was no semantic drift from the final design.

There was one important mid-slice correction:

- the first fixture draft pinned the coordinate source to an earlier frontier
- that made detached reads look faster partly because they replayed less history
- the fixture was corrected so live and coordinate resolve the same frontier

## Why The Adjustment Happened

- benchmark design gap discovered during execution: the first measured output
  surfaced a confounding variable instead of isolating boundary cost

## Resolution

- corrected in the fixture and unit spec before closing the slice
- accepted benchmark result after rerunning on the fixed fixture
- follow-on optimization work should explain the surprising live-vs-detached
  delta before assuming detached reads are the expensive path

## Verification

- `npx vitest run test/unit/benchmark/detachedReadBenchmark.fixture.test.js`
- `npm run benchmark:detached-reads`
- `npm run typecheck`
