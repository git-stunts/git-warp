---
cycle: 0228
task_id: V18_fixture_lifecycle_and_writer_coverage
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 80
---

# V18 Fixture Lifecycle And Writer Coverage

## Hill

Represent the canonical fixture's removed-node and multi-writer evidence in the
migrated wet-run reading without changing production public-read behavior.

## Design

The wet-run harness now wraps the production scratch public-read provider with
fixture-specific coverage facts. Runtime public reads still only report the
materialized visible graph state. The wrapper adds the two fixture-only
compatibility facts that are not materialized as live public state:

- `node:removed` as a removed node lifecycle fact.
- `writers:alice+bob` as multi-writer coverage evidence.

The wrapper also attaches boundary evidence to migrated public-read facts from
the scratch operation commits. Node, edge, property, and content facts inherit
their scratch commit boundary. Fixture-only lifecycle and writer coverage facts
inherit deterministic manifest boundary evidence, keeping the promotion gate
from passing facts without provenance.

## Acceptance Criteria

- The wet-run migrated reading contains eight facts, matching the legacy
  reading's eight facts.
- Removed-node fixture coverage is represented as a node visibility fact with
  value `removed`.
- Multi-writer fixture coverage is represented as a property coverage fact.
- Migrated facts carry boundary evidence and the gate has no missing-boundary
  fatal errors.
- Production scratch public-read behavior remains unchanged outside the v17
  fixture wet-run harness.

## Test Plan

The wet-run harness test restores the canonical fixture, writes scratch history,
builds legacy and migrated readings, and asserts eight legacy facts, eight
migrated facts, zero mismatches, and no boundary fatal errors.
