---
cycle: 0153
task_id: PERF_recursive_tree_path_benchmark
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
release_home: v18.0.0
backlog:
  - docs/method/backlog/PERF_recursive-tree-path-benchmark.md
---

# Recursive Tree Path Benchmark

## Pull

The v17.0.1 release fix proved that recursive tree OID reads should use
one `git ls-tree -rz` call. The next useful performance proof is a
repeatable fixture that mixes depth, width, and awkward but valid path
names.

## Hill

Recursive tree OID reading has a benchmark or regression fixture that
proves single-command behavior and path integrity for deep, wide, and
prototype-like path names.

## Playback Questions

- Does the reader still issue one recursive tree command for a large
  fixture?
- Are nested paths preserved exactly?
- Are `__proto__` and `constructor` paths returned as data?
- Does the fixture fail if recursive one-level fanout comes back?

## Design

Build a deterministic fixture with:

- a deep path chain;
- a wide sibling set;
- prototype-like path segments;
- enough entries to make process fanout visible.

The test should count command invocations at the adapter seam and assert
the returned path/OID map. If promoted to a benchmark, record the
baseline command count and wall-clock envelope without making noisy
timing a unit-test gate.

## Non-Goals

- Do not require a live external repository.
- Do not make wall-clock timing the only correctness signal.
- Do not broaden the recursive reader API.

## Verification

- Targeted adapter test or benchmark fixture.
- `npm run test:local` if the fixture is a unit test.
- `npm run benchmark:local` if it becomes a benchmark.

## SSJS Scorecard

- Runtime-backed forms: green; no new domain model is required.
- Boundary validation: planned; fixture exercises adapter parsing only.
- Behavior ownership: green; recursive tree command behavior belongs to
  the Git adapter.
- Message parsing: green; command output stays parser-owned.
- Ambient time or entropy: green for deterministic tests; benchmark
  timing is advisory only.
- Fake shape trust or cast-cosplay: green; assertions inspect returned
  path/OID data.

