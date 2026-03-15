# Archived draft

Superseded by `/Users/james/git/git-stunts/git-warp/docs/plans/conflict-analyzer-v1.md`.

# git-warp Conflict Provenance and Counterfactual Artifact Plan

## Summary

Move conflict and counterfactual modeling down into **git-warp** as substrate capability.

Immediate implementation is a **read-only conflict analysis API** over existing patch history, provenance indexes, and tick receipts. The long-term durable shape is an **internal immutable artifact graph** for conflict and counterfactual records, linked to provenance anchors by stable references. These artifacts are **not** ordinary user graph nodes and do **not** replace core provenance structures.

XYPH will consume this substrate later; it should stop compensating for missing conflict/counterfactual semantics in its own domain model.

## Key Changes

### 1. Add a dedicated public read API in git-warp

Add a new `WarpGraph` method:

```ts
declare function analyzeConflicts(options?: {
  ceiling?: number | null;
  entityId?: string;
}): Promise<ConflictAnalysis>;
```

`ConflictAnalysis` must return:
- the resolved observation context used for analysis
- a list of conflict traces
- stable provenance anchors for each competing operation

Each conflict trace must include:
- `conflictId`
- `kind`
  Values in v1: `supersession`, `eventual_override`, `redundancy`
- `resolutionRule`
  Example: LWW property rule or other reducer rule actually applied
- `target`
  Entity/property/edge-level target descriptor
- `winner`
  Stable op anchor
- `losers`
  Stable op anchors
- `counterfactualEligible`
  `true` only when the losing write represents a semantically distinct alternative
- `evidence`
  Receipt refs and patch refs sufficient for debugger/replay use

Stable op anchors must include enough to re-find the write precisely:
- `patchSha`
- `writerId`
- `lamport`
- `opIndex`

### 2. Reconstruct both immediate and eventual conflicts

The analysis must not rely only on tick receipt outcomes.

It must combine:
- **immediate conflict evidence**
  from receipt outcomes like `superseded` and `redundant`
- **eventual override evidence**
  by scanning converged writes at the same logical target and identifying earlier `applied` writes that later lost effective state

This is the main reason the feature belongs in git-warp: the substrate already has the raw history needed to compute this correctly.

### 3. Keep conflict provenance as a companion layer

Do **not** merge conflict data into the core provenance payload or BTR identity model.

In v1:
- provenance APIs remain intact
- BTRs remain causal packages
- conflict analysis is a separate read surface referencing provenance anchors

For the follow-on durable tranche, define an **internal immutable artifact graph** with artifact kinds:
- `conflict artifact`
- `counterfactual option`
- `resolution artifact`

These artifacts attach to patch/receipt/op anchors by reference. They are internal substrate artifacts, not ordinary user graph entities.

### 4. Explicitly reject Git notes and ordinary graph-node modeling for v1

Do not use Git notes as the primary storage model for conflict history.
Do not model conflict/counterfactual artifacts as ordinary graph nodes in the main entity graph.

Reason:
- both approaches would blur substrate semantics and make conflict history harder to query, evolve, and cache cleanly

### 5. Update docs in both repos

In git-warp:
- add a canonical spec/ADR for conflict provenance and future artifact-graph storage
- document `analyzeConflicts` and the anchor model

In XYPH:
- update the worldline/counterfactual plan to state that conflict provenance is a git-warp substrate concern
- reserve XYPH for higher-level compare/collapse/governance semantics built on top of the new git-warp API

## Test Plan

- Two competing writes to the same property produce a `supersession` conflict with correct winner, loser, rule, and target.
- An earlier `applied` write later overwritten by a stronger write produces an `eventual_override` conflict even though the earlier receipt was not marked superseded.
- Semantically identical replay/rewrite produces a `redundancy` conflict with `counterfactualEligible = false`.
- `ceiling` changes the visible conflict set deterministically.
- `entityId` filtering returns only conflicts touching that entity.
- Returned anchors are sufficient to resolve back to the original patch and op.
- The API is read-only and creates no durable artifacts in tranche 1.
- Existing provenance/BTR APIs remain behaviorally unchanged.

## Assumptions and Defaults

- Retain the richest conflict trace git-warp can reconstruct by default.
- The first tranche is **read API first**.
- The first public surface is a **separate method**, not a `materialize(..., conflicts: true)` overload.
- Durable counterfactual structures will later be implemented as an **internal immutable artifact graph** attached to provenance anchors.
- Conflict/counterfactual artifacts are **not** ordinary user graph nodes.
- Git notes are **not** the primary model for durable conflict history.
