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
| npm export | `./sha1sync` | `types=./dist/src/infrastructure/adapters/sha1sync.d.ts; import=./dist/src/infrastructure/adapters/sha1sync.js; default=./dist/src/infrastructure/adapters/sha1sync.js` | `package.json#L37` |
| npm export | `./package.json` | `./package.json` | `package.json#L42` |
| JSR export | `.` | `./index.ts` | `jsr.json#L8` |
| JSR export | `./browser` | `./browser.ts` | `jsr.json#L9` |
| JSR export | `./sha1sync` | `./src/infrastructure/adapters/sha1sync.ts` | `jsr.json#L10` |

## Root API export modules

| Module | Kind | Source |
| --- | --- | --- |
| `./src/domain/graph/publicGraphSubstrate.ts` | export * | `index.ts#L231` |
| `./src/domain/memory/index.ts` | export * | `index.ts#L232` |
| `./src/continuumExports.ts` | export * | `index.ts#L233` |

## Root API value exports

Source: `index.ts`. Count: 161.

```text
AlfredOperationPolicyAdapter @ index.ts#L238
ApertureOpeningProof @ index.ts#L417
AuditError @ index.ts#L242
BisectService @ index.ts#L283
BitmapIndexBuilder @ index.ts#L277
BitmapIndexReader @ index.ts#L278
BlobStoragePort @ index.ts#L297
BoundedSupportRule @ index.ts#L340
BTR @ index.ts#L406
buildWarpStateIndex @ index.ts#L373
BunHttpAdapter @ index.ts#L307
canonicalEmissionJson @ index.ts#L426
canonicalObservationJson @ index.ts#L428
CasContentEncryptionPolicy @ index.ts#L236
CausalIndexPlan @ index.ts#L341
checkAborted @ index.ts#L314
ChunkEffectSink @ index.ts#L437
CommitDagTraversalService @ index.ts#L282
compareVisibleState @ index.ts#L377
composeWormholes @ index.ts#L413
computeStateHash @ index.ts#L374
computeTranslationCost @ index.ts#L354
ConsoleEffectSink @ index.ts#L436
ConsoleLogger @ index.ts#L290
CONTENT_PROPERTY_KEY @ index.ts#L369
ContentAttachmentProjection @ index.ts#L439
ContinuumArtifactAuthorityError @ index.ts#L243
CoordinateSelector @ index.ts#L338
createBlobValue @ index.ts#L363
createBTR @ index.ts#L407
createDeliveryObservation @ index.ts#L427
createEdgeAdd @ index.ts#L359
createEdgeTombstone @ index.ts#L360
createEffectEmission @ index.ts#L425
createExternalizationPolicy @ index.ts#L429
createInlineValue @ index.ts#L362
createNodeAdd @ index.ts#L357
createNodeTombstone @ index.ts#L358
createPropSet @ index.ts#L361
createStateReader @ index.ts#L376
createTickReceipt @ index.ts#L397
createTimeoutSignal @ index.ts#L315
createV18BoundedMemoryCapabilityReport @ index.ts#L394
createWormhole @ index.ts#L412
CryptoPort @ index.ts#L299
decodeEdgePropKey @ index.ts#L367
DELIVERY_MODES @ index.ts#L430
DELIVERY_OUTCOMES @ index.ts#L431
DenoHttpAdapter @ index.ts#L308
deserializeWormhole @ index.ts#L416
EffectPipeline @ index.ts#L424
EffectSinkPort @ index.ts#L422
encodeEdgePropKey @ index.ts#L366
EncryptionError @ index.ts#L244
exportCoordinateComparisonFact @ index.ts#L392
exportCoordinateTransferPlanFact @ index.ts#L393
ForkError @ index.ts#L245
GitGraphAdapter @ index.ts#L273
GraphDiff @ index.ts#L378
GraphNode @ index.ts#L275
GraphOpAlgebraProjection @ index.ts#L276
GraphPersistencePort @ index.ts#L284
HealthCheckService @ index.ts#L280
HealthStatus @ index.ts#L281
HttpServerPort @ index.ts#L300
ImmutableBytes @ index.ts#L386
IndexError @ index.ts#L246
IndexRebuildService @ index.ts#L279
IndexStoragePort @ index.ts#L285
InMemoryBlobStorageAdapter @ index.ts#L298
InMemoryGraphAdapter @ index.ts#L274
INSPECT_LENS @ index.ts#L434
isEdgePropKey @ index.ts#L368
LIVE_LENS @ index.ts#L432
LiveSelector @ index.ts#L337
LoggerPort @ index.ts#L288
LogLevel @ index.ts#L291
MemoryBudgetError @ index.ts#L247
MultiplexSink @ index.ts#L423
NodeCryptoAdapter @ index.ts#L303
NoOpEffectSink @ index.ts#L435
NoOpLogger @ index.ts#L289
NoopOperationPolicyAdapter @ index.ts#L239
normalizeVisibleStateScope @ index.ts#L390
Observer @ index.ts#L344
ObserverAccumulation @ index.ts#L345
ObserverBasis @ index.ts#L346
ObserverEmission @ index.ts#L347
ObserverPlan @ index.ts#L348
ObserverReadingEnvelope @ index.ts#L349
openAperture @ index.ts#L419
openWarpGraph @ index.ts#L319
openWarpWorldline @ index.ts#L322
OperationAbortedError @ index.ts#L248
OperationPolicyExhaustedError @ index.ts#L240
OperationPolicyPort @ index.ts#L234
OperationPolicyTimeoutError @ index.ts#L240
Optic @ index.ts#L326
OpticAperturePosture @ index.ts#L327
OpticBasisPosture @ index.ts#L328
OpticCoordinatePosture @ index.ts#L329
OpticSupportRule @ index.ts#L330
PatchBuilder @ index.ts#L350
PatchError @ index.ts#L249
PatchSession @ index.ts#L351
ProjectionHandle @ index.ts#L331
projectState @ index.ts#L375
ProvenanceIndex @ index.ts#L353
ProvenancePayload @ index.ts#L403
QueryBuilder @ index.ts#L343
QueryError @ index.ts#L250
RejectedApertureOpening @ index.ts#L417
RejectedZKWormhole @ index.ts#L417
REPLAY_LENS @ index.ts#L433
replayBTR @ index.ts#L409
replayWormhole @ index.ts#L414
SchemaUnsupportedError @ index.ts#L251
scopeMaterializedState @ index.ts#L391
SeekCachePort @ index.ts#L294
serializeWormhole @ index.ts#L415
ShardCorruptionError @ index.ts#L252
ShardLoadError @ index.ts#L253
ShardValidationError @ index.ts#L254
SnapshotORSet @ index.ts#L387
SnapshotVersionVector @ index.ts#L388
SnapshotWarpState @ index.ts#L389
StorageError @ index.ts#L255
StrandError @ index.ts#L256
StrandSelector @ index.ts#L339
SupportFragmentPlan @ index.ts#L342
SyncError @ index.ts#L257
SyncSecret @ index.ts#L438
TICK_RECEIPT_OP_TYPES @ index.ts#L399
TICK_RECEIPT_RESULT_TYPES @ index.ts#L400
tickReceiptCanonicalJson @ index.ts#L398
TraversalError @ index.ts#L258
TtdMergeBranch @ index.ts#L379
TtdMergeFootprint @ index.ts#L380
TtdMergeInspection @ index.ts#L381
TtdMergeInspector @ index.ts#L382
TtdMergeLoweringWitness @ index.ts#L383
TtdMergeObstructionWitness @ index.ts#L384
TtdMergePolicyRequirement @ index.ts#L385
VerifiedApertureOpening @ index.ts#L418
VerifiedZKWormhole @ index.ts#L418
verifyBTR @ index.ts#L408
verifyZKWormhole @ index.ts#L419
WarpApp @ index.ts#L334
WarpCore @ index.ts#L335
WarpOpenOptions @ index.ts#L318
WarpStateIndexBuilder @ index.ts#L372
WarpWorldline @ index.ts#L323
WarpWorldlineCoordinate @ index.ts#L324
WarpWorldlineOpticBasis @ index.ts#L325
WebCryptoAdapter @ index.ts#L304
WorldlineSelector @ index.ts#L336
WormholeError @ index.ts#L259
Writer @ index.ts#L352
WriterError @ index.ts#L311
ZKWormholeEdge @ index.ts#L418
ZKWormholeProofVerifierPort @ index.ts#L419
```

