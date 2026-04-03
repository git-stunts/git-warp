# Cycle 0004 — domain/services/ audit analysis

## Current state

83 files, 36,603 LOC, one flat directory. 54% of the codebase.

## Identified clusters

Import graph analysis reveals 10 cohesive groups plus a shared
kernel. Dependencies between groups are one-directional — no
circular dependencies were found.

### 1. controllers/ (10 files, ~5,505 LOC)

The WarpRuntime delegation targets. Each controller owns a slice of
the public API surface and delegates to internal services.

```
CheckpointController.js     424
ComparisonController.js    1198
ForkController.js           293
MaterializeController.js   1004
PatchController.js          500
ProvenanceController.js     243
QueryController.js          964
StrandController.js         182
SubscriptionController.js   247
SyncController.js           680
```

**Depends on**: reduce/, codec/, state/, index/, query/,
provenance/, sync/, strand/.

**Rationale**: These are already a cohesive group by naming
convention and role. They are the only files that reference
`this._host` (the WarpRuntime instance). Extracting them makes
the remaining services clearly "internal domain services" vs
"API controllers".

### 2. codec/ (8 files, ~993 LOC)

Message encoding/decoding for the patch wire format.

```
WarpMessageCodec.js         34   (facade)
PatchMessageCodec.js       137
CheckpointMessageCodec.js  140
AnchorMessageCodec.js       84
AuditMessageCodec.js       112
MessageCodecInternal.js    148
MessageSchemaDetector.js   180
TrailerValidation.js        74
```

**Internal deps**: Tight internal cluster. Only outbound dep is
`KeyCodec.EDGE_PROP_PREFIX` (one import).

**Rationale**: Clear single responsibility — wire format. Self-
contained. `WarpMessageCodec` is the facade that selects the
right sub-codec.

### 3. index/ (13 files, ~4,599 LOC)

Roaring bitmap index construction, reading, and maintenance.

```
BitmapIndexBuilder.js       240
BitmapIndexReader.js        604
BitmapNeighborProvider.js   247
IncrementalIndexUpdater.js  956
IndexRebuildService.js      397
IndexStalenessChecker.js    203
LogicalBitmapIndexBuilder.js 329
LogicalIndexBuildService.js  108
LogicalIndexReader.js        433
PropertyIndexBuilder.js       79
PropertyIndexReader.js       152
StreamingBitmapIndexBuilder.js 835
WarpStateIndexBuilder.js     168
```

**Outbound deps**: `KeyCodec` (decode helpers),
`StateSerializerV5` (visibility checks).

**Rationale**: Massive cluster, all about bitmap indexes. Self-
contained except for key decoding. `MaterializedViewService`
orchestrates them but lives at a higher level.

### 4. state/ (6 files, ~2,217 LOC)

State serialization, reading, diffing, and checkpoint persistence.

```
CheckpointSerializerV5.js   289
CheckpointService.js        588
StateReaderV5.js            599
StateSerializerV5.js        176
StateDiff.js                373
WarpStateV5.js               86
```

**Outbound deps**: `JoinReducer`, `KeyCodec`, `Frontier`,
`ProvenanceIndex`, codec/.

**Rationale**: All about persisting and recovering materialized
state. `CheckpointService` is the main entry point.

### 5. sync/ (6 files, ~2,895 LOC)

Multi-writer synchronization protocol.

```
SyncProtocol.js             694
SyncAuthService.js          455
SyncPayloadSchema.js        265
SyncTrustGate.js            178
HttpSyncServer.js           533
```

Note: `SyncController.js` (680 LOC) stays in controllers/.

**Outbound deps**: `WarpMessageCodec`, `JoinReducer`, `Frontier`,
`GCMetrics`.

**Rationale**: Clear boundary — network sync. Self-contained
protocol with auth, schema validation, and trust gating.

### 6. dag/ (4 files, ~1,332 LOC)

Git commit DAG traversal algorithms.

```
CommitDagTraversalService.js 166
DagPathFinding.js            705
DagTopology.js               237
DagTraversal.js              224
```

**Outbound deps**: None within services/. Fully self-contained.

**Rationale**: Pure graph algorithms over raw commit DAGs. Zero
coupling to domain state. Could nearly be its own package.

### 7. provenance/ (4 files, ~1,418 LOC)

Provenance tracking, payloads, and boundary transition records.

```
ProvenanceIndex.js          336
ProvenancePayload.js        241
BoundaryTransitionRecord.js 598
```

Note: `ProvenanceController.js` (243 LOC) stays in controllers/.

**Outbound deps**: `JoinReducer`, `StateSerializerV5`,
`WarpMessageCodec`.

**Rationale**: Paper III implementation — provenance payloads,
BTRs, causal indexing.

### 8. query/ (5 files, ~3,627 LOC)

Query engine, traversal, and observation.

```
QueryBuilder.js             852
GraphTraversal.js          1617
LogicalTraversal.js         590  (deprecated facade)
Observer.js                 576
AdjacencyNeighborProvider.js 175
```

