---
cycle: 0154
task_id: V18_evidence_posture
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 6
---

# V18 Evidence Posture

## Pull

Slice 5 admitted Wesley-generated Continuum family artifacts and documented
fixtures without letting local mirrors become contract authority. That protects
family shape authority, but it does not yet protect evidence claims.

The next risk is subtler: a git-warp value can conform to a Continuum family
shape while still being translated git-warp evidence, not native Continuum
witnesshood.

## Hill

Make evidence posture explicit in the Continuum domain model:

- generated artifacts can authorize shape;
- git-warp projections start as translated git-warp evidence;
- native Continuum evidence is impossible to claim without an explicit proof
  path;
- missing or ambiguous posture is rejected.

## Playback Questions

- Can code distinguish generated-family shape authority from evidence
  witnesshood?
- Does a descriptor loaded from Wesley or a Continuum fixture default to
  translated git-warp evidence rather than native Continuum evidence?
- Can local mirror or handwritten mirror descriptors still be rejected before
  they become family authority?
- Does any projection path fail closed when evidence posture is missing?

## Design

Add a runtime-backed evidence posture concept under `src/domain/continuum/`.
The minimum useful posture set is:

- `translated-git-warp-evidence` — git-warp-local causal history or reading
  translated into a generated Continuum family shape;
- `native-continuum-evidence` — reserved for values that have proven native
  Continuum witnesshood;
- `unproven-continuum-shape` — shape conformity without witnesshood.

The first implementation should accept only translated git-warp evidence for
git-warp projections. Native Continuum evidence should exist as a named posture
but require an explicit proof method; direct construction should be tested so it
cannot be inferred from descriptor authority alone.

## Implementation

This slice adds two domain concepts:

- `ContinuumEvidencePosture` validates the posture string and answers whether a
  value is translated git-warp evidence, native Continuum evidence, or an
  unproven Continuum shape.
- `ContinuumEvidenceClaim` couples a generated-family descriptor to an explicit
  posture and optional native witness proof.

Native Continuum evidence cannot be constructed from descriptor authority alone.
If the posture is `native-continuum-evidence`, the claim requires
`nativeWitnessProof`. If a translated projection requires git-warp evidence,
`requireTranslatedGitWarpEvidence()` rejects unproven or native claims.

The public entry point exports both concepts so future receipt-family projection
work can depend on the same posture model instead of inventing adapter-local
flags.

## Non-Goals

- Do not project receipts yet. That is slice 9.
- Do not add `warp-ttd` integration yet. That is slice 10.
- Do not invent a generic witness engine.
- Do not let artifact authority imply evidence posture.

## RED

- A generated receipt-family descriptor plus git-warp-local facts must not be
  classified as native Continuum evidence.
- A projection descriptor without evidence posture must fail.
- A local mirror descriptor remains rejected by the ingestion policy.

Observed RED:

```text
npx vitest run test/unit/domain/continuum/ContinuumEvidencePosture.test.ts --reporter=verbose
Error: Cannot find module '../../../../src/domain/continuum/ContinuumEvidenceClaim.ts'
```

## Verification

```text
npx vitest run \
  test/unit/domain/continuum/ContinuumEvidencePosture.test.ts \
  test/unit/domain/continuum/ContinuumArtifactIngestionPolicy.test.ts \
  test/unit/domain/index.exports.test.ts
Test Files  3 passed (3)
Tests       67 passed (67)

npm run typecheck
tsc --noEmit -p tsconfig.src.json && tsc --noEmit -p tsconfig.test.json

npm run lint
eslint .

npx markdownlint docs/BEARING.md \
  docs/design/0154-v18-evidence-posture/v18-evidence-posture.md
```

## SSJS Scorecard

- Runtime-backed forms: green; evidence posture and evidence claim are classes
  with constructor validation and frozen instances.
- Boundary validation: green; untrusted shape authority remains adapter-side,
  while posture is an explicit domain input.
- Behavior ownership: green; posture owns witnesshood classification and claim
  proof requirements.
- Message parsing: green; no behavior branches on prose.
- Ambient time or entropy: green.
- Fake shape trust or cast-cosplay: green; descriptor authority does not imply
  witnesshood, and native evidence requires an explicit proof string.

## Closeout

This closes BEARING task 6. The next slice can use
`ContinuumEvidenceClaim.requireTranslatedGitWarpEvidence()` as the guard that
keeps generated-family projection honest until native Continuum witnesshood is
proven.
