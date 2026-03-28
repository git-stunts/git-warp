# OG-005 — Benchmark Detached Coordinate And Strand Reads

Status: DONE

Promoted to: `docs/design/detached-read-benchmarks.md`

Closed by:

- `test/unit/benchmark/detachedReadBenchmark.fixture.test.js`
- `test/benchmark/DetachedReadBoundary.benchmark.js`
- `docs/retrospectives/2026-03-27-detached-read-benchmarks.md`

## Problem

Detached read handles are safer, but their cost is not yet measured.

## Why This Matters

Before adding new caching layers or optimizing around detached reads, we should
know what the coordinate and strand read boundary actually costs.

## Promotion Trigger

Promoted when the detached-read performance slice began.
