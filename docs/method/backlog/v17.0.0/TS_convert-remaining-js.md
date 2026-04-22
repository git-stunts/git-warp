---
id: TS_convert-remaining-js
blocks:
  - TS_infrastructure-adapters
  - TS_cli-viz-scripts
blocked_by: []
feature: runtime-boundaries
---

# Convert remaining 93 .js files to TypeScript

## Sludge census (across all .js files)

| Pattern | Count | Fix |
|---------|-------|-----|
| `@type` casts | 1,061 | Become real type annotations |
| `@typedef` blocks | 156 | Become real types or classes |
| `this._host.` reaches | 98 | Die with host bag kill |
| `return { ... }` bags | 316 | Audit per batch: class or record? |
| `defineProperty` | 22 | Die with WarpRuntime kill |
| `@type {Function}` | 13 | Type the actual signature |
| `@import` JSDoc | 26 | Become real imports |

## Conversion batches

Each batch is ordered by dependency (convert leaves first). Within
a batch, files can be converted in parallel. De-sludge on contact:
if a file has bag returns that should be classes, fix it during
conversion, don't defer.

### Batch 1: codec/ (8 files, ~900 LOC total)

All small. Pure boundary code — encode/decode functions.

- `WarpMessageCodec.js` (34 LOC) — re-export barrel
- `TrailerValidation.js` (74 LOC) — trailer parsing
- `AnchorMessageCodec.js` (84 LOC) — anchor encode/decode
- `AuditMessageCodec.js` (120 LOC) — audit encode/decode
- `PatchMessageCodec.js` (137 LOC) — patch encode/decode
- `CheckpointMessageCodec.js` (140 LOC) — checkpoint encode/decode
- `MessageCodecInternal.js` (164 LOC) — shared codec internals
- `MessageSchemaDetector.js` (180 LOC) — message kind detection

**Sludge to watch:** These return decoded plain objects. That's
correct — they ARE the boundary. Decoded payloads are records.
But the return types should be named (e.g., `DecodedPatchMessage`,
not `{ graph: string, writer: string, lamport: number, ... }`).

### Batch 2: trust/ (7 files, ~900 LOC total)

- `verdict.js` (42 LOC) — verdict type constants
- `TrustCanonical.js` (47 LOC) — canonical trust helpers
- `canonical.js` (68 LOC) — canonical form utilities
- `reasonCodes.js` (78 LOC) — trust reason code constants
- `schemas.js` (202 LOC) — Zod schemas for trust records
- `TrustEvaluator.js` (248 LOC) — trust evaluation engine
- `TrustStateBuilder.js` (346 LOC) — trust state assembly
- `TrustRecordService.js` (410 LOC) — trust record CRUD

**Sludge to watch:** `TrustRecordService` returns `{ ok, records }`
and `{ valid, errors }` bags. Consider: `TrustLoadResult` and
`TrustValidationResult` as named types or classes (if consumers
branch on `ok`/`valid`, those should be methods). Also 410 LOC —
close to ceiling, check after conversion.

### Batch 3: state/ (6 files, ~1,900 LOC total)

- `StateHashService.js` (48 LOC) — hash computation
- `StateSerializerV5.js` (175 LOC) — state serialization
- `CheckpointSerializerV5.js` (293 LOC) — checkpoint serde
- `StateDiff.js` (372 LOC) — diff computation
- `StateReaderV5.js` (598 LOC) — state reading
- `CheckpointService.js` (651 LOC) — checkpoint lifecycle

**Sludge to watch:** StateReaderV5 (598) and CheckpointService (651)
are near ceiling. StateReaderV5 may split into NodeReader/EdgeReader/
PropReader. CheckpointService split: create vs reconstruct (per
design doc).

### Batch 4: dag/ (4 files, ~1,150 LOC total)

- `CommitDagTraversalService.js` (170 LOC)
- `DagTraversal.js` (228 LOC)
- `DagTopology.js` (237 LOC)
- `DagPathFinding.js` (708 LOC) — near god territory

**Sludge to watch:** DagPathFinding at 708 LOC. Design doc says
split by algorithm family: shortest path, A*, bidirectional. But
GraphTraversal already subsumes these algorithms. Check if
DagPathFinding is dead code or still used independently.

### Batch 5: strand/ (14 files, ~5,500 LOC total)

- `OpRecord.js` (84 LOC)
- `strandTypes.js` (88 LOC)
- `ConflictCandidate.js` (63 LOC)
- `ConflictAnalyzerService.js` (110 LOC)
- `strandShared.js` (128 LOC)
- `StrandMaterializer.js` (215 LOC)
- `ConflictTraceAssembler.js` (267 LOC)
- `ConflictAnalysisRequest.js` (366 LOC)
- `ConflictFrameLoader.js` (448 LOC)
- `StrandIntentService.js` (456 LOC)
- `StrandPatchService.js` (484 LOC)
- `StrandDescriptorStore.js` (643 LOC)
- `ConflictCandidateCollector.js` (649 LOC)
- `StrandService.js` (992 LOC) — god, has own kill plan