## Root API type exports

Source: `index.ts`. Count: 51.

```text
Aperture @ index.ts#L443
ApertureOpeningProofFields @ index.ts#L472
ApertureOpeningVerificationResult @ index.ts#L472
BoundedSupportDirection @ index.ts#L458
BoundedSupportKind @ index.ts#L459
BoundedSupportRuleFields @ index.ts#L460
BoundedSupportSurface @ index.ts#L461
CasContentEncryptionDiagnostics @ index.ts#L237
CasContentEncryptionScheme @ index.ts#L237
CasResolvedVaultKeyOptions @ index.ts#L237
CasVaultResolutionWitness @ index.ts#L237
CausalIndexFamily @ index.ts#L462
CausalIndexPlanFields @ index.ts#L463
CausalIndexPlanPosture @ index.ts#L464
GraphDiffFields @ index.ts#L468
GraphDiffOptions @ index.ts#L467
ObserverConfig @ index.ts#L444
ObserverPlanFields @ index.ts#L469
ObserverReadingEnvelopeBudget @ index.ts#L470
ObserverReadingEnvelopeFields @ index.ts#L471
OperationPolicyExecuteOptions @ index.ts#L235
OperationRetryDecision @ index.ts#L235
OperationRetryObserver @ index.ts#L235
OpticAperturePostureValue @ index.ts#L451
OpticBasisPostureValue @ index.ts#L452
OpticContextValue @ index.ts#L453
OpticCoordinatePostureValue @ index.ts#L454
OpticFields @ index.ts#L455
OpticPostureFields @ index.ts#L456
OpticSupportRuleValue @ index.ts#L457
PropValue @ index.ts#L445
SnapshotPropValue @ index.ts#L446
SupportFragmentMaterializationPosture @ index.ts#L465
SupportFragmentPlanFields @ index.ts#L466
SyncRateLimitConfig @ index.ts#L447
TtdMergeBranchFields @ index.ts#L475
TtdMergeFootprintFields @ index.ts#L476
TtdMergeInspectionDomain @ index.ts#L477
TtdMergeInspectionFields @ index.ts#L478
TtdMergeLoweringSurface @ index.ts#L479
TtdMergeLoweringWitnessFields @ index.ts#L480
TtdMergeObjectBranchInput @ index.ts#L481
TtdMergeObjectInspectionInput @ index.ts#L482
TtdMergeObstructionWitnessFields @ index.ts#L483
TtdMergePolicyRequirementFields @ index.ts#L484
WarpKernelPort @ index.ts#L448
WarpWorldlineCoordinateFrontierEntry @ index.ts#L474
WarpWorldlineOpenOptions @ index.ts#L449
WarpWorldlinePatchBuild @ index.ts#L450
ZKWormholeEdgeFields @ index.ts#L473
ZKWormholeVerificationResult @ index.ts#L473
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

