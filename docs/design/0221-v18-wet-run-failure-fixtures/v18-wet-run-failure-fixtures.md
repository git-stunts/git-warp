---
cycle: 0221
task_id: V18_wet_run_failure_fixtures
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 73
---

# V18 Wet-Run Failure Fixtures

## Hill

Prove the wet-run harness fails closed for malformed fixture facts before a
bad migration path can look like usable evidence.

## Design

The failure fixtures are temporary manifest variants paired with the canonical
v17 Git bundle. They mutate one public fact at a time while preserving the
restored ref evidence, so each failure is attributable to migration input
semantics rather than fixture restore mechanics.

Two failure classes are covered:

- property public keys that cannot be split into owner and property identity;
- edge public keys that lower into scratch targets the production runtime
  replay parser refuses to apply.

## Acceptance Criteria

- A malformed property fact fails before scratch write.
- A malformed edge fact fails during scratch public-read replay.
- The canonical bundle remains reused; failure variants only rewrite manifests.
- Failures include actionable messages naming the rejected shape.

## Test Plan

Unit tests copy the canonical bundle into temporary directories, write mutated
manifest variants, run the wet-run harness, and assert closed failures for the
bad property key and bad edge target.
