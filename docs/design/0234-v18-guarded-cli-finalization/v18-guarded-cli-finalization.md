---
cycle: 0234
task_id: V18_guarded_cli_finalization
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 86
---

# V18 Guarded CLI Finalization

## Hill

Enable live-ref finalization from the graph-model migration CLI only when an
explicit reviewed JSON artifact matches observed command evidence.

## Design

The CLI now accepts `--finalization-request <path>`. Legacy direct
finalization flags remain refused. The request JSON is parsed at the adapter
boundary into a runtime-backed `GraphModelMigrationFinalizationRequest`.

The command layer now accepts that reviewed request as finalization evidence.
Before the finalizer can move Git refs, the command compares the reviewed
artifact against observed command evidence:

- live ref;
- expected live head;
- observed live head;
- scratch ref;
- scratch head;
- archive ref;
- confirmation token;
- equivalence summary;
- production-runtime replay conformance.

Any mismatch becomes a fatal `E_FINALIZATION_REVIEW_MISMATCH` safety result,
so archive and live ref updates do not run.

## Acceptance Criteria

- The CLI accepts `--finalization-request`.
- Legacy finalization flags remain rejected.
- The CLI uses restored-v17 public-read legacy readings and fixture-aware
  production-runtime scratch readings.
- Finalization succeeds only when the reviewed artifact matches observed
  command evidence.
- The completed report includes archive preservation evidence.

## Test Plan

CLI tests restore the canonical v17 fixture, run a preview migration to capture
the deterministic scratch head, then run a finalizing migration in an identical
restored repository with a matching finalization request. The test asserts live
ref movement, archive preservation, and a completed report.
