# Source-backed reference

This page is generated from source code. Do not edit the inventories by hand;
run `node scripts/check-source-backed-reference.ts --write` after changing a
public API export, CLI command, package entrypoint, or public error class.

## Package entrypoints

| Surface | Name | Target | Source |
| --- | --- | --- | --- |
| npm bin | `warp-graph` | `./dist/bin/warp-graph.js` | `package.json#L23` |
| npm bin | `git-warp` | `./bin/git-warp` | `package.json#L24` |
| npm export | `.` | `types=./dist/index.d.ts; import=./dist/index.js; default=./dist/index.js` | `package.json#L27` |
| npm export | `./browser` | `types=./dist/browser.d.ts; import=./dist/browser.js; default=./dist/browser.js` | `package.json#L32` |
| npm export | `./storage` | `types=./dist/storage.d.ts; import=./dist/storage.js; default=./dist/storage.js` | `package.json#L37` |
| npm export | `./advanced` | `types=./dist/advanced.d.ts; import=./dist/advanced.js; default=./dist/advanced.js` | `package.json#L42` |
| npm export | `./diagnostics` | `types=./dist/diagnostics.d.ts; import=./dist/diagnostics.js; default=./dist/diagnostics.js` | `package.json#L47` |
| npm export | `./legacy` | `types=./dist/legacy.d.ts; import=./dist/legacy.js; default=./dist/legacy.js` | `package.json#L52` |
| npm export | `./sha1sync` | `types=./dist/src/infrastructure/adapters/sha1sync.d.ts; import=./dist/src/infrastructure/adapters/sha1sync.js; default=./dist/src/infrastructure/adapters/sha1sync.js` | `package.json#L57` |
| npm export | `./package.json` | `./package.json` | `package.json#L62` |
| JSR export | `.` | `./index.ts` | `jsr.json#L8` |
| JSR export | `./browser` | `./browser.ts` | `jsr.json#L9` |
| JSR export | `./storage` | `./storage.ts` | `jsr.json#L10` |
| JSR export | `./advanced` | `./advanced.ts` | `jsr.json#L11` |
| JSR export | `./diagnostics` | `./diagnostics.ts` | `jsr.json#L12` |
| JSR export | `./legacy` | `./legacy.ts` | `jsr.json#L13` |
| JSR export | `./sha1sync` | `./src/infrastructure/adapters/sha1sync.ts` | `jsr.json#L14` |

## Root API export surface

First-use product API: `openWarp`, `intent`, `reading`, timelines, and receipts.

### Value exports

Source: `index.ts`. Count: 13.

```text
DraftTimeline @ index.ts#L19
intent @ index.ts#L22
Intent @ index.ts#L23
JoinReceipt @ index.ts#L24
JoinResult @ index.ts#L25
openWarp @ index.ts#L18
reading @ index.ts#L26
Reading @ index.ts#L27
ReadingResult @ index.ts#L28
ReadReceipt @ index.ts#L29
Timeline @ index.ts#L21
Warp @ index.ts#L20
WriteReceipt @ index.ts#L30
```

### Type exports

Source: `index.ts`. Count: 26.

```text
EdgeIntentFields @ index.ts#L33
EdgePropertyIntentFields @ index.ts#L34
IntentBuilders @ index.ts#L40
IntentDescriptor @ index.ts#L35
IntentKind @ index.ts#L36
JoinMode @ index.ts#L41
JoinOptions @ index.ts#L43
JoinPolicy @ index.ts#L43
JoinReceiptOptions @ index.ts#L41
JoinReceiptOutcome @ index.ts#L41
JoinResultOptions @ index.ts#L42
NodeIntentFields @ index.ts#L37
NodeReadingFields @ index.ts#L45
OpenWarpOptions @ index.ts#L31
PropertyIntentFields @ index.ts#L38
PropertyReadingFields @ index.ts#L46
ReadingBuilders @ index.ts#L50
ReadingDescriptor @ index.ts#L47
ReadingKind @ index.ts#L48
ReadingResultOptions @ index.ts#L51
ReadingValue @ index.ts#L51
ReadReceiptOptions @ index.ts#L52
ReadReceiptOutcome @ index.ts#L52
ReceiptOutcome @ index.ts#L53
WarpStorage @ index.ts#L31
WriteReceiptOptions @ index.ts#L53
```

