---
cycle: 0214
task_id: V18_production_runtime_scratch_replay_conformance
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 66
---

# V18 Production-Runtime Scratch Replay Conformance

## Hill

Define the conformance boundary that proves migrated scratch history through
the normal graph runtime instead of only proving that scratch operation commits
can be parsed.

## Current Evidence

The operation-history provider reads `refs/warp-migration-scratch/*` commits
and projects them into genesis-equivalence facts. That is useful, but it is not
the same as opening migrated graph state through the production runtime. Public
release claims need the latter.

## Design

Production-runtime scratch replay is a separate adapter-level proof:

- read the scratch ref at the expected scratch head;
- decode the scratch migration operation stream deterministically;
- replay those operations into an isolated normal git-warp runtime using the
  public graph write/read surface;
- materialize the resulting graph through the production runtime;
- emit structured pass/fail evidence that can feed the existing finalization
  safety gate.

This remains non-destructive. The provider may create a disposable runtime
repository for replay, but it must not update live `refs/warp/*` in the source
repository.

## User Story

As a migration operator, I can see proof that scratch migration output opens
through normal git-warp graph runtime behavior before I consider live-ref
promotion.

## Acceptance Criteria

- Operation-history readback remains available but is no longer the strongest
  runtime claim.
- A new replay request names the graph id, scratch ref, expected scratch head,
  and runtime writer id.
- A new replay result reports passed or failed status, witness text, replayed
  operation count, and fatal notices.
- Failures are structured values for missing scratch refs, stale scratch heads,
  unreadable scratch payloads, invalid operation targets, and runtime
  materialization failures.
- No production-runtime replay step writes source live refs.

## Test Plan

- Unit-test request/result constructor guards.
- Add provider tests for a passing node-only scratch replay.
- Add provider tests for missing scratch ref, stale scratch head, malformed
  scratch payload, and invalid edge/property targets.
- Add command or wet-run tests that prove finalization can consume the
  production-runtime conformance result later.

## Closeout

This design splits "scratch history can be parsed" from "scratch history can be
opened through git-warp's normal runtime." Slices 67 and 68 implement the
request/result nouns and provider.
