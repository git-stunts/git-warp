# Cycle 0012 — ConflictAnalyzer Pipeline Decomposition

**Status:** ACTIVE

**Date:** 2026-04-07

## Sponsors

- **Human:** James Ross
- **Agent:** Codex

## Operation

**OPERATION GODMODE: OFF**

This cycle exists to break up `ConflictAnalyzerService` without turning
the cycle into a roaming cleanup campaign.

## Hill

Decompose `ConflictAnalyzerService` into explicit, smaller, runtime-honest
collaborators while preserving existing behavior under coverage and CI
guardrails.

## Playback Questions

### Agent Questions

1. Is `ConflictAnalyzerService` now an orchestrator instead of a 2500+
   line helper warehouse?
2. Does each extracted collaborator own one responsibility family with
   a clear boundary?
3. Did the split reduce normalization sludge instead of merely moving it
   into more files?
4. Are all touched files at `100%` test coverage?
5. Does the manual SSJS scorecard come back all green on the touched
   files?

### Human Questions

1. Is the analyzer materially easier to reason about from file structure
   alone?
2. Does the split obey Systems-Style JavaScript instead of creating
   class-theater and cast-theater?
3. Did the cycle stay scoped to the analyzer rather than wandering into
   unrelated debt?

## Baseline

`ConflictAnalyzerService.js` is still the largest source file in the
repo at roughly `2582` LOC.

It currently mixes at least these concern families:

- request normalization and filter parsing
- frontier and strand context resolution
- frame and receipt loading
- op record and target identity construction
- candidate collection and conflict classification
- trace assembly, filtering, notes, and snapshot hashing

The file is heavily covered from cycle 0010, which is the safety harness
for this refactor.

## Hard Rules

1. One file equals one class, type, or object.
2. The SSJS scorecard must be all green on touched files before the
   slice is done.
3. Public APIs get full JSDoc in the same slice.
4. Touched code must hit `100%` test coverage.
5. No sludge. No helper graveyards, fake-shape trust, or transitional
   duplication left behind.

## Manual SSJS Scorecard

Until the repo has an automated scorecard, every slice must be judged
against this checklist and all items must be green:

- P1: new concepts with invariants or behavior have runtime-backed forms
- P2: parsing and validation live at boundaries, not smeared inward
- P3: behavior belongs on the owning type/module
- no behaviorally significant branching by parsing human-readable error
  strings
- no ambient wall-clock or ambient entropy in domain code
- no cast-cosplay or typedef cosplay
- no peer concepts packed into one file

## Planned Seams

- `ConflictAnalysisRequest` or request parser
- `ConflictFrameLoader`
- `ConflictRecordBuilder`
- `ConflictCandidateCollector`
- `ConflictTraceAssembler`

`ConflictAnalyzerService` stays as the facade that wires these together.

## Phases

### Phase 1 — Lock the behavior

- re-read current analyzer tests
- add seam-lock tests only where extraction risk is not already pinned

### Phase 2 — Extract request and frame loading

- isolate request normalization
- isolate frontier and strand context loading

### Phase 3 — Extract record and candidate building

- isolate receipt-to-record and target construction
- isolate candidate collection and classification

### Phase 4 — Extract trace assembly

- isolate grouping, notes, filtering, and snapshot hashing

### Phase 5 — Clean the facade

- reduce `ConflictAnalyzerService` to orchestration
- remove duplicate normalization and dead helper corridors

## Non-Goals

- no MaterializeController decomposition in this cycle
- no JoinReducer decomposition in this cycle
- no global `typecheck:test` cleanup campaign in this cycle
- no visualization removals in this cycle
- no opportunistic backlog burn-down outside analyzer-adjacent fallout

## Hard Gates

- `npm run lint`
- `npm run typecheck:src`
- focused analyzer-related test suites
- `npm run test:coverage`
- touched files at `100%` coverage
- manual SSJS scorecard all green

## Stop Conditions

Stop the cycle instead of pushing through if any of these become true:

- a new collaborator starts turning into another god object
- the branch begins touching multiple unrelated subsystems
- tests become the main work instead of the refactor
- the split requires fake runtime models or type-forcing to stay alive

## Journal Rule

At the end of each slice, record progress as a war-journal style report:

- what ground was taken
- what remains contested
- what the next push is

## Related

- `docs/method/backlog/bad-code/CC_conflict-analyzer-god-object.md`
- `docs/method/backlog/bad-code/PROTO_conflict-analyzer-dead-branches.md`
- `docs/SYSTEMS_STYLE_JAVASCRIPT.md`