## Storage export surface

Supported persistence and crypto adapters for first-use applications.

### Value exports

Source: `storage.ts`. Count: 5.

```text
CasContentEncryptionPolicy @ storage.ts#L13
GitStorageAdapter @ storage.ts#L9
MemoryStorageAdapter @ storage.ts#L10
NodeCryptoAdapter @ storage.ts#L11
WebCryptoAdapter @ storage.ts#L12
```

### Type exports

Source: `storage.ts`. Count: 6.

```text
CasContentEncryptionDiagnostics @ storage.ts#L15
CasContentEncryptionScheme @ storage.ts#L16
CasResolvedVaultKeyOptions @ storage.ts#L17
CollectableStream @ storage.ts#L20
GitError @ storage.ts#L21
GitPlumbing @ storage.ts#L22
```

## Advanced export surface

Formal WARP and Continuum concepts for expert use; not first-use root API.

### Export modules

| Module | Kind | Source |
| --- | --- | --- |
| `./src/continuumExports.ts` | export * | `advanced.ts#L42` |

### Value exports

Source: `advanced.ts`. Count: 31.

```text
BoundedSupportRule @ advanced.ts#L10
CausalIndexPlan @ advanced.ts#L11
composeWormholes @ advanced.ts#L12
createWormhole @ advanced.ts#L13
deserializeWormhole @ advanced.ts#L14
LiveSelector @ advanced.ts#L15
Observer @ advanced.ts#L16
ObserverAccumulation @ advanced.ts#L17
ObserverBasis @ advanced.ts#L18
ObserverEmission @ advanced.ts#L19
ObserverPlan @ advanced.ts#L20
ObserverReadingEnvelope @ advanced.ts#L21
openAperture @ advanced.ts#L22
Optic @ advanced.ts#L23
OpticAperturePosture @ advanced.ts#L24
OpticBasisPosture @ advanced.ts#L25
OpticCoordinatePosture @ advanced.ts#L26
OpticSupportRule @ advanced.ts#L27
ProjectionHandle @ advanced.ts#L28
RejectedZKWormhole @ advanced.ts#L29
replayWormhole @ advanced.ts#L30
serializeWormhole @ advanced.ts#L31
StrandSelector @ advanced.ts#L32
SupportFragmentPlan @ advanced.ts#L33
VerifiedZKWormhole @ advanced.ts#L34
verifyZKWormhole @ advanced.ts#L35
WarpWorldlineCoordinate @ advanced.ts#L36
WarpWorldlineOpticBasis @ advanced.ts#L37
WorldlineSelector @ advanced.ts#L38
ZKWormholeEdge @ advanced.ts#L39
ZKWormholeProofVerifierPort @ advanced.ts#L40
```

### Type exports

Source: `advanced.ts`. Count: 25.

```text
Aperture @ advanced.ts#L44
ApertureOpeningVerificationResult @ advanced.ts#L45
BoundedSupportDirection @ advanced.ts#L46
BoundedSupportKind @ advanced.ts#L47
BoundedSupportRuleFields @ advanced.ts#L48
BoundedSupportSurface @ advanced.ts#L49
CausalIndexFamily @ advanced.ts#L50
CausalIndexPlanFields @ advanced.ts#L51
CausalIndexPlanPosture @ advanced.ts#L52
ObserverConfig @ advanced.ts#L53
ObserverPlanFields @ advanced.ts#L54
ObserverReadingEnvelopeBudget @ advanced.ts#L55
ObserverReadingEnvelopeFields @ advanced.ts#L56
OpticAperturePostureValue @ advanced.ts#L57
OpticBasisPostureValue @ advanced.ts#L58
OpticContextValue @ advanced.ts#L59
OpticCoordinatePostureValue @ advanced.ts#L60
OpticFields @ advanced.ts#L61
OpticPostureFields @ advanced.ts#L62
OpticSupportRuleValue @ advanced.ts#L63
SupportFragmentMaterializationPosture @ advanced.ts#L64
SupportFragmentPlanFields @ advanced.ts#L65
WarpWorldlineCoordinateFrontierEntry @ advanced.ts#L66
ZKWormholeEdgeFields @ advanced.ts#L67
ZKWormholeVerificationResult @ advanced.ts#L68
```

