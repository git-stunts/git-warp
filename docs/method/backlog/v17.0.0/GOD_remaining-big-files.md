# Slay remaining big files (835–808 LOC)

## StreamingBitmapIndexBuilder (835 LOC)

Builds complete bitmap indexes from scratch (vs IncrementalIndexUpdater
which patches existing ones). Split: build phase vs serialize phase.

- **Build** (~400 LOC): walks materialized state, constructs bitmaps
  for nodes, edges, properties
- **Serialize** (~300 LOC): converts built bitmaps to shard format,
  writes to index store
- **Shared** (~135 LOC): shard key computation, bitmap utilities

Split into 2 files:
- `BitmapIndexBuild.ts` (~400 LOC) — walk state, construct bitmaps
- `BitmapIndexSerialize.ts` (~300 LOC) — convert to shard format, write

## AuditVerifierService (824 LOC)

Verifies audit receipt chains for trust evaluation. Split: verification
logic vs chain walking.

- **Verification** (~400 LOC): signature verification, receipt
  validation, trust assessment per patch
- **Chain walking** (~300 LOC): traverses writer patch chains,
  collects receipts, builds assessment summary
- **Types** (~125 LOC): assessment result shapes

2 files: `AuditVerifier.ts` (verification) + `AuditChainWalker.ts`
(chain traversal).

## SSTS amendments

- **Assessment results:** `TrustAssessment` class with behavior
  (`isValid()`, `trustLevel()`, `violations()`). Not a plain record —
  consumers need to act on assessments, not switch on fields.
- **Diff results:** `StateDiff` stays a record (no behavior — it's
  pure data consumed by comparison). Node/edge diff entries are
  records too. Only promote to class if consumers need methods.

## VisibleStateComparisonV5 (808 LOC)

Compares two materialized states for divergence analysis. Used by
ComparisonController. Split: node comparison vs edge comparison vs
property comparison vs aggregation.

- **Node diff** (~200 LOC): added/removed nodes
- **Edge diff** (~200 LOC): added/removed edges
- **Property diff** (~250 LOC): changed properties, target filtering
- **Aggregation** (~160 LOC): combines diffs into comparison result

3 files would be clean but might be over-decomposition for ~200 LOC
each. Try 2: `NodeEdgeDiff.ts` + `PropertyDiff.ts` + orchestrator.
Split into 2 files:
- `NodeEdgeDiff.ts` (~400 LOC) — node/edge added/removed + aggregation
- `PropertyDiff.ts` (~250 LOC) — property changes + target filtering
