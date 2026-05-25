---
cycle: 0238
task_id: V18_graph_model_contract_conformance
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 90
---

# V18 Graph-Model Contract Conformance

## Hill

Prove that the v18 graph-model migration fixture is backed by an admitted
generated Continuum runtime-boundary contract descriptor.

## Design

`GitWarpGraphModelContractConformance` is a pure domain check. It accepts an
already-admitted `ContinuumArtifactDescriptor` and a
`V17GoldenGraphFixtureManifest`; it does not read files, parse JSON, or call
Continuum/Wesley tooling itself.

The check requires:

- the `runtime-boundary-family` family id;
- the `continuum.family.fixture` artifact kind;
- the `continuum-runtime-boundary-family.graphql` schema path;
- generated authority;
- both `continuum-fixture` and `warp-ttd` targets;
- v17 fixture coverage for node, edge, property, content, removal, and
  multi-writer visible fact families.

The result value records every check, exposes failed checks, and emits compact
evidence lines for release packets. Failures remain value-shaped so release
review can show exactly which generated-contract proof is missing.

## Acceptance Criteria

- Runtime-boundary generated fixtures pass conformance against the canonical
  v17 graph-model manifest.
- Receipt-family descriptors fail as graph-model runtime-boundary evidence.
- The result exposes deterministic evidence lines and failed check names.
- Domain code remains free of JSON, filesystem, and infrastructure imports.

## Test Plan

Run the graph-model contract conformance unit test. It loads fixtures through
existing infrastructure adapters, evaluates the domain conformance class, and
proves both the passing runtime-boundary case and the rejected receipt-family
case.
