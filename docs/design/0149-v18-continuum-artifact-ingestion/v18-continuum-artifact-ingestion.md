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
- `ContinuumArtifactJsonFileAdapter` as the infrastructure-edge JSON loader
  for Continuum fixture JSON and Wesley realization manifest JSON;
- `test/fixtures/continuum/receipt-family-generated-artifact.json` as the first
  receipt-family Continuum fixture;
- `test/fixtures/continuum/receipt-family-wesley-realization-manifest.json` as
  the first Wesley realization manifest fixture.

The guard accepts only:

- `generated-artifact`
- `generated-fixture`

It rejects:

- `local-mirror`
- `handwritten-mirror`
- JSON that attempts to self-attest an `authority` field

## Boundary Law

JSON parsing stays in `src/infrastructure/adapters/`. Domain code receives
validated constructor fields and runtime-backed objects.

Authority is not read from untrusted artifact JSON. The adapter receives
authority through explicit load context, validates the artifact shape, requires
the context authority that belongs to that shape, and then lets the domain
policy decide whether that context can become descriptor authority.

Wesley realization manifests must contain at least one generated leg. When
Wesley records an `artifactCount`, it must match the generated file inventory
for that leg.

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
  src/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.ts \
  test/unit/domain/continuum/ContinuumArtifactIngestionPolicy.test.ts \
  test/unit/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.test.ts \
  test/unit/domain/index.exports.test.ts
npm run typecheck:src
npm run typecheck:test
npm run typecheck:surface
npx vitest run \
  test/unit/domain/continuum/ContinuumArtifactIngestionPolicy.test.ts \
  test/unit/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.test.ts \
  test/unit/domain/index.exports.test.ts \
  test/unit/domain/errors/index.test.ts
```

Observed focused Continuum-suite test result:

```text
Test Files  2 passed (2)
Tests       25 passed (25)
```

Observed focused export/error sweep:

```text
Test Files  4 passed (4)
Tests       75 passed (75)
```

Coverage gate:

```text
npm run test:coverage:ci
Test Files  447 passed (447)
Tests       6824 passed (6824)
All files   92.12% lines
```

Targeted coverage diagnostics are not recorded as green slice gates because the
repository global threshold applies to subset runs. The authoritative coverage
gate for this slice is the full-suite CI coverage command above.

## SSJS Scorecard

- Runtime-backed forms: green; new Continuum concepts are classes with
  constructor validation and frozen instances.
- Boundary validation: green; untrusted JSON is parsed only in the
  infrastructure adapter.
- Behavior ownership: green; the descriptor owns descriptor invariants and the
  ingestion policy owns authority decisions.
- Message parsing: green; no behavior branches parse free-form messages.
- Ambient time or entropy: green; no ambient time or entropy introduced.
- Fake shape trust or cast-cosplay: green; generated-family authority is carried
  by load context, self-attested JSON authority is rejected, each accepted JSON
  shape is bound to its context authority, and Wesley generated inventory is
  checked before descriptor construction.

## Closeout

This closes BEARING task 5 and gives later receipt-family projection work a
safe generated-artifact entry point without making local mirrors or
self-attested descriptors contract authority.
