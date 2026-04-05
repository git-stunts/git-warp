# Senior Architect Audit — April 2026

**Date:** 2026-04-05
**Scope:** Full codebase (257 source files, 61K LOC)
**Branch:** `refactor/worldline-selector-hierarchy`
**Methodology:** Static import analysis, git churn, change coupling, risk
scoring (churn x LOC x fan-out), dead export detection, test coverage mapping

---

## Executive Summary

The architecture is sound — hexagonal, zero circular dependencies, clean
port/adapter separation. The debt is concentrated in two areas:

1. **Test coverage gaps** on the most complex, highest-coupling files
   (~10K LOC untested critical-path code)
2. **Coupling hotspots** where a single change ripples through 5+ files

Neither is a correctness or security risk today. Both are ticking time
bombs for future velocity.

---

## 1. Risk Hotspots

Risk = Churn (3mo) x LOC x Fan-out / 1000

| Risk | File | Churn | LOC | Fan-out |
|------|------|-------|-----|---------|
| 944 | WarpRuntime.js | 35 | 1037 | 26 |
| 920 | PatchBuilderV2.js | 76 | 1101 | 11 |
| 675 | JoinReducer.js | 53 | 1158 | 11 |
| 378 | GitGraphAdapter.js | 73 | 1036 | 5 |
| 128 | QueryController.js | 9 | 946 | 15 |
| 124 | StrandService.js | 6 | 2060 | 10 |
| 121 | MaterializeController.js | 8 | 1010 | 15 |
| 91 | MaterializedViewService.js | 23 | 496 | 8 |
| 69 | seek.js (viz) | 17 | 672 | 6 |
| 54 | ConflictAnalyzerService.js | 3 | 2582 | 7 |

**Interpretation:** WarpRuntime, PatchBuilderV2, and JoinReducer are the
top three risk files. Any change to these files is expensive and
dangerous. WarpRuntime's risk comes from coupling (26 imports);
PatchBuilderV2 from churn (76 commits); JoinReducer from the
combination of all three factors.

---

## 2. Change Coupling

Files that change together in the same commit (last 3 months):

| Times | File A | File B |
|-------|--------|--------|
| 22x | PatchBuilderV2.js | CheckpointService.js |
| 22x | BitmapIndexReader.js | StreamingBitmapIndexBuilder.js |
| 22x | WarpGraph.js | PatchBuilderV2.js |
| 20x | JoinReducer.js | PatchBuilderV2.js |
| 20x | BitmapIndexBuilder.js | BitmapIndexReader.js |
| 19x | BitmapIndexBuilder.js | StreamingBitmapIndexBuilder.js |
| 18x | PatchBuilderV2.js | SyncProtocol.js |
| 18x | BunHttpAdapter.js | DenoHttpAdapter.js |
| 18x | IndexRebuildService.js | StreamingBitmapIndexBuilder.js |
| 17x | PatchBuilderV2.js | Writer.js |
| 17x | CheckpointService.js | JoinReducer.js |
| 17x | WarpGraph.js | Writer.js |
| 17x | WarpGraph.js | CheckpointService.js |
| 17x | WarpGraph.js | JoinReducer.js |
| 16x | WarpGraph.js | GitGraphAdapter.js |

**Interpretation:** PatchBuilderV2 is the epicenter — it change-couples
with 5 different files at 17+ times each. The bitmap index trio
(Builder/Reader/Streaming) always changes together, suggesting they
share a concept that isn't extracted. BunHttpAdapter/DenoHttpAdapter
coupling is expected (same API, different runtime).

---

## 3. Coupling Metrics

### Fan-In Leaders (most imported)

| Fan-In | File |
|--------|------|
| 23 | ORSet.js |
| 14 | JoinReducer.js |
| 14 | VersionVector.js |
| 13 | RefLayout.js |
| 12 | nullLogger.js |
| 11 | defaultCodec.js |
| 9 | cancellation.js |
| 8 | StateSerializerV5.js |
| 8 | PersistenceError.js |
| 8 | IndexError.js |

### Fan-Out Leaders (most imports)

