# Archived draft

Superseded by `/Users/james/git/git-stunts/git-warp/docs/plans/conflict-analyzer-v1.md`.

# git-warp Conflict Provenance Plan, Tightened

## Summary

Implement conflict and counterfactual analysis in **git-warp**, not XYPH.

V1 is a **read-only analyzer** that computes conflict traces from patch history, receipts, and reducer behavior without writing any durable artifacts. It will expose explicit **analysis coordinates**, deterministic conflict identity, canonical target identity, full replay/debug anchors, and a narrow mechanical notion of “alternative” that git-warp can honestly know.

Durable conflict/counterfactual storage is **deferred** until the read model stabilizes. When that later happens, it will be an **internal immutable artifact graph** attached to provenance anchors, not ordinary user graph nodes, not Git notes, and not a mutation of core provenance/BTR identity.

## Public Interface and Definitions

### 1. Add a dedicated analyzer entrypoint

Add a new public method:

```ts
declare function analyzeConflicts(options?: {
  at?: {
    lamportCeiling?: number | null;
  };
  entityId?: string;
  kind?: ConflictKind | ConflictKind[];
  writerId?: string;
  target?: ConflictTargetSelector;
  evidence?: 'summary' | 'standard' | 'full';
  scanBudget?: {
    maxPatches?: number;
  };
}): Promise<ConflictAnalysis>;
```

V1 analysis coordinate is explicit and honest:
- `at.lamportCeiling` is a **Lamport ceiling tick**
- the frontier analyzed is the graph’s **current frontier**
- the response must return the **resolved coordinate** explicitly:
  - `frontier`
  - `lamportCeiling`
  - `frontierDigest`

Do **not** accept an arbitrary frontier input in v1. Return the resolved frontier in every response so the result is reproducible and auditable.

### 2. ConflictAnalysis response

`ConflictAnalysis` must return:
- `resolvedCoordinate`
- `truncated` plus budget information when `scanBudget` was hit
- `conflicts: ConflictTrace[]`

Each `ConflictTrace` must include:
- `conflictId`
  Deterministic from: resolved coordinate, canonical target digest, conflict kind, reducer identity, winner anchor, sorted loser anchors
- `kind`
  V1 values only:
  - `supersession`
  - `eventual_override`
  - `redundancy`
- `target`
  Canonical target identity, not prose:
  - `targetKind`
  - stable target fields such as `entityId`, `propertyKey`, `edgeKey`, `fieldPath` when relevant
  - `targetDigest`
- `winner`
  Full replay/debug anchor
- `losers`
  Full replay/debug anchors
- `resolution`
  Not just a label:
  - `reducerId`
  - `basis`
  - `winnerMode`
    Values: `immediate` or `eventual`
  - comparator/tie-break inputs when available
- `valueDigests`
  Normalized winner/loser effect digests
- `causalRelation`
  When computable:
  - `concurrent`
  - `ordered`
  - `replay_equivalent`
  - `reducer_collapsed`
- `structurallyDistinctAlternative`
  Mechanical substrate judgment only
- `replayableFromAnchors`
  Whether v1 has enough anchor evidence to reconstruct a target-local alternative
- `whyFingerprint`
  Compact deterministic fingerprint for grouping/debug/cache use
- `evidence`
  Expanded according to `evidence` level

Each replay/debug anchor must include:
- `patchSha`
- `writerId`
- `lamport`
- `opIndex`
- stable receipt reference when available:
  - `receiptPatchSha`
  - `receiptLamport`
  - `receiptOpIndex`

## Conflict Semantics

### 1. Competition predicate for `eventual_override`

Do **not** classify every later overwrite as conflict.

A write only becomes `eventual_override` when all of these are true:
- winner and loser touch the same canonical target
- their normalized effect digests differ
- loser was effective at some earlier point but is not effective at the resolved coordinate
- there is a real competition condition, defined in v1 as:
  - winner and loser come from different writers, or
  - their causal relation is concurrent or reducer-collapsed
