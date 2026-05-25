---
cycle: 0241
task_id: V18_coordinate_fact_export_raw_boundary_retirement
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 93
---

# V18 Coordinate Fact Export Raw-Boundary Retirement

## Hill

Remove `CoordinateFactExport` from the raw content/property compatibility
boundary set.

## Design

`CoordinateFactExport` did not own raw content storage. It repeated transfer
operation spellings while selecting JSON-safe fact serialization for content
attach operations. The actual operation spelling belongs with transfer
operation construction, which already remains a raw compatibility boundary.

The slice adds named transfer operation constants in `transferOps` and imports
the attach-operation constants into `CoordinateFactExport`. That keeps the
exporter behavior identical while removing lowercase raw content operation
literals from the exporter.

The closeout audit now expects one fewer raw-boundary file. This does not
claim content storage migration is complete; it only retires one duplicate
owner of legacy operation spelling.

## Acceptance Criteria

- `CoordinateFactExport.ts` no longer matches the raw compatibility audit
  pattern.
- Transfer operation builders still emit the same content operation strings.
- The closeout audit's expected file set drops `CoordinateFactExport.ts`.
- The original closeout design document reflects the smaller current boundary
  set.

## Test Plan

Run the v18 content/property closeout audit test, typecheck, Markdown lint, and
`git diff --check`.