| Fan-Out | File |
|---------|------|
| 26 | WarpRuntime.js |
| 16 | QueryController.js |
| 15 | MaterializeController.js |
| 14 | SyncController.js |
| 13 | PatchBuilderV2.js |
| 12 | StreamingBitmapIndexBuilder.js |
| 11 | StrandService.js |
| 11 | CheckpointService.js |
| 11 | JoinReducer.js |
| 10 | PatchController.js |

### Instability Index

Instability = Fan-out / (Fan-in + Fan-out). High instability + high
fan-in = maximum risk.

| Fan-In | Fan-Out | Instab | File |
|--------|---------|--------|------|
| 14 | 11 | 0.44 | JoinReducer.js |
| 23 | 2 | 0.08 | ORSet.js |
| 4 | 10 | 0.71 | CheckpointService.js |
| 3 | 11 | 0.79 | PatchBuilderV2.js |
| 8 | 4 | 0.33 | StateSerializerV5.js |
| 14 | 2 | 0.12 | VersionVector.js |

**JoinReducer** is the most dangerous: moderate instability (0.44) with
the highest fan-in among non-utility files. It sits at the crossroads
of the dependency graph.

---

## 4. Test Coverage vs Criticality

### High-Risk Files with Zero Dedicated Tests

| LOC | File | Risk | Tests |
|-----|------|------|-------|
| 2582 | ConflictAnalyzerService.js | 54 | 0 files, 0 cases |
| 2060 | StrandService.js | 124 | 0 files, 0 cases |
| 1212 | ComparisonController.js | 39 | 0 files, 0 cases |
| 1010 | MaterializeController.js | 121 | 0 files, 0 cases |
| 946 | QueryController.js | 128 | 0 files, 0 cases |
| 852 | QueryBuilder.js | — | 0 files, 0 cases |
| 808 | VisibleStateComparisonV5.js | — | 0 files, 0 cases |
| 705 | DagPathFinding.js | — | 0 files, 0 cases |
| 692 | VisibleStateTransferPlannerV5.js | — | 0 files, 0 cases |
| 599 | StateReaderV5.js | — | 0 files, 0 cases |
| 590 | LogicalTraversal.js | — | 0 files, 0 cases |
| 515 | PatchController.js | — | 0 files, 0 cases |
| 431 | CheckpointController.js | — | 0 files, 0 cases |

**Total untested critical-path LOC: ~13,002**

These files are tested only indirectly through integration tests
(WarpGraph.*.test.js). If an integration test fails, diagnosing which
controller or service broke requires manual bisection.

### Well-Tested High-Risk Files

| LOC | File | Test Files | Test Cases |
|-----|------|------------|------------|
| 1158 | JoinReducer.js | 8 | 209 |
| 1101 | PatchBuilderV2.js | 6 | 178 |
| 1036 | GitGraphAdapter.js | 5 | 133 |
| 254 | Writer.js | 5 | 86 |
| 624 | ORSet.js | 2 | 58 |

---

## 5. Dead Exports

**182 potentially dead named exports** found via static analysis
(never imported in src/, test/, or bin/).

Major clusters:

| Count | Module |
|-------|--------|
| 9 | trust/schemas.js (Zod schemas) |
| 7 | BoundaryTransitionRecord.js |
| 7 | CoordinateFactExport.js |
| 6 | StrandService.js (constants) |
| 5 | SyncPayloadSchema.js |
| 5 | KeyCodec.js (constants) |
| 5 | VisibleStateScopeV1.js |
| 4 | ConflictAnalyzerService.js (constants) |
| 4 | WarpTypesV2.js (factory functions) |
| 4 | ExternalizationPolicy.js |

Some may be used via:
- `index.js` barrel re-exports (checked — some are)
- Dynamic access (`obj[name]`)
- External consumers importing the package

Manual verification needed before removal.

---

## 6. Default Singleton Imports (Hex Violations)

25 domain files import `defaultCodec`, `defaultCrypto`,
`defaultTrustCrypto`, or `defaultClock` — all of which reach into
infrastructure from the domain layer.