## Diagnostics export surface

Operator, inspection, comparison, and replay tools.

### Value exports

Source: `diagnostics.ts`. Count: 18.

```text
BisectService @ diagnostics.ts#L9
CommitDagTraversalService @ diagnostics.ts#L10
ContentAttachmentProjection @ diagnostics.ts#L11
exportCoordinateComparisonFact @ diagnostics.ts#L12
exportCoordinateTransferPlanFact @ diagnostics.ts#L13
GraphDiff @ diagnostics.ts#L14
GraphOpAlgebraProjection @ diagnostics.ts#L15
nodeIdInVisibleStateScope @ diagnostics.ts#L41
normalizeVisibleStateScope @ diagnostics.ts#L40
QueryBuilder @ diagnostics.ts#L16
scopeMaterializedState @ diagnostics.ts#L42
TtdMergeBranch @ diagnostics.ts#L17
TtdMergeFootprint @ diagnostics.ts#L18
TtdMergeInspection @ diagnostics.ts#L19
TtdMergeInspector @ diagnostics.ts#L20
TtdMergeLoweringWitness @ diagnostics.ts#L21
TtdMergeObstructionWitness @ diagnostics.ts#L22
TtdMergePolicyRequirement @ diagnostics.ts#L23
```

### Type exports

Source: `diagnostics.ts`. Count: 14.

```text
GraphDiffFields @ diagnostics.ts#L26
GraphDiffOptions @ diagnostics.ts#L27
TtdMergeBranchFields @ diagnostics.ts#L28
TtdMergeFootprintFields @ diagnostics.ts#L29
TtdMergeInspectionDomain @ diagnostics.ts#L30
TtdMergeInspectionFields @ diagnostics.ts#L31
TtdMergeLoweringSurface @ diagnostics.ts#L32
TtdMergeLoweringWitnessFields @ diagnostics.ts#L33
TtdMergeObjectBranchInput @ diagnostics.ts#L34
TtdMergeObjectInspectionInput @ diagnostics.ts#L35
TtdMergeObstructionWitnessFields @ diagnostics.ts#L36
TtdMergePolicyRequirementFields @ diagnostics.ts#L37
VisibleStateScope @ diagnostics.ts#L45
VisibleStateScopePrefixFilter @ diagnostics.ts#L46
```

## Legacy export surface

Deprecated compatibility-only imports for migration paydown.

### Export modules

| Module | Kind | Source |
| --- | --- | --- |
| `./src/domain/graph/publicGraphSubstrate.ts` | export * | `legacy.ts#L220` |
| `./src/domain/memory/index.ts` | export * | `legacy.ts#L221` |
| `./src/continuumExports.ts` | export * | `legacy.ts#L222` |

### Value exports

Source: `legacy.ts`. Count: 161.