Note: `QueryController.js` (964 LOC) stays in controllers/.

**Outbound deps**: `KeyCodec`, `StateReaderV5`.

**Rationale**: Read-path query and traversal. `GraphTraversal` is
the unified traversal engine (11 algorithms). `Observer` is the
standing-query abstraction.

### 9. strand/ (3 files, ~4,814 LOC)

Strand lifecycle, conflict analysis, and comparison.

```
StrandService.js           2049
ConflictAnalyzerService.js 2582
```

Note: `StrandController.js` (182 LOC) and
`ComparisonController.js` (1,198 LOC) stay in controllers/.

**Outbound deps**: `JoinReducer`, `KeyCodec`, `PatchBuilderV2`,
`ImmutableSnapshot`, `ProvenanceIndex`, `WarpMessageCodec`,
`StateReaderV5`, `StateSerializerV5`, `VisibleState*`,
`CoordinateFactExport`.

**Rationale**: Strand is the branch-and-compare subsystem. Both
files are god objects and already have `bad-code/` backlog items.

### 10. audit/ (2 files, ~1,323 LOC)

Trust verification and audit receipt generation.

```
AuditReceiptService.js      499
AuditVerifierService.js     824
```

**Outbound deps**: `AuditMessageCodec`.

**Rationale**: Security-boundary code. Small, self-contained,
high-trust.

### Shared kernel (remains in services/ root) (~8,880 LOC)

Files that are imported by 3+ clusters and form the shared
foundation. These stay in `services/` root (or a `kernel/`
subdirectory — see options below).

```
JoinReducer.js             1158   (imported by 8 clusters)
PatchBuilderV2.js          1103   (imported by strand/, patch controller)
KeyCodec.js                 197   (imported by 7 clusters)
OpNormalizer.js              90   (imported by 3 clusters)
Frontier.js                 126   (imported by 3 clusters)
ImmutableSnapshot.js        215   (imported by 3 clusters)
GCPolicy.js                 138   (imported by controllers)
GCMetrics.js                101   (imported by controllers, sync)
MaterializedViewService.js  414   (orchestrates index/)
EffectPipeline.js           183   (imported by controllers)
MultiplexSink.js             99   (imported by controllers)
```

Remaining miscellaneous (stay in root):

```
Worldline.js                398   (query adjacent)
TemporalQuery.js            359   (query adjacent)
TranslationCost.js          336   (query adjacent, Paper IV)
VisibleStateComparisonV5.js 808   (comparison, strand-adjacent)
VisibleStateScopeV1.js      490   (comparison, strand-adjacent)
VisibleStateTransferPlannerV5.js 692 (comparison, strand-adjacent)
CoordinateFactExport.js     252   (comparison, strand-adjacent)
HealthCheckService.js       246   (standalone)
HookInstaller.js            393   (standalone)
WormholeService.js          372   (Paper III, provenance-adjacent)
BisectService.js            152   (standalone)
GitLogParser.js             243   (standalone utility)
MigrationService.js          66   (standalone)
LegacyAnchorDetector.js      70   (standalone)
```

## Dependency direction

```
controllers/  →  strand/, query/, sync/, provenance/, state/, index/
strand/       →  reduce kernel, codec/, state/, provenance/
query/        →  reduce kernel, state/
sync/         →  codec/, reduce kernel
provenance/   →  reduce kernel, state/, codec/
state/        →  reduce kernel, codec/
index/        →  KeyCodec only
codec/        →  KeyCodec only
dag/          →  (nothing)
audit/        →  codec/
```

All arrows point downward. No cycles. Clean layering.

## Options for shared kernel

**A. Leave in services/ root.** The kernel files stay where they are.
Subdirectories hold cohesive groups. `ls services/` shows ~25 root
files + 10 subdirectories. Still better than 83 flat files.

**B. Move to services/kernel/.** Explicit. `ls services/` shows only
subdirectories + miscellaneous. But "kernel" is overloaded in this
repo (we just killed the mixin kernel).

**C. Move to services/reduce/.** Centered on `JoinReducer`, which is
the gravitational center. But some kernel files (`EffectPipeline`,
`MultiplexSink`) aren't about reduction.

Recommendation: **Option A** for now. Revisit after the per-group
moves stabilize the landscape.

## Proposed final structure

```text
src/domain/services/
  controllers/              10 files   5,505 LOC
  codec/                     8 files     993 LOC
  index/                    13 files   4,599 LOC
  state/                     6 files   2,217 LOC
  sync/                      5 files   2,895 LOC
  dag/                       4 files   1,332 LOC
  provenance/                4 files   1,418 LOC
  query/                     5 files   3,627 LOC
  strand/                    2 files   4,814 LOC
  audit/                     2 files   1,323 LOC
  (root — shared kernel)   ~24 files   7,880 LOC
                           ─────────  ──────────
                            83 files  36,603 LOC
```
