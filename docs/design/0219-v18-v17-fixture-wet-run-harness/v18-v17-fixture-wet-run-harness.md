---
cycle: 0219
task_id: V18_v17_fixture_wet_run_harness
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 71
---

# V18 V17 Fixture Wet-Run Harness

## Hill

Run the v18 graph-model migration path against a restored v17 fixture
repository without promoting scratch history to live refs.

## Design

The harness restores the canonical v17 fixture into an isolated repository,
collects real source inventory from restored writer refs, builds a dry-run
request from manifest-visible public facts, writes scratch migration history,
builds legacy and scratch readings through the new public-read builders, and
runs production-runtime replay conformance as separate evidence.

The harness intentionally leaves finalization disabled. Its current job is to
exercise the wet path and expose equivalence gaps with concrete evidence, not
to promote scratch refs.

## Acceptance Criteria

- The canonical fixture restores before any migration work begins.
- Dry-run planning and lowering pass against restored v17 refs.
- Scratch history is written in the restored repository.
- Production-runtime replay passes against the scratch result.
- Public-read equivalence gaps are explicit in the command result.

## Test Plan

Unit tests run the harness against the canonical fixture, assert restore,
planning, lowering, scratch writing, and production-runtime replay success,
assert that finalization is skipped, and assert the current public-read
equivalence gap as a tracked wet-run signal.
