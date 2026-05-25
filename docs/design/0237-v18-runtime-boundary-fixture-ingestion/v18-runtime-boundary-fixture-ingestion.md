---
cycle: 0237
task_id: V18_runtime_boundary_fixture_ingestion
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 89
---

# V18 Runtime-Boundary Fixture Ingestion

## Hill

Admit a generated Continuum runtime-boundary fixture as executable v18 evidence.

## Design

The test fixture
`test/fixtures/continuum/runtime-boundary-family-generated-artifact.json`
models the contract family closest to graph-model migration output:

- reading envelopes;
- witnessed suffixes;
- admission outcomes.

The existing Continuum artifact JSON adapter now loads the fixture under a
runtime-boundary context with generated-fixture authority. The descriptor is
tagged for both `continuum-fixture` and `warp-ttd` targets so later conformance
and consumer-smoke slices can reuse the same admitted evidence.

## Acceptance Criteria

- The runtime-boundary generated fixture is checked into the fixture directory.
- The artifact adapter loads it with `runtime-boundary-family`.
- The descriptor has generated authority.
- The descriptor includes both `continuum-fixture` and `warp-ttd` targets.

## Test Plan

Run the Continuum artifact JSON file adapter test. It loads the new fixture and
asserts family id, schema path, witness scope, and targets.