```text
AlfredOperationPolicyAdapter @ legacy.ts#L227
ApertureOpeningProof @ legacy.ts#L406
AuditError @ legacy.ts#L231
BisectService @ legacy.ts#L272
BitmapIndexBuilder @ legacy.ts#L266
BitmapIndexReader @ legacy.ts#L267
BlobStoragePort @ legacy.ts#L286
BoundedSupportRule @ legacy.ts#L329
BTR @ legacy.ts#L395
buildWarpStateIndex @ legacy.ts#L362
BunHttpAdapter @ legacy.ts#L296
canonicalEmissionJson @ legacy.ts#L415
canonicalObservationJson @ legacy.ts#L417
CasContentEncryptionPolicy @ legacy.ts#L225
CausalIndexPlan @ legacy.ts#L330
checkAborted @ legacy.ts#L303
ChunkEffectSink @ legacy.ts#L426
CommitDagTraversalService @ legacy.ts#L271
compareVisibleState @ legacy.ts#L366
composeWormholes @ legacy.ts#L402
computeStateHash @ legacy.ts#L363
computeTranslationCost @ legacy.ts#L343
ConsoleEffectSink @ legacy.ts#L425
ConsoleLogger @ legacy.ts#L279
CONTENT_PROPERTY_KEY @ legacy.ts#L358
ContentAttachmentProjection @ legacy.ts#L428
ContinuumArtifactAuthorityError @ legacy.ts#L232
CoordinateSelector @ legacy.ts#L327
createBlobValue @ legacy.ts#L352
createBTR @ legacy.ts#L396
createDeliveryObservation @ legacy.ts#L416
createEdgeAdd @ legacy.ts#L348
createEdgeTombstone @ legacy.ts#L349
createEffectEmission @ legacy.ts#L414
createExternalizationPolicy @ legacy.ts#L418
createInlineValue @ legacy.ts#L351
createNodeAdd @ legacy.ts#L346
createNodeTombstone @ legacy.ts#L347
createPropSet @ legacy.ts#L350
createStateReader @ legacy.ts#L365
createTickReceipt @ legacy.ts#L386
createTimeoutSignal @ legacy.ts#L304
createV18BoundedMemoryCapabilityReport @ legacy.ts#L383
createWormhole @ legacy.ts#L401
CryptoPort @ legacy.ts#L288
decodeEdgePropKey @ legacy.ts#L356
DELIVERY_MODES @ legacy.ts#L419
DELIVERY_OUTCOMES @ legacy.ts#L420
DenoHttpAdapter @ legacy.ts#L297
deserializeWormhole @ legacy.ts#L405
EffectPipeline @ legacy.ts#L413
EffectSinkPort @ legacy.ts#L411
encodeEdgePropKey @ legacy.ts#L355
EncryptionError @ legacy.ts#L233
exportCoordinateComparisonFact @ legacy.ts#L381
exportCoordinateTransferPlanFact @ legacy.ts#L382
ForkError @ legacy.ts#L234
GitGraphAdapter @ legacy.ts#L262
GraphDiff @ legacy.ts#L367
GraphNode @ legacy.ts#L264
GraphOpAlgebraProjection @ legacy.ts#L265
GraphPersistencePort @ legacy.ts#L273
HealthCheckService @ legacy.ts#L269
HealthStatus @ legacy.ts#L270
HttpServerPort @ legacy.ts#L289
ImmutableBytes @ legacy.ts#L375
IndexError @ legacy.ts#L235
IndexRebuildService @ legacy.ts#L268
IndexStoragePort @ legacy.ts#L274
InMemoryBlobStorageAdapter @ legacy.ts#L287
InMemoryGraphAdapter @ legacy.ts#L263
INSPECT_LENS @ legacy.ts#L423
isEdgePropKey @ legacy.ts#L357
LIVE_LENS @ legacy.ts#L421
LiveSelector @ legacy.ts#L326
LoggerPort @ legacy.ts#L277
LogLevel @ legacy.ts#L280
MemoryBudgetError @ legacy.ts#L236
MultiplexSink @ legacy.ts#L412
NodeCryptoAdapter @ legacy.ts#L292
NoOpEffectSink @ legacy.ts#L424
NoOpLogger @ legacy.ts#L278
NoopOperationPolicyAdapter @ legacy.ts#L228
normalizeVisibleStateScope @ legacy.ts#L379
Observer @ legacy.ts#L333
ObserverAccumulation @ legacy.ts#L334
ObserverBasis @ legacy.ts#L335
ObserverEmission @ legacy.ts#L336
ObserverPlan @ legacy.ts#L337
ObserverReadingEnvelope @ legacy.ts#L338
openAperture @ legacy.ts#L408
openWarpGraph @ legacy.ts#L308
openWarpWorldline @ legacy.ts#L311
OperationAbortedError @ legacy.ts#L237
OperationPolicyExhaustedError @ legacy.ts#L229
OperationPolicyPort @ legacy.ts#L223
OperationPolicyTimeoutError @ legacy.ts#L229
Optic @ legacy.ts#L315
OpticAperturePosture @ legacy.ts#L316
OpticBasisPosture @ legacy.ts#L317
OpticCoordinatePosture @ legacy.ts#L318
OpticSupportRule @ legacy.ts#L319
PatchBuilder @ legacy.ts#L339
PatchError @ legacy.ts#L238
PatchSession @ legacy.ts#L340
ProjectionHandle @ legacy.ts#L320
projectState @ legacy.ts#L364
ProvenanceIndex @ legacy.ts#L342
ProvenancePayload @ legacy.ts#L392
QueryBuilder @ legacy.ts#L332
QueryError @ legacy.ts#L239
RejectedApertureOpening @ legacy.ts#L406
RejectedZKWormhole @ legacy.ts#L406
REPLAY_LENS @ legacy.ts#L422
replayBTR @ legacy.ts#L398
replayWormhole @ legacy.ts#L403
SchemaUnsupportedError @ legacy.ts#L240
scopeMaterializedState @ legacy.ts#L380
SeekCachePort @ legacy.ts#L283
serializeWormhole @ legacy.ts#L404
ShardCorruptionError @ legacy.ts#L241
ShardLoadError @ legacy.ts#L242
ShardValidationError @ legacy.ts#L243
SnapshotORSet @ legacy.ts#L376
SnapshotVersionVector @ legacy.ts#L377
SnapshotWarpState @ legacy.ts#L378
StorageError @ legacy.ts#L244
StrandError @ legacy.ts#L245
StrandSelector @ legacy.ts#L328
SupportFragmentPlan @ legacy.ts#L331
SyncError @ legacy.ts#L246
SyncSecret @ legacy.ts#L427
TICK_RECEIPT_OP_TYPES @ legacy.ts#L388
TICK_RECEIPT_RESULT_TYPES @ legacy.ts#L389
tickReceiptCanonicalJson @ legacy.ts#L387
TraversalError @ legacy.ts#L247
TtdMergeBranch @ legacy.ts#L368
TtdMergeFootprint @ legacy.ts#L369
TtdMergeInspection @ legacy.ts#L370
TtdMergeInspector @ legacy.ts#L371
TtdMergeLoweringWitness @ legacy.ts#L372
TtdMergeObstructionWitness @ legacy.ts#L373
TtdMergePolicyRequirement @ legacy.ts#L374
VerifiedApertureOpening @ legacy.ts#L407
VerifiedZKWormhole @ legacy.ts#L407
verifyBTR @ legacy.ts#L397
verifyZKWormhole @ legacy.ts#L408
WarpApp @ legacy.ts#L323
WarpCore @ legacy.ts#L324
WarpOpenOptions @ legacy.ts#L307
WarpStateIndexBuilder @ legacy.ts#L361
WarpWorldline @ legacy.ts#L312
WarpWorldlineCoordinate @ legacy.ts#L313
WarpWorldlineOpticBasis @ legacy.ts#L314
WebCryptoAdapter @ legacy.ts#L293
WorldlineSelector @ legacy.ts#L325
WormholeError @ legacy.ts#L248
Writer @ legacy.ts#L341
WriterError @ legacy.ts#L300
ZKWormholeEdge @ legacy.ts#L407
ZKWormholeProofVerifierPort @ legacy.ts#L408
```

