---
cycle: 0204
task_id: V18_legacy_fixture_reading_construction
status: Completed
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 56
promotes_backlog:
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Legacy Fixture Reading Construction

## Hill

Construct a `GenesisEquivalenceReading` from the restored v17 golden fixture
manifest instead of relying only on hand-authored compact fixture readings.

## Chosen Boundary

`V17GoldenGraphFixtureGenesisReading` is a pure migration-domain builder. It
projects manifest-visible facts into equivalence facts and assigns
deterministic boundary evidence from the manifest writer chains.

## Closeout

Slice 56 added the builder and test coverage over
`fixtures/v17/graph-model-golden/manifest.json`. The reading is still
manifest-declared evidence, not a full replay-derived read model.

## Verification

```text
npx vitest run test/unit/domain/migrations/V17GoldenGraphFixtureGenesisReading.test.ts --reporter=verbose
```
