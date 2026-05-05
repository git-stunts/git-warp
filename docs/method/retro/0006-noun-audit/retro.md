# Cycle 0006 Retro — Noun Audit

**Status:** COMPLETE

## Hill

Every public-facing noun in the codebase is mapped against the AION
Foundations and Observer Geometry papers, misalignments are classified,
and actionable backlog items exist for each one worth fixing.

## What ground was taken

25 codebase nouns mapped across 5 categories (core state, patch/tick,
provenance, observer/worldline, infrastructure). Each noun classified
GREEN / YELLOW / RED against the paper vocabulary.

### Findings

- **3 RED** (wrong concept or misnamed):
  - `Worldline` class — not a worldline, it is a projection handle
  - `WorldlineSource` type — not a source, it is a worldline selector
  - `Observer` class — implements only projection (pi), not the full
    observer concept S = (O, B, M, K, E)
- **7 YELLOW** (correct concept, incomplete): VersionVector, PatchV2,
  TickReceipt, JoinReducer, ProvenanceIndex, Aperture,
  StrandService/StrandController
- **15 GREEN** (correct): WarpState, GraphNode, ORSet, LWWRegister,
  Dot, EventId, OpNormalizer, ProvenancePayload,
  BoundaryTransitionRecord, ConflictAnalyzerService, GitGraphAdapter,
  CborCodec, CheckpointService, ObserverConfig, ComparisonController

### Recommendations delivered

- **R1 (soon):** Worldline class -> ReadHandle or ProjectionHandle
  (breaking change, deferred to major version bump)
- **R2 (next cycle):** WorldlineSource -> proper class hierarchy
  (delivered in Cycle 0007 as Viewpoint)
- **R3 (growth):** Observer -> expand into full observer (additive,
  non-breaking)

## Playback

### Agent

1. *Can we state, for every noun, which paper concept it implements?*
   Yes. 25 nouns, each mapped with paper citations.

2. *Is there a clear recommendation for what to rename and what to
   leave alone?*
   Yes. 3 rename/rework, 7 acceptable gaps, 15 leave alone.

### Human

Deferred to review. Witness file captures agent playback answers.

## What was learned

- The codebase's theory vocabulary is substantially correct at the
  infrastructure and core-state layers. The misalignments cluster in
  the observer/worldline layer, which was built before the Observer
  Geometry paper was finalized.
- Naming is cheaper to fix than semantics. The RED items are not just
  naming problems — they are concept mismatches. Worldline needs a
  real history/state-sequence, not just a projection handle.
- The writer-as-optic mapping (omega = pi, phi, rho, omega, sigma)
  clarified that Observer implements only pi. The full optic is the
  Writer, not the Observer.

## What comes next

- R2 was delivered in Cycle 0007 (Viewpoint design).
- R1 (Worldline rename) remains deferred — tracked in backlog.
- R3 (Observer expansion) remains deferred — tracked in backlog.
