# git-warp Conflict Analyzer v1

**Status:** Freeze candidate accepted for v1 implementation.

Further changes must come from implementation evidence or post-v1 scope, not speculative polishing.

## Summary

Implement conflict and counterfactual analysis in **git-warp** as a **read-only substrate analyzer**.

V1 stays deliberately narrow:
- analyze against the **current graph frontier** plus an optional **Lamport ceiling**
- compute deterministic conflict traces from patch history, receipts, and reducer behavior
- return only facts the substrate can mechanically justify
- perform **zero durable writes**

This lands as a new public `WarpGraph.analyzeConflicts(...)` method backed by a dedicated analyzer service and a single canonical spec/ADR for classification, identity, digest, and truncation invariants.

## Public Contract

### API surface

Add a dedicated method on `WarpGraph`:

```ts
declare function analyzeConflicts(options?: {
  at?: {
    lamportCeiling?: number | null;
  };
  entityId?: string;
  target?: ConflictTargetSelector;
  kind?: ConflictKind | ConflictKind[];
  writerId?: string;
  evidence?: 'summary' | 'standard' | 'full';
  scanBudget?: {
    maxPatches?: number;
  };
}): Promise<ConflictAnalysis>;
```

Implementation shape:
- public entrypoint on `WarpGraph`
- dedicated internal `ConflictAnalyzerService`
- new warp method module wired through the existing `wireWarpMethods` path
- declaration updates in the public typings
- one canonical spec/ADR for analyzer invariants, not scattered comment folklore

### Analysis coordinate

V1 coordinate is explicit and constrained:
- `at.lamportCeiling` means **Lamport ceiling tick**
- analysis frontier is always the graph’s **current frontier**
- arbitrary frontier selection is **not** part of v1

`resolvedCoordinate` is **identity-bearing**, not ornamental. It must include:
- `analysisVersion`
- `frontier`
- `frontierDigest`
- `lamportCeiling`
- `scanBudgetApplied`
- `truncationPolicy`

### Response shape

`ConflictAnalysis` must include:
- `analysisVersion`
- `resolvedCoordinate`
- `analysisSnapshotHash`
- optional `diagnostics`
- `conflicts: ConflictTrace[]`

Each `ConflictTrace` must include:
- `conflictId`
- `kind`
  - `supersession`
  - `eventual_override`
  - `redundancy`
- canonical `target`
  - `targetKind`
  - stable target fields such as `entityId`, `propertyKey`, `edgeKey`, `fieldPath` when relevant
  - `targetDigest`
- `winner`
- `losers`
- `resolution`
  - `reducerId`
  - `basis`
  - `winnerMode`
  - comparator/tie-break inputs when available
- `whyFingerprint`
- optional `classificationNotes` in `evidence: 'full'`
- `evidence`

Per-loser truth moves onto loser records. Do **not** keep per-loser facts at the trace level.

`winner` must include:
- `anchor`
- `effectDigest`

Each loser must be a first-class `ConflictParticipant` and include:
- `anchor`
- `effectDigest`
- `causalRelationToWinner`
- `structurallyDistinctAlternative`
- `replayableFromAnchors`
- optional `notes` in `evidence: 'full'`

Every anchor must be replay/debug sufficient:
- `patchSha`
- `writerId`
- `lamport`
- `opIndex`
- `receiptPatchSha`, `receiptLamport`, `receiptOpIndex` when available

### Determinism and identity

- `losers` are sorted by canonical anchor string: `writerId:lamport:patchSha:opIndex`, ascending.
- `conflictId` is derived from:
  - `analysisVersion`
  - `resolvedCoordinate`
  - `kind`
  - `targetDigest`
  - `reducerId`
  - winner anchor
  - sorted loser anchors
- `analysisSnapshotHash` is derived from:
  - `analysisVersion`
  - `resolvedCoordinate`
  - normalized filter selectors except `evidence`
  - sorted returned `conflictId`s
  - sorted diagnostic codes
  - truncation state
- `analysisSnapshotHash` and `whyFingerprint` must be stable across evidence levels.

### Canonical digest semantics

Define `normalizedEffectDigest` in one canonical place as:
- a digest of the **canonical target-local reducer-visible effect** of an op
- based on canonical target identity, op type, normalized payload, and normalized tombstone/content semantics
- not the full post-join state
- not prose meaning

Do not ship a vague `normalizedEffectDigests` blob. Carry:
- `winner.effectDigest`
- `loser.effectDigest`

## Classification, Truncation, and Evidence Rules

### Conflict rules

- `supersession`: direct receipt-backed competition where a losing op is marked superseded.
- `redundancy`: receipt-backed redundancy or replay-equivalent normalized effect.
- `eventual_override`: only when all are true:
  - same canonical target
  - different normalized effect digests
  - loser was effective earlier but is not effective at the resolved coordinate
  - real competition exists

V1 competition predicate is mechanical:
- concurrent competing writes qualify
- reducer-collapsed competing writes qualify
- same-writer sequential edits are **always normal evolution**, never conflict
- do not classify every later different state as conflict

### Filter semantics

Accepted in v1:
- `kind`
- `writerId`
- `entityId`
- `target`
- `evidence`
- `scanBudget`

Rules:
- classification runs against the full resolved coordinate first
- filters affect only the **returned set**
- filters do **not** change classification logic or `conflictId`
- `entityId` and `target`, when both present, compose as an **intersection**
- `writerId` is a trace inclusion filter only

### Deterministic truncation

Budgeted scans must be deterministic.

