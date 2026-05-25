---
cycle: 0242
task_id: V18_content_property_retirement_ratchet
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 94
---

# V18 Content Property Retirement Ratchet

## Hill

Make the retired coordinate fact export boundary stay retired.

## Design

The closeout audit already compares the active raw compatibility file set
against a reviewed list. Slice 94 adds the complementary retired-boundary
ratchet: retired files are named separately and checked directly for the raw
compatibility pattern.

The first retired file is `CoordinateFactExport.ts`. It now uses transfer
operation constants and no longer owns legacy content operation spellings. The
audit therefore has two responsibilities:

- active raw-boundary files must remain explicit and documented;
- retired raw-boundary files must not regain raw compatibility spelling.

## Acceptance Criteria

- The closeout audit has a retired raw-boundary list.
- `CoordinateFactExport.ts` is listed as retired in the original closeout
  design document.
- The retired-boundary test fails if the file regains `decodePropKey`,
  `decodeEdgePropKey`, `state.prop`, or lowercase content compatibility
  spelling.

## Test Plan

Run the v18 content/property closeout audit test, Markdown lint, typecheck, and
`git diff --check`.
