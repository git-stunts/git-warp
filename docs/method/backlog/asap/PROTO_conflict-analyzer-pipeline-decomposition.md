# PROTO: ConflictAnalyzerService pipeline decomposition

## Legend

PROTO — protocol/domain structural improvement

## Problem

`ConflictAnalyzerService.js` is the largest file in the repo at ~2582
lines. It currently mixes at least five distinct jobs in one module:

- request normalization and filter parsing
- frontier/strand context resolution
- op record and target identity construction
- candidate collection and conflict classification
- trace assembly, note generation, filtering, and snapshot hashing

This violates the Systems Style doctrine in
`docs/SYSTEMS_STYLE_JAVASCRIPT.md`:

- P1: domain concepts with invariants should have runtime-backed forms
- P3: behavior belongs on the type that owns it
- module scope is the first privacy boundary, not the whole service file

The current shape is a long helper-function corridor around one thin
service class. That makes the file hard to test in layers, hard to
review, and too easy to accidentally couple unrelated phases.

## Proposal

Split the analyzer into an explicit pipeline:

- `ConflictAnalysisRequest` or `parseConflictAnalyzeOptions()`:
  boundary parsing and normalized filter construction
- `ConflictFrameLoader`:
  frontier/strand resolution and patch-frame loading
- `ConflictRecordBuilder`:
  receipt-to-record conversion, target identity, effect digests
- `ConflictCandidateCollector`:
  supersession/redundancy/eventual-override candidate generation
- `ConflictTraceAssembler`:
  grouping, note generation, filtering, and snapshot hashing

Keep `ConflictAnalyzerService` as the facade/orchestrator that wires
those collaborators together.

Also promote the load-bearing plain-object concepts to runtime-backed
forms where they actually carry invariants or behavior:

- normalized analysis request
- conflict target
- conflict resolution
- conflict trace

## Sequencing

Do **not** mix this refactor into the current coverage push.

Recommended order:

1. Finish coverage on the existing analyzer behavior.
2. Lock behavior with tests.
3. Extract one pipeline phase at a time behind the current public API.

## Impact

- Smaller, phase-local tests
- Cleaner ownership of conflict-analysis steps
- Less shape-soup in the analyzer core
- Lower risk when changing one phase of the pipeline

## Related

- `docs/method/backlog/bad-code/CC_conflict-analyzer-god-object.md`
- `docs/method/backlog/bad-code/PROTO_conflict-analyzer-dead-branches.md`

