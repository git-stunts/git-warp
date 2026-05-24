---
cycle: 0217
task_id: V18_v17_public_read_legacy_reading
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 69
---

# V18 V17 Public-Read Legacy Reading

## Hill

Construct the legacy side of genesis equivalence from a restored v17 fixture
repository, with restored-ref verification immediately before the reading is
used.

## Design

The builder is an adapter-level helper for wet-run migration tests. It accepts
the restored repository path and validated v17 fixture manifest, verifies each
writer ref still points at the manifest head with the expected patch count, and
then projects the manifest's operator-visible public facts into the existing
`GenesisEquivalenceReading` model.

The restored Git bundle remains the persisted evidence. The manifest remains
the public-read contract for the fixture because the compact v17 fixture patch
payloads are not a v18 runtime state format.

## Acceptance Criteria

- A restored fixture produces deterministic legacy facts for node, edge,
  property, content, removal, and multi-writer coverage.
- Ref-head drift after restore blocks reading construction.
- Patch-count drift blocks reading construction.
- Empty repository paths fail before Git commands run.

## Test Plan

Unit tests restore the canonical v17 fixture into temporary repositories,
construct the legacy reading, assert deterministic public facts and boundaries,
mutate a restored writer ref to prove drift is rejected, and validate path
guarding.
