---
cycle: 0216
task_id: V18_production_runtime_scratch_replay_provider
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 68
---

# V18 Production-Runtime Scratch Replay Provider

## Hill

Implement adapter-level proof that scratch migration operations can be replayed
through the normal git-warp graph runtime and mapped into finalization
conformance evidence.

## Design

The provider reads scratch migration operation records from the source
repository, verifies the scratch ref still points at the expected head, opens an
isolated normal git-warp runtime, applies the scratch operations through the
runtime patch surface, materializes the runtime product, and returns runtime
replay evidence.

The provider maps replay evidence into the existing finalization conformance
result type so command finalization can later switch from operation-history
readback to production-runtime replay without changing the safety gate.

## Acceptance Criteria

- Passing replay reports the production-runtime witness and operation count.
- Stale scratch heads fail before replay.
- Malformed operation targets fail closed with structured fatal notices.
- Source live refs are not updated.

## Test Plan

Unit tests write scratch history in a temporary Git repository, replay it
through an isolated runtime repository, assert passing runtime replay, assert
finalization-conformance mapping, and assert closed failures for scratch-head
drift and invalid targets.
