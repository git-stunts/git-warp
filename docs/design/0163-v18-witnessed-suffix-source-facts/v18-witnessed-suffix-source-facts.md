---
cycle: 0163
task_id: V18_witnessed_suffix_source_facts
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 15
---

# V18 Witnessed Suffix Source Facts

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Represent one git-warp sync/export suffix as translated runtime-boundary source
facts without replacing the existing sync protocol or claiming generated
runtime-boundary projection readiness.

## Playback Questions

- Can git-warp name graph, source frontier, basis frontier, target frontier,
  ordered patch facts, witness reference, bundle digest, and evidence posture
  for one exported suffix?
- Does the source-fact object require the `runtime-boundary-family` inventory
  row?
- Does it reject empty suffixes so a witnessed suffix cannot silently become a
  frontier-only placeholder?
- Does it preserve translated evidence posture and authored-only
  runtime-boundary readiness?

## Accessibility / Assistive Reading Posture

No UI is introduced. Suffix source facts are explicit named fields and ordered
patch rows, so the artifact remains readable in plain text and test output.

## Localization / Directionality Posture

No locale-sensitive UI copy is introduced. Runtime labels and references remain
stable ASCII source-fact identifiers.

## Agent Inspectability / Explainability Posture

Later agents can inspect one object to answer:

- which runtime-boundary family row authorized the source-fact shape;
- what source/basis/target frontier references bound the suffix;
- which ordered patch facts form the suffix;
- whether generated runtime-boundary projection is still blocked.

## Design

Add two domain concepts:

- `GitWarpWitnessedSuffixPatchFact` for one ordered patch reference in a
  transported suffix.
- `GitWarpWitnessedSuffixSourceFacts` for the runtime-boundary family row,
  translated evidence posture, graph identity, frontier references, ordered
  patch facts, witness reference, and bundle digest.

These are source facts only. They prepare the `WitnessedSuffixShell` and
`CausalSuffixBundle` lanes named by Continuum, but they do not replace
`createSyncRequest`, `processSyncRequest`, or `applySyncResponse`.

## Non-Goals

- Do not redesign sync request/response types.
- Do not perform suffix admission.
- Do not emit a generated runtime-boundary `WitnessedSuffixShell` until Wesley
  has a profile and fixture for runtime-boundary.
- Do not claim native Continuum witnesshood.

## RED

Observed first failure:

```text
npx vitest run test/unit/domain/continuum/GitWarpWitnessedSuffixSourceFacts.test.ts --reporter=verbose
Error: Cannot find module '../../../../src/domain/continuum/GitWarpWitnessedSuffixPatchFact.ts'
```

The test failed because the suffix source-fact nouns did not exist yet.

## GREEN

Implemented the source-fact classes, public exports, changelog entry, and
BEARING task 15 closeout.

## Verification

```text
npx vitest run test/unit/domain/continuum/GitWarpWitnessedSuffixSourceFacts.test.ts \
  test/unit/domain/index.exports.test.ts --reporter=verbose
npm run typecheck
npx eslint src/domain/continuum/GitWarpWitnessedSuffixPatchFact.ts \
  src/domain/continuum/GitWarpWitnessedSuffixSourceFacts.ts \
  test/unit/domain/continuum/GitWarpWitnessedSuffixSourceFacts.test.ts \
  test/unit/domain/index.exports.test.ts
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md \
  docs/design/0163-v18-witnessed-suffix-source-facts/v18-witnessed-suffix-source-facts.md
```

## Closeout

Slice 15 creates source facts for future runtime-boundary witnessed suffix
shells while preserving the current sync protocol. Empty patch lists fail
closed, evidence must be translated git-warp evidence, and runtime-boundary
remains authored-only until Wesley adds generated profile and fixture support.

## SSJS Scorecard

- Runtime-backed forms: expected green; suffix and patch facts are classes.
- Boundary validation: expected green; raw transport packets are not parsed
  here.
- Behavior ownership: expected green; sync keeps its current protocol, while
  this slice names source facts for future runtime-boundary projection.
- Message parsing: expected green.
- Ambient time or entropy: expected green.
- Fake shape trust or cast-cosplay: expected green; authored-only inventory
  status remains visible.