| Singleton | Import Count | Files |
|-----------|-------------|-------|
| defaultCodec | 14 | JoinReducer, WormholeService, Frontier, MaterializedViewService, StateSerializerV5, CheckpointSerializerV5, ProvenanceIndex, BTR, BitmapIndexBuilder, StreamingBitmapIndexBuilder, IncrementalIndexUpdater, IndexRebuildService, LogicalIndexReader, PropertyIndexReader, IndexStalenessChecker |
| defaultCrypto | 6 | WarpRuntime, seekCacheKey, TrustCanonical, StateSerializerV5, BitmapIndexBuilder, BitmapIndexReader, StreamingBitmapIndexBuilder, SyncAuthService |
| defaultTrustCrypto | 1 | AuditVerifierService |
| defaultClock | 1 | WarpRuntime |

Tracked by `NDNM_defaultcodec-to-infrastructure` (in progress on this
branch — 3 files freed so far).

---

## 7. Structural Health

### Good

- **Zero circular dependencies** in the entire import graph
- **Clean layer separation** — no domain→infrastructure imports
  detected (dynamic imports in WarpRuntime are a known, documented
  pattern)
- **Port/adapter pattern** consistently applied across 19 ports and
  30 adapters
- **Artifact classes** (IndexShard, CheckpointArtifact, PatchEntry)
  are exemplary P1 compliance
- **Stream primitives** (WarpStream, Transform, Sink) provide clean
  composition vocabulary

### Concerning

- **Controller layer** has no dedicated tests and no formal interface
  contract — controllers reach into `host._*` private fields
- **Worldline** casts itself to WarpRuntime in 3 places (Rule 0
  violations)
- **PatchBuilderV2** is the change epicenter of the codebase and
  its commit() method is 128 lines
- **GraphPersistencePort** uses Object.defineProperty composition,
  breaking instanceof on focused ports

---

## 8. Large Functions (>50 LOC)

| LOC | File | Function |
|-----|------|----------|
| 218 | WarpRuntime.js | constructor |
| 194 | SyncController.js | syncWith |
| 162 | WarpRuntime.js | open |
| 153 | MaterializeController.js | materialize |
| 139 | AuditVerifierService.js | _walkChain |
| 128 | PatchBuilderV2.js | commit |
| 125 | ForkController.js | fork |
| 116 | GraphTraversal.js | topologicalSort |
| 114 | GraphTraversal.js | transitiveReduction |
| 111 | AuditReceiptService.js | _commitInner |
| 110 | QueryBuilder.js | run |
| 105 | PatchBuilderV2.js | constructor |
| 100 | SubscriptionController.js | watch |
| 98 | IncrementalIndexUpdater.js | computeDirtyShards |
| 93 | WarpStream.js | _demuxImpl |
| 92 | MaterializeController.js | _materializeWithCoordinate |
| 91 | DagPathFinding.js | bidirectionalAStar |
| 86 | AuditVerifierService.js | evaluateTrust |
| 83 | WarpStream.js | _teeImpl |
| 82 | DagPathFinding.js | aStarSearch |
| 81 | IncrementalIndexUpdater.js | _purgeNodeEdges |

---

## Recommendations (Priority Order)

1. **Test the untested giants** — StrandService, ConflictAnalyzerService,
   MaterializeController, QueryController. These are the highest-risk
   untested code. Write tests before refactoring.

2. **Break PatchBuilderV2's coupling chain** — Extract shared types
   (patch format, op types, state projection) so PatchBuilderV2,
   JoinReducer, and CheckpointService stop changing together.

3. **Continue the defaultCodec dissolution** — 14 domain files still
   import it. Each freed file reduces hex violation surface.

4. **Audit the 182 dead exports** — Confirm with ts-prune, remove
   dead code, add a CI ratchet.

5. **Extract controller interfaces** — Controllers should not reach
   into `host._*` fields. Define capability interfaces per controller.

6. **Decompose the god objects** — StrandService (2060), ConflictAnalyzerService
   (2582), GraphTraversal (1617). But only AFTER tests exist.