### Type exports

Source: `legacy.ts`. Count: 51.

```text
Aperture @ legacy.ts#L432
ApertureOpeningProofFields @ legacy.ts#L461
ApertureOpeningVerificationResult @ legacy.ts#L461
BoundedSupportDirection @ legacy.ts#L447
BoundedSupportKind @ legacy.ts#L448
BoundedSupportRuleFields @ legacy.ts#L449
BoundedSupportSurface @ legacy.ts#L450
CasContentEncryptionDiagnostics @ legacy.ts#L226
CasContentEncryptionScheme @ legacy.ts#L226
CasResolvedVaultKeyOptions @ legacy.ts#L226
CasVaultResolutionWitness @ legacy.ts#L226
CausalIndexFamily @ legacy.ts#L451
CausalIndexPlanFields @ legacy.ts#L452
CausalIndexPlanPosture @ legacy.ts#L453
GraphDiffFields @ legacy.ts#L457
GraphDiffOptions @ legacy.ts#L456
ObserverConfig @ legacy.ts#L433
ObserverPlanFields @ legacy.ts#L458
ObserverReadingEnvelopeBudget @ legacy.ts#L459
ObserverReadingEnvelopeFields @ legacy.ts#L460
OperationPolicyExecuteOptions @ legacy.ts#L224
OperationRetryDecision @ legacy.ts#L224
OperationRetryObserver @ legacy.ts#L224
OpticAperturePostureValue @ legacy.ts#L440
OpticBasisPostureValue @ legacy.ts#L441
OpticContextValue @ legacy.ts#L442
OpticCoordinatePostureValue @ legacy.ts#L443
OpticFields @ legacy.ts#L444
OpticPostureFields @ legacy.ts#L445
OpticSupportRuleValue @ legacy.ts#L446
PropValue @ legacy.ts#L434
SnapshotPropValue @ legacy.ts#L435
SupportFragmentMaterializationPosture @ legacy.ts#L454
SupportFragmentPlanFields @ legacy.ts#L455
SyncRateLimitConfig @ legacy.ts#L436
TtdMergeBranchFields @ legacy.ts#L464
TtdMergeFootprintFields @ legacy.ts#L465
TtdMergeInspectionDomain @ legacy.ts#L466
TtdMergeInspectionFields @ legacy.ts#L467
TtdMergeLoweringSurface @ legacy.ts#L468
TtdMergeLoweringWitnessFields @ legacy.ts#L469
TtdMergeObjectBranchInput @ legacy.ts#L470
TtdMergeObjectInspectionInput @ legacy.ts#L471
TtdMergeObstructionWitnessFields @ legacy.ts#L472
TtdMergePolicyRequirementFields @ legacy.ts#L473
WarpKernelPort @ legacy.ts#L437
WarpWorldlineCoordinateFrontierEntry @ legacy.ts#L463
WarpWorldlineOpenOptions @ legacy.ts#L438
WarpWorldlinePatchBuild @ legacy.ts#L439
ZKWormholeEdgeFields @ legacy.ts#L462
ZKWormholeVerificationResult @ legacy.ts#L462
```

