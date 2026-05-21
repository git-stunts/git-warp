---
cycle: 0149
task_id: V18_continuum_artifact_ingestion
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 Continuum Artifact Ingestion

## Pull

The contract matrix and optic map both point at the same first implementation
pressure: `git-warp` needs a generated-family artifact seam before it can map
local facts into Continuum-family shapes.

## Hill

Add a narrow ingestion path for generated Continuum family artifact descriptors
and reject local mirrors before they can become hidden family authority.

## Implementation

This slice adds:

- `ContinuumFamilyId` for the four Continuum-owned family ids;
- `ContinuumArtifactAuthority` for generated artifacts, generated fixtures,
  local mirrors, and handwritten mirrors;
- `ContinuumArtifactDescriptor` as the runtime-backed descriptor object;
- `ContinuumArtifactIngestionPolicy` as the authority guard;
- `ContinuumArtifactJsonFileAdapter` as the infrastructure-edge JSON loader;
- `test/fixtures/continuum/receipt-family-generated-artifact.json` as the first
  generated-family fixture descriptor.

The guard accepts only:

- `generated-artifact`
- `generated-fixture`

It rejects:

- `local-mirror`
- `handwritten-mirror`

## Boundary Law

JSON parsing stays in `src/infrastructure/adapters/`. Domain code receives
validated constructor fields and runtime-backed objects.

The descriptor does not parse GraphQL, generate TypeScript, or claim family
semantics. It only records which generated-family artifact or fixture is being
admitted and whether that admission posture is allowed.

## Verification

Focused checks:

```text
npx eslint src/domain/continuum/ContinuumFamilyId.ts \
  src/domain/continuum/ContinuumArtifactAuthority.ts \
  src/domain/continuum/ContinuumArtifactDescriptor.ts \
  src/domain/continuum/ContinuumArtifactIngestionPolicy.ts \
  src/domain/errors/ContinuumArtifactAuthorityError.ts \
  src/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.ts
npm run typecheck:src
npm run typecheck:test
npm run typecheck:surface
npx vitest run \
  test/unit/domain/continuum/ContinuumArtifactIngestionPolicy.test.ts \
  test/unit/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.test.ts
```

Observed focused test result:

```text
Test Files  2 passed (2)
Tests       9 passed (9)
```

## SSJS Scorecard

- Runtime-backed forms: green; new Continuum concepts are classes with
  constructor validation and frozen instances.
- Boundary validation: green; untrusted JSON is parsed only in the
  infrastructure adapter.
- Behavior ownership: green; the descriptor owns descriptor invariants and the
  ingestion policy owns authority decisions.
- Message parsing: green; no behavior branches parse free-form messages.
- Ambient time or entropy: green; no ambient time or entropy introduced.
- Fake shape trust or cast-cosplay: green; mirror descriptors are rejected
  before ingestion.

## Closeout

This closes BEARING task 5 and gives later receipt-family projection work a
safe generated-artifact entry point.
