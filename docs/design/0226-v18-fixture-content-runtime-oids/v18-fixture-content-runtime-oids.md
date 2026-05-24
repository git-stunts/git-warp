---
cycle: 0226
task_id: V18_fixture_content_runtime_oids
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 78
---

# V18 Fixture Content Runtime OIDs

## Hill

Align fixture content attachment evidence with the runtime content address
emitted by scratch replay.

## Design

The restored-v17 public-read builder now normalizes legacy content attachment
facts through the same runtime blob storage route used by scratch replay. For a
fixture content key, it stores the deterministic migration-source payload in an
isolated runtime blob store with the same graph/node slug and uses the resulting
CAS tree OID as the legacy equivalence value.

The pure domain fixture projection still preserves manifest-level placeholder
evidence. The adapter-level public-read builder owns the runtime-specific OID
normalization.

## Acceptance Criteria

- Restored public-read legacy content facts use runtime content OIDs.
- Runtime content OID resolution uses isolated temporary repositories by
  default and cleans them up.
- The canonical wet-run content mismatch is removed.
- The wet-run mismatch count drops from four to three.

## Test Plan

Unit tests assert the deterministic content OID in restored public-read legacy
facts and assert the canonical wet-run report now records three mismatches.