## CLI command registry

| Command | Handler | Source |
| --- | --- | --- |
| `info` | `handleInfo` | `bin/cli/commands/registry.ts#L42` |
| `check` | `handleCheck` | `bin/cli/commands/registry.ts#L43` |
| `doctor` | `handleDoctor` | `bin/cli/commands/registry.ts#L44` |
| `materialize` | `handleMaterialize` | `bin/cli/commands/registry.ts#L45` |
| `seek` | `handleSeek` | `bin/cli/commands/registry.ts#L46` |
| `query` | `handleQuery` | `bin/cli/commands/registry.ts#L47` |
| `path` | `handlePath` | `bin/cli/commands/registry.ts#L48` |
| `optic` | `handleOptic` | `bin/cli/commands/registry.ts#L49` |
| `history` | `handleHistory` | `bin/cli/commands/registry.ts#L50` |
| `debug` | `handleDebug` | `bin/cli/commands/registry.ts#L51` |
| `strand` | `handleStrand` | `bin/cli/commands/registry.ts#L52` |
| `verify-audit` | `handleVerifyAudit` | `bin/cli/commands/registry.ts#L53` |
| `verify-index` | `handleVerifyIndex` | `bin/cli/commands/registry.ts#L54` |
| `reindex` | `handleReindex` | `bin/cli/commands/registry.ts#L55` |
| `trust` | `handleTrust` | `bin/cli/commands/registry.ts#L56` |
| `patch` | `handlePatch` | `bin/cli/commands/registry.ts#L57` |
| `tree` | `handleTree` | `bin/cli/commands/registry.ts#L58` |
| `bisect` | `handleBisect` | `bin/cli/commands/registry.ts#L59` |
| `install-hooks` | `handleInstallHooks` | `bin/cli/commands/registry.ts#L60` |
| `mcp` | `handleMcp` | `bin/cli/commands/registry.ts#L61` |
| `sync` | `handleSync` | `bin/cli/commands/registry.ts#L62` |
| `serve` | `handleServe` | `bin/cli/commands/registry.ts#L63` |
| `fork` | `handleFork` | `bin/cli/commands/registry.ts#L64` |
| `checkpoint` | `handleCheckpoint` | `bin/cli/commands/registry.ts#L65` |
| `gc` | `handleGc` | `bin/cli/commands/registry.ts#L66` |
| `watch` | `handleWatch` | `bin/cli/commands/registry.ts#L67` |

