---
id: PROTO_wire-format-migration-edgepropset
blocked_by: []
blocks: []
---

# Persisted Wire-Format Migration (ADR 2) — EdgePropSet

**Effort:** XL

## Problem

Promote `EdgePropSet` to persisted raw op type (schema version 4). Requires graph capability ratchet, mixed v3+v4 materialization, read-path accepting both legacy and new format, and sync emitting raw `EdgePropSet` only after graph capability cutover.

## Notes

- **Status:** DEFERRED — governed by ADR 3 readiness gates
- **Risk:** HIGH
- **Depends on:** ADR 3 Gate 1 satisfaction
- ADR 3 Gate 1 prerequisites (not yet met):
  - Historical identifier audit complete
  - Observability plan exists
  - Graph capability design approved
  - Rollout playbook exists
  - ADR 2 tripwire tests written (beyond current wire gate tests)
- Gate: Mixed-schema materialization deterministic. `WarpGraph.noCoordination.test.js` passes with v3+v4 writers. No regression in existing patch replay. Full test suite green. ADR 3 Gate 1 and Gate 2 both satisfied.