- same-writer sequential edits by themselves are **normal evolution**, not conflict

This keeps the debugger honest and avoids treating ordinary revision as pathology.

### 2. Narrow the alternative judgment

Do not use domain-semantic language in git-warp.

Replace the old vague `counterfactualEligible` idea with two mechanical substrate fields:
- `structurallyDistinctAlternative`
- `replayableFromAnchors`

These must be computed only from substrate facts:
- canonical target identity
- normalized effect digests
- reducer outcome
- anchor sufficiency

XYPH can later decide what these alternatives *mean*.

### 3. Reconstruct immediate and eventual competition

The analyzer must combine:
- receipt-level facts
  - `superseded`
  - `redundant`
- reconstructed effective-state competition
  - earlier writes that lost by the resolved coordinate under the competition predicate

That keeps v1 factual without pretending receipts alone already solve the problem.

## Accepted, Deferred, Rejected

### Accepted in v1

- **Dedicated internal analyzer service**
  Public API is `WarpGraph.analyzeConflicts(...)`, but implementation should live in a dedicated analyzer.
- **Optional filters**
  Support `kind`, `target`, and `writerId`.
- **Evidence expansion levels**
  `summary`, `standard`, `full`.
- **Value/effect digests**
  Include normalized digests for winner/loser comparison.
- **Causal relation classification**
  Return when computable.
- **Why fingerprints**
  Include `whyFingerprint` from target digest, effect digests, reducer identity, and tie-break basis.

### Deferred until after v1 proves itself

- `analyzeConflict(conflictId)` drilldown
- `explainConflict(anchor)` debugger helper
- counterfactual preview
  Example: “show the alternative target-local effective state if loser X had won”
- conflict lenses
  Example: structural-only, reducer-visible, override-focused, redundancy-only
- heatmaps and chronic-conflict indexes
- durable immutable artifact graph
  Artifact kinds later:
  - `conflict artifact`
  - `counterfactual option`
  - `resolution artifact`
  - optional `analysis snapshot artifact`

These are good ideas, but the read semantics, identity model, and anchor sufficiency must stabilize first.

### Rejected for v1

- Git notes as the primary durable model
- ordinary user graph nodes for conflict storage
- mutating core provenance or BTR identity
- overloading `materialize(..., conflicts: true)` in tranche 1
- calling same-writer sequential revision a conflict by default
- any substrate claim about high-level business/domain meaning

## Test Plan

- Two writers produce competing property writes at the same target and yield one deterministic `supersession` trace with correct winner, losers, target digest, and resolution basis.
- A loser that was once effective but later displaced by a competing writer yields `eventual_override` only when the competition predicate is satisfied.
- Same-writer sequential edits on the same target do **not** produce `eventual_override`.
- Redundant replays yield `redundancy`, `structurallyDistinctAlternative = false`, and `replayableFromAnchors` based on anchor sufficiency.
- Conflict IDs are deterministic across repeated runs on the same resolved coordinate.
- `resolvedCoordinate` always includes current frontier plus explicit Lamport ceiling.
- Target filtering and writer filtering are deterministic and do not change conflict identity semantics.
- Evidence levels change payload richness only, not classification.
- `scanBudget` truncation is explicit and auditable.
- Existing provenance APIs, BTR behavior, and materialize behavior remain unchanged.
- The analyzer performs no durable writes in v1.

## Assumptions and Defaults

- git-warp owns substrate conflict facts; XYPH will only consume them.
- V1 coordinate is “current frontier + optional Lamport ceiling,” returned explicitly in every response.
- Full trace retention is the default.
- Conflict identity is deterministic and reproducible.
- Anchors must be sufficient for replay/debug, not merely descriptive.
- Durable artifact storage is intentionally postponed until the analyzer proves its classifications and identity model.
