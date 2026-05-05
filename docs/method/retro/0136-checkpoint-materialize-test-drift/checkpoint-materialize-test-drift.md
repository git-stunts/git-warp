# 0136 Checkpoint Materialize Test Drift Retro

- Date: 2026-05-05
- Cycle: `0136-checkpoint-materialize-test-drift`
- Source task: `SPEC_checkpoint-materialize-test-drift`
- Commit: this cycle closeout commit

## What Happened

The final `test:local` failures after observer pinning were not new
runtime defects. They were stale checkpoint/materialize fixtures that
still expected retired checkpoint schemas `2` and `4` to load in the
v17 runtime.

The slice kept legacy schema readers out of `src/`. Current behavior
tests now use schema `5`; intentionally retired fixtures now assert
`E_CHECKPOINT_UNSUPPORTED_SCHEMA` and rely on the migration path instead
of runtime compatibility.

## What Went Well

- The focused RED was honest: 6 files, 14 failures, and 164 passing tests.
- The GREEN stayed test-only plus release artifacts; no production code
  was needed.
- Full `npm run test:local` is green again: 437 files and 6757 tests.

## What Was Messy

- Some fixtures mixed current-state CBOR payloads with retired envelope
  metadata, which made the test intent hard to read.
- A few tests named private implementation details even when the actual
  product contract was checkpoint acceptance or rejection.
- The DAG needed this explicit node after observer pinning exposed that
  the remaining red suite was a distinct release blocker.

## SSJS Scorecard

- Runtime-backed forms for new concepts: pass; no new domain concepts.
- Boundary validation stays at boundaries: pass; retired schema rejection
  remains in existing checkpoint boundaries.
- Behavior lives on the owning type/module: pass; tests now assert
  product behavior instead of hidden compatibility.
- No message parsing for behaviorally significant branching: pass.
- No ambient time or entropy in domain code: pass; no production changes.
- No fake shape trust or cast-cosplay: pass for new edits.

## Next

Pull `HEX_sync-secret-plain-string`. That node unlocks production sync
auth defaults, rate limiting, response sanitization, quarantine
graduation, and the final release gate.
