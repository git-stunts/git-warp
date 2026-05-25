---
cycle: 0247
task_id: V18_residual_raw_storage_risk_decision
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-25
completed_at: 2026-05-25
release_home: v18.0.0
bearing_task: 99
---

# V18 Residual Raw Storage Risk Decision

## Hill

Decide whether the remaining raw content/property compatibility boundaries
block the public v18 tag.

## Evidence

The executable closeout audit still names 25 `src/domain` files that mention
raw compatibility content or property storage:

- legacy `_content*` compatibility key ownership;
- runtime mutation and compatibility operation execution;
- reducer, replay, serialization, snapshot, scope, and index boundaries;
- operation helper classes that still carry the legacy property-map shape.

The audit also has a retired-boundary ratchet: `CoordinateFactExport.ts` must
not regain raw content/property spelling.

## Decision

The remaining raw content/property boundaries do **not** block `v18.0.0`.

They ship as explicit residual compatibility risk because:

- v18's public promise is graph-model convergence plus migration evidence, not
  total storage-plane retirement;
- the canonical v17 fixture proves zero public-read mismatches through the
  migration wet-run path;
- production-runtime scratch replay and guarded finalization now exist for the
  canonical path;
- a broad last-minute storage retirement would be riskier than shipping the
  named compatibility boundary with an executable ratchet.

## Release Condition

The v18 public notes must say:

- legacy `_content*` and raw property-map compatibility storage still exists;
- the remaining compatibility files are audited by
  `test/unit/scripts/v18-content-property-closeout-audit.test.ts`;
- any future boundary retirement must reduce the audited file set or add a new
  explicit release note;
- end-to-end graph streaming reads and writes are not part of v18.

## Non-Goals

- Do not retire the remaining storage plane in this slice.
- Do not claim v18 has native Continuum witnesshood.
- Do not claim v18 has end-to-end graph streaming.

## Acceptance Criteria

- `RELEASE_v18-public-release-blockers.md` records the residual risk decision.
- `PROTO_content-attachment-plane-cutover.md` records that remaining storage
  dependency is accepted for v18 and remains future work.
- `BEARING` marks slice 99 complete.

## Test Plan

- Run Markdown lint for edited docs.
- Run `git diff --check`.
