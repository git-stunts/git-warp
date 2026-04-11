# Slay remaining big files (835–808 LOC)

## StreamingBitmapIndexBuilder (835 LOC)

Builds complete bitmap indexes from scratch (vs IncrementalIndexUpdater
which patches existing ones). Split: build phase vs serialize phase.

- **Build** (~400 LOC): walks materialized state, constructs bitmaps
  for nodes, edges, properties
- **Serialize** (~300 LOC): converts built bitmaps to shard format,
  writes to index store
- **Shared** (~135 LOC): shard key computation, bitmap utilities

2 files: `BitmapIndexBuild.ts` + `BitmapIndexSerialize.ts`, or keep
as one file if it shrinks enough after TS conversion removes JSDoc.

## AuditVerifierService (824 LOC)

Verifies audit receipt chains for trust evaluation. Split: verification
logic vs chain walking.

- **Verification** (~400 LOC): signature verification, receipt
  validation, trust assessment per patch
- **Chain walking** (~300 LOC): traverses writer patch chains,
  collects receipts, builds assessment summary
- **Types** (~125 LOC): assessment result shapes

2 files: `AuditVerifier.ts` (verification) + `AuditChainWalker.ts`
(chain traversal). Or 3 if types warrant their own file.

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
Or keep as one file if TS conversion + JSDoc removal gets it under 500.
