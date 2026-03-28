# RFC: Detached Read Benchmarks

**Status:** IMPLEMENTED
**Date:** 2026-03-27
**Legend:** Observer Geometry
**Backlog:** `OG-005`
**Scope:** Measure the steady-state cost of detached coordinate and strand
reads against a warm live-read baseline

---

## Problem

The read-side boundary is now semantically correct:

- coordinate reads are detached
- strand reads are detached
- public snapshots are immutable
- observers and worldlines are pinned read handles

But we do not yet have a measured baseline for what the detached boundary costs
in practice.

Without that baseline, follow-on caching or optimization work risks being
theater rather than engineering.

---

## Goal

Add a reproducible benchmark slice that measures:

1. warm live `materialize()` on an already-open runtime
2. detached `materializeCoordinate(...)`
3. detached `materializeStrand(...)`

all against the same seeded history fixture.

The benchmark should be informative, not gatekeeping:

- no hard CI performance thresholds
- clear median/min/max reporting
- explicit ratio reporting against the live baseline

---

## Invariants

This slice should make the following true:

1. the benchmark fixture always seeds all three read surfaces:
   live, coordinate, and strand
2. the benchmark fixture is meaningful:
   live and coordinate resolve the same frontier through different entry points,
   while the strand diverges from that frontier through its overlay
3. benchmark scenario coverage is deterministic and explicitly enumerable
4. the benchmark suite reports detached-read cost relative to the warm live
   baseline at multiple scales
5. the benchmark remains opt-in and does not turn benchmark medians into
   pass/fail CI gates

---

## Non-Goals

This slice does not:

- add new caching layers
- set hard performance budgets in CI
- benchmark every observer/worldline entry point
- benchmark Git remotes or networked storage

---

## Red Spec

Use two executable layers:

1. a deterministic unit spec that validates the benchmark plan and the seeded
   fixture semantics
2. a benchmark suite that measures live, coordinate, and strand reads
   against the same seeded runtime

The unit spec should prove the fixture is meaningful before the benchmark is
used to guide optimization work.

That is what landed here. The slice adds a deterministic fixture spec, a
targeted detached-read benchmark suite, and a dedicated script for rerunning the
measurement locally.
