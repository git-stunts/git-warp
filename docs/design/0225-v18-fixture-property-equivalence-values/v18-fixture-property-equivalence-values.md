---
cycle: 0225
task_id: V18_fixture_property_equivalence_values
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 77
---

# V18 Fixture Property Equivalence Values

## Hill

Align v17 fixture property facts with scratch public-read migration semantics
instead of comparing descriptive manifest prose to runtime property values.

## Design

`V17GoldenGraphFixtureGenesisReading` now treats fixture property descriptions
as operator metadata and derives the equivalence value from the public property
identity. A fixture property key `owner:property` becomes
`migration-source:owner\0property`, matching the lowered scratch source key
that production-runtime replay writes into materialized state.

This retires one canonical wet-run mismatch without weakening evidence: the
comparison now checks the migration source identity used by the actual replay
path.

## Acceptance Criteria

- Legacy fixture property facts use migration-source values.
- Malformed property fixture keys fail at reading construction.
- The canonical wet-run mismatch count drops by one.
- Fixture manifest descriptions remain available as human-readable metadata.

## Test Plan

Unit tests assert the projected legacy property value, reject malformed property
keys, and assert the wet-run report now records four mismatches instead of five.