**Sludge to watch:** `strandTypes.js` and `strandShared.js` are
type-only or shared-utility files — may collapse into the consuming
classes. ConflictCandidateCollector (649) is over ceiling.
StrandDescriptorStore (643) is over ceiling. Both need splits.

### Batch 6: index/ (13 files, ~5,400 LOC total)

- `PropertyIndexBuilder.js` (73 LOC)
- `LogicalIndexBuildService.js` (158 LOC)
- `PropertyIndexReader.js` (171 LOC)
- `WarpStateIndexBuilder.js` (174 LOC)
- `IndexStalenessChecker.js` (229 LOC)
- `BitmapIndexBuilder.js` (240 LOC)
- `BitmapNeighborProvider.js` (251 LOC)
- `LogicalBitmapIndexBuilder.js` (317 LOC)
- `IndexRebuildService.js` (416 LOC)
- `BitmapIndexReader.js` (604 LOC) — over ceiling
- `LogicalIndexReader.js` (603 LOC) — over ceiling
- `StreamingBitmapIndexBuilder.js` (835 LOC) — god, has own plan
- `IncrementalIndexUpdater.js` (955 LOC) — god, has own plan

**Sludge to watch:** BitmapIndexReader (604) and LogicalIndexReader
(603) both over ceiling. Design doc says: load vs query split.

### Batch 7: query/ (4 files, ~2,100 LOC total)

- `AdjacencyNeighborProvider.js` (179 LOC)
- `Observer.js` (493 LOC)
- `LogicalTraversal.js` (643 LOC) — over ceiling
- `QueryBuilder.js` (904 LOC) — god, has own plan

**Sludge to watch:** LogicalTraversal at 643 LOC is a deprecated
facade over GraphTraversal. After GraphTraversal split, check if
LogicalTraversal can shrink or die. Observer at 493 is fine.

### Batch 8: sync/ (5 files, ~1,900 LOC total)

- `SyncTrustGate.js` (178 LOC)
- `SyncPayloadSchema.js` (259 LOC)
- `SyncAuthService.js` (463 LOC)
- `HttpSyncServer.js` (533 LOC) — over ceiling
- `SyncProtocol.js` (683 LOC) — over ceiling

**Sludge to watch:** HttpSyncServer (533) barely over. SyncProtocol
(683) definitely needs a split. Both are infrastructure-adjacent —
they deal with HTTP and wire protocol. May belong in adapters, not
domain.

### Batch 9: controllers/ (9 files, ~4,500 LOC total)

Most have god kill plans. The small ones:
- `StrandController.js` (182 LOC)
- `ProvenanceController.js` (247 LOC)
- `SubscriptionController.js` (252 LOC)
- `ForkController.js` (294 LOC)

These are straight conversions. Each is a real class, under 500.

### Batch 10: flat services (~3,400 LOC total)

- `Frontier.js` (126 LOC)
- `BisectService.js` (152 LOC)
- `EffectPipeline.js` (183 LOC)
- `KeyCodec.js` (207 LOC)
- `ImmutableSnapshot.js` (220 LOC)
- `GitLogParser.js` (243 LOC)
- `HealthCheckService.js` (246 LOC)
- `CoordinateFactExport.js` (253 LOC)
- `TranslationCost.js` (339 LOC)
- `TemporalQuery.js` (358 LOC)
- `WormholeService.js` (372 LOC)
- `HookInstaller.js` (399 LOC)
- `MaterializedViewService.js` (501 LOC) — barely over
- `VisibleStateScopeV1.js` (490 LOC)

All under 500 except MaterializedViewService (501). Straight
conversions. Kill every `@type` cast, name every return type.

### Batch 11: provenance/ (3 files, ~1,100 LOC total)

- `ProvenancePayload.js` (248 LOC)
- `ProvenanceIndex.js` (344 LOC)
- `BoundaryTransitionRecord.js` (599 LOC) — over ceiling

BoundaryTransitionRecord at 599 needs a split: create/verify vs
replay/serialize (per design doc).

## Over-ceiling files requiring splits (not covered by god plans)

| File | LOC | Split strategy |
|------|-----|----------------|
| StrandDescriptorStore.js | 643 | CRUD vs normalization (see strand-service plan) |
| ConflictCandidateCollector.js | 649 | Classification vs record building |
| CheckpointService.js | 651 | Create vs reconstruct |
| SyncProtocol.js | 683 | Request/response vs state management |
| DagPathFinding.js | 708 | Check if dead code (GraphTraversal subsumes) |
| LogicalTraversal.js | 643 | May shrink/die after GraphTraversal split |
| BitmapIndexReader.js | 604 | Load vs query |
| LogicalIndexReader.js | 603 | Load vs query |
| StateReaderV5.js | 598 | Node/edge/prop readers |
| BoundaryTransitionRecord.js | 599 | Create/verify vs replay/serialize |
| HttpSyncServer.js | 533 | Barely over — may fit after JSDoc removal |

## Execution

Convert in batch order. Within each batch, convert leaves first
(files with no internal dependents). De-sludge on contact: if a
file has bags that should be classes, fix it. If it's over 500 LOC,
split it. Every commit is green.
