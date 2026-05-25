---
cycle: 0215
task_id: V18_runtime_scratch_replay_nouns
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 67
---

# V18 Runtime Scratch Replay Nouns

## Hill

Add runtime-backed request and result values for production-runtime replay of
scratch migration output.

## Design

The request names the graph id, runtime writer id, scratch ref, and expected
scratch head. The result records pass/fail status, witness text, replayed
operation count, and fatal migration notices.

These nouns do not read Git and do not open runtime state. They are the pure
evidence boundary that the provider in slice 68 will fill.

## Acceptance Criteria

- Constructors validate runtime request and result envelopes.
- Passing replay results cannot carry fatal errors.
- Failing replay results must carry fatal errors.
- `allowsFinalization()` is true only for passed replay results.

## Test Plan

Unit coverage exercises happy path, failure path, malformed envelopes, invalid
scratch refs, invalid counts, and mismatched status/fatal-error combinations.