Structured CLI errors for `--json` and `--ndjson` use the payload shape
`{ error: { code, message, cause? } }` from the CLI entry point.

Source: `bin/warp-graph.ts#L129`.

## Public error classes

| Class | Module | Source |
| --- | --- | --- |
| `AuditError` | `./AuditError.ts` | `src/domain/errors/index.ts#L3` |
| `ContinuumArtifactAuthorityError` | `./ContinuumArtifactAuthorityError.ts` | `src/domain/errors/index.ts#L4` |
| `EncryptionError` | `./EncryptionError.ts` | `src/domain/errors/index.ts#L5` |
| `ForkError` | `./ForkError.ts` | `src/domain/errors/index.ts#L6` |
| `IndexError` | `./IndexError.ts` | `src/domain/errors/index.ts#L7` |
| `MemoryBudgetError` | `./MemoryBudgetError.ts` | `src/domain/errors/index.ts#L8` |
| `OperationAbortedError` | `./OperationAbortedError.ts` | `src/domain/errors/index.ts#L9` |
| `OperationPolicyExhaustedError` | `./OperationPolicyExhaustedError.ts` | `src/domain/errors/index.ts#L10` |
| `OperationPolicyTimeoutError` | `./OperationPolicyTimeoutError.ts` | `src/domain/errors/index.ts#L11` |
| `PatchError` | `./PatchError.ts` | `src/domain/errors/index.ts#L12` |
| `QueryError` | `./QueryError.ts` | `src/domain/errors/index.ts#L13` |
| `SyncError` | `./SyncError.ts` | `src/domain/errors/index.ts#L14` |
| `ShardCorruptionError` | `./ShardCorruptionError.ts` | `src/domain/errors/index.ts#L15` |
| `ShardIdOverflowError` | `./ShardIdOverflowError.ts` | `src/domain/errors/index.ts#L16` |
| `ShardLoadError` | `./ShardLoadError.ts` | `src/domain/errors/index.ts#L17` |
| `ShardValidationError` | `./ShardValidationError.ts` | `src/domain/errors/index.ts#L18` |
| `StorageError` | `./StorageError.ts` | `src/domain/errors/index.ts#L19` |
| `SchemaUnsupportedError` | `./SchemaUnsupportedError.ts` | `src/domain/errors/index.ts#L20` |
| `TraversalError` | `./TraversalError.ts` | `src/domain/errors/index.ts#L21` |
| `StrandError` | `./StrandError.ts` | `src/domain/errors/index.ts#L22` |
| `WormholeError` | `./WormholeError.ts` | `src/domain/errors/index.ts#L23` |
