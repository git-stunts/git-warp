---
cycle: 0232
task_id: V18_finalization_request_json_adapters
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 84
---

# V18 Finalization Request JSON Adapters

## Hill

Add boundary parsers for operator finalization request and confirmation JSON.

## Design

`GraphModelMigrationFinalizationRequestJsonAdapter` parses two artifacts:

- A confirmation envelope containing the exact finalization confirmation token.
- A finalization request envelope containing live-ref, scratch-ref,
  archive-ref, equivalence, and runtime replay evidence.

The adapter maps JSON into existing runtime-backed finalization nouns:

- `GraphModelMigrationFinalizationConfirmation`
- `GraphModelMigrationFinalizationRequest`
- `GenesisEquivalenceGateResult`
- `GraphModelMigrationRuntimeConformanceResult`
- `GraphModelMigrationScratchRef`

The adapter accepts only successful equivalence summaries. A finalization JSON
request with a non-zero mismatch count is rejected before safety evaluation
because the artifact is intended to unlock live-ref movement, not describe a
failed dry run.

## Acceptance Criteria

- Confirmation JSON parses into a confirmation noun only when the exact token
  is present.
- Request JSON rejects unknown fields at every parsed envelope.
- Request JSON constructs a safety-evaluable finalization request.
- A passed request reaches finalization safety with no fatal errors.
- Non-zero equivalence mismatches are rejected by the JSON adapter.

## Test Plan

Unit tests cover successful confirmation parsing, successful request parsing,
finalization safety evaluation, malformed JSON, unknown root fields, invalid
runtime replay status, malformed equivalence payloads, and non-zero mismatch
counts.