Traversal order for analyzer scan:
- start from the candidate patch universe at the resolved coordinate
- traverse in **reverse causal order**
- reverse causal order is the reverse of git-warp’s causal replay sort:
  - Lamport descending
  - writerId descending
  - patch SHA descending

If `scanBudget.maxPatches` truncates the scan:
- return `budget_truncated`
- return a deterministic traversal manifest in diagnostics:
  - `traversalOrder`
  - `scannedPatchCount`
  - `lastScannedAnchor`
- never silently fabricate completeness

### Missing-evidence behavior

Never fabricate a classification from incomplete substrate facts.

Rules:
- if evidence required to prove `kind`, `target`, winner/loser identity, or resolution basis is missing, **omit the trace** and emit diagnostics
- if classification is proven but auxiliary fields are missing:
  - keep the trace
  - set affected loser fields conservatively
  - `replayableFromAnchors = false` when anchor evidence is insufficient
  - include machine-readable diagnostics and optional loser notes in `full` evidence mode
- `evidence: 'full'` may add notes and richer evidence, but it must **never** change classification

### Diagnostics and validation

Accept a small diagnostic/error taxonomy now.

Hard runtime validation errors:
- `invalid_coordinate`
- `unsupported_target_selector`

Soft diagnostics:
- `budget_truncated`
- `anchor_incomplete`
- `receipt_unavailable`
- `digest_unavailable`

Runtime validation must enforce:
- valid `lamportCeiling`
- valid `kind`
- valid `scanBudget`
- valid `target` selector shape

TypeScript types are not enough.

## Accepted, Deferred, Rejected

### Accepted now

- **Dedicated analyzer service**
  Reason: keeps substrate logic isolated and testable.
- **analysisVersion**
  Reason: classification rules will evolve.
- **Per-loser first-class participants**
  Reason: per-op truth must not be flattened into a trace bucket.
- **Deterministic truncation order**
  Reason: truncation must be auditable, not vibes.
- **Deterministic traversal manifest**
  Reason: cheap, high-value debugging signal for truncated runs.
- **Machine-readable, tiny `classificationNotes`**
  Reason: useful for debugger UX without narrative bloat.
- **Runtime input validation**
  Reason: public API must be safe outside TS callers.
- **Regression fixtures**
  Reason: this feature will rot without stable behavioral fixtures.

### Deferred to backlog

- **Arbitrary frontier selection**
  Reason: good future direction, wrong v1 scope.
- **Worldline-local/frontier-local conflict analysis**
  Reason: depends on later working-set substrate.
- **`analyzeConflict(conflictId)`**
  Reason: base trace identity should stabilize first.
- **`explainConflict(anchor)`**
  Reason: debugger convenience after v1.
- **`anchorCompleteness` richer enum**
  Reason: boolean plus diagnostics is enough initially.
- **`traceCountBeforeFilters`**
  Reason: observability nice-to-have, not needed for v1 truth.
- **`analyzerStats`**
  Reason: performance debugging later.
- **`analysisMode` / conflict lenses**
  Reason: avoid breaking identity semantics too early.
- **Target-local replay preview**
  Reason: prove anchor sufficiency first.
- **Per-target grouping / chronic conflict families / heatmaps**
  Reason: analytics after base facts stabilize.
- **Internal immutable artifact graph**
  Reason: storage must follow stable read semantics, not precede them.
- **Arbitrary historical/worldline coordinates beyond current frontier + Lamport ceiling**
  Reason: approved as future direction, rejected as permanent v1 shape.

### Rejected for v1

- **Git notes as primary storage**
- **Ordinary user graph nodes for conflict storage**
- **Mutating provenance/BTR identity**
- **Overloading `materialize(..., conflicts: true)`**
- **Confidence scores**
  Reason: classified vs not-classified plus diagnostics is cleaner.
- **Semantic/business-level alternative judgments**
- **Calling any later overwrite a conflict**
- **Any hidden durable writes**

## Test Plan

Build regression fixtures for:
- same-writer sequential evolution
- concurrent cross-writer competition
- redundant replay
- truncation
- missing receipts/digests

Required scenarios:
- competing writes on the same target produce deterministic `supersession`
- same-writer sequential edits produce no `eventual_override`
- concurrent or reducer-collapsed cross-writer competition can produce `eventual_override`
- redundant replay yields `redundancy` with loser-level `structurallyDistinctAlternative = false`
- loser ordering is deterministic
- `conflictId` and `analysisSnapshotHash` are deterministic
- `writerId` filtering changes inclusion only, not classification or IDs
- `entityId` + `target` intersect correctly
- `classificationNotes` are tiny, machine-readable, and evidence-only
- `budget_truncated` includes deterministic traversal manifest
- missing receipts/digests never fabricate traces
- analyzer performs zero durable writes
- provenance, BTR, and materialize behaviors remain unchanged

## Assumptions and Defaults

- git-warp owns substrate conflict facts; XYPH consumes them.
- v1 coordinate is **current frontier + optional Lamport ceiling** only.
- full trace retention is default.
- same-writer sequential edits are normal evolution in v1.
- filters are return-set filters only.
- durable artifact storage remains deferred.
- every emitted field must be mechanically justified by substrate data.

## Backlog

Track these explicitly after v1:
- arbitrary frontier/worldline-local coordinates
- `analyzeConflict(conflictId)`
- `explainConflict(anchor)`
- `anchorCompleteness`
- `traceCountBeforeFilters`
- `analyzerStats`
- `analysisMode`
- target-local replay preview
- conflict families / heatmaps / grouping
- internal immutable conflict/counterfactual artifact graph
