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
| `./src/domain/graph/publicGraphSubstrate.ts` | export * | `index.ts#L240` |
| `./src/domain/memory/index.ts` | export * | `index.ts#L241` |
| `./src/continuumExports.ts` | export * | `index.ts#L242` |

## Root API value exports

Source: `index.ts`. Count: 161.

```text
AlfredOperationPolicyAdapter @ index.ts#L247
ApertureOpeningProof @ index.ts#L426
AuditError @ index.ts#L251
BisectService @ index.ts#L292
BitmapIndexBuilder @ index.ts#L286
BitmapIndexReader @ index.ts#L287
BlobStoragePort @ index.ts#L306
BoundedSupportRule @ index.ts#L349
BTR @ index.ts#L415
buildWarpStateIndex @ index.ts#L382
BunHttpAdapter @ index.ts#L316
canonicalEmissionJson @ index.ts#L435
canonicalObservationJson @ index.ts#L437
CasContentEncryptionPolicy @ index.ts#L245
CausalIndexPlan @ index.ts#L350
checkAborted @ index.ts#L323
ChunkEffectSink @ index.ts#L446
CommitDagTraversalService @ index.ts#L291
compareVisibleState @ index.ts#L386
composeWormholes @ index.ts#L422
computeStateHash @ index.ts#L383
computeTranslationCost @ index.ts#L363
ConsoleEffectSink @ index.ts#L445
ConsoleLogger @ index.ts#L299
CONTENT_PROPERTY_KEY @ index.ts#L378
ContentAttachmentProjection @ index.ts#L448
ContinuumArtifactAuthorityError @ index.ts#L252
CoordinateSelector @ index.ts#L347
createBlobValue @ index.ts#L372
createBTR @ index.ts#L416
createDeliveryObservation @ index.ts#L436
createEdgeAdd @ index.ts#L368
createEdgeTombstone @ index.ts#L369
createEffectEmission @ index.ts#L434
createExternalizationPolicy @ index.ts#L438
createInlineValue @ index.ts#L371
createNodeAdd @ index.ts#L366
createNodeTombstone @ index.ts#L367
createPropSet @ index.ts#L370
createStateReader @ index.ts#L385
createTickReceipt @ index.ts#L406
createTimeoutSignal @ index.ts#L324
createV18BoundedMemoryCapabilityReport @ index.ts#L403
createWormhole @ index.ts#L421
CryptoPort @ index.ts#L308
decodeEdgePropKey @ index.ts#L376
DELIVERY_MODES @ index.ts#L439
DELIVERY_OUTCOMES @ index.ts#L440
DenoHttpAdapter @ index.ts#L317
deserializeWormhole @ index.ts#L425
EffectPipeline @ index.ts#L433
EffectSinkPort @ index.ts#L431
encodeEdgePropKey @ index.ts#L375
EncryptionError @ index.ts#L253
exportCoordinateComparisonFact @ index.ts#L401
exportCoordinateTransferPlanFact @ index.ts#L402
ForkError @ index.ts#L254
GitGraphAdapter @ index.ts#L282
GraphDiff @ index.ts#L387
GraphNode @ index.ts#L284
GraphOpAlgebraProjection @ index.ts#L285
GraphPersistencePort @ index.ts#L293
HealthCheckService @ index.ts#L289
HealthStatus @ index.ts#L290
HttpServerPort @ index.ts#L309
ImmutableBytes @ index.ts#L395
IndexError @ index.ts#L255
IndexRebuildService @ index.ts#L288
IndexStoragePort @ index.ts#L294
InMemoryBlobStorageAdapter @ index.ts#L307
InMemoryGraphAdapter @ index.ts#L283
INSPECT_LENS @ index.ts#L443
isEdgePropKey @ index.ts#L377
LIVE_LENS @ index.ts#L441
LiveSelector @ index.ts#L346
LoggerPort @ index.ts#L297
LogLevel @ index.ts#L300
MemoryBudgetError @ index.ts#L256
MultiplexSink @ index.ts#L432
NodeCryptoAdapter @ index.ts#L312
NoOpEffectSink @ index.ts#L444
NoOpLogger @ index.ts#L298
NoopOperationPolicyAdapter @ index.ts#L248
normalizeVisibleStateScope @ index.ts#L399
Observer @ index.ts#L353
ObserverAccumulation @ index.ts#L354
ObserverBasis @ index.ts#L355
ObserverEmission @ index.ts#L356
ObserverPlan @ index.ts#L357
ObserverReadingEnvelope @ index.ts#L358
openAperture @ index.ts#L428
openWarpGraph @ index.ts#L328
openWarpWorldline @ index.ts#L331
OperationAbortedError @ index.ts#L257
OperationPolicyExhaustedError @ index.ts#L249
OperationPolicyPort @ index.ts#L243
OperationPolicyTimeoutError @ index.ts#L249
Optic @ index.ts#L335
OpticAperturePosture @ index.ts#L336
OpticBasisPosture @ index.ts#L337
OpticCoordinatePosture @ index.ts#L338
OpticSupportRule @ index.ts#L339
PatchBuilder @ index.ts#L359
PatchError @ index.ts#L258
PatchSession @ index.ts#L360
ProjectionHandle @ index.ts#L340
projectState @ index.ts#L384
ProvenanceIndex @ index.ts#L362
ProvenancePayload @ index.ts#L412
QueryBuilder @ index.ts#L352
QueryError @ index.ts#L259
RejectedApertureOpening @ index.ts#L426
RejectedZKWormhole @ index.ts#L426
REPLAY_LENS @ index.ts#L442
replayBTR @ index.ts#L418
replayWormhole @ index.ts#L423
SchemaUnsupportedError @ index.ts#L260
scopeMaterializedState @ index.ts#L400
SeekCachePort @ index.ts#L303
serializeWormhole @ index.ts#L424
ShardCorruptionError @ index.ts#L261
ShardLoadError @ index.ts#L262
ShardValidationError @ index.ts#L263
SnapshotORSet @ index.ts#L396
SnapshotVersionVector @ index.ts#L397
SnapshotWarpState @ index.ts#L398
StorageError @ index.ts#L264
StrandError @ index.ts#L265
StrandSelector @ index.ts#L348
SupportFragmentPlan @ index.ts#L351
SyncError @ index.ts#L266
SyncSecret @ index.ts#L447
TICK_RECEIPT_OP_TYPES @ index.ts#L408
TICK_RECEIPT_RESULT_TYPES @ index.ts#L409
tickReceiptCanonicalJson @ index.ts#L407
TraversalError @ index.ts#L267
TtdMergeBranch @ index.ts#L388
TtdMergeFootprint @ index.ts#L389
TtdMergeInspection @ index.ts#L390
TtdMergeInspector @ index.ts#L391
TtdMergeLoweringWitness @ index.ts#L392
TtdMergeObstructionWitness @ index.ts#L393
TtdMergePolicyRequirement @ index.ts#L394
VerifiedApertureOpening @ index.ts#L427
VerifiedZKWormhole @ index.ts#L427
verifyBTR @ index.ts#L417
verifyZKWormhole @ index.ts#L428
WarpApp @ index.ts#L343
WarpCore @ index.ts#L344
WarpOpenOptions @ index.ts#L327
WarpStateIndexBuilder @ index.ts#L381
WarpWorldline @ index.ts#L332
WarpWorldlineCoordinate @ index.ts#L333
WarpWorldlineOpticBasis @ index.ts#L334
WebCryptoAdapter @ index.ts#L313
WorldlineSelector @ index.ts#L345
WormholeError @ index.ts#L268
Writer @ index.ts#L361
WriterError @ index.ts#L320
ZKWormholeEdge @ index.ts#L427
ZKWormholeProofVerifierPort @ index.ts#L428
```

## Root API type exports

Source: `index.ts`. Count: 51.

```text
Aperture @ index.ts#L452
ApertureOpeningProofFields @ index.ts#L481
ApertureOpeningVerificationResult @ index.ts#L481
BoundedSupportDirection @ index.ts#L467
BoundedSupportKind @ index.ts#L468
BoundedSupportRuleFields @ index.ts#L469
BoundedSupportSurface @ index.ts#L470
CasContentEncryptionDiagnostics @ index.ts#L246
CasContentEncryptionScheme @ index.ts#L246
CasResolvedVaultKeyOptions @ index.ts#L246
CasVaultResolutionWitness @ index.ts#L246
CausalIndexFamily @ index.ts#L471
CausalIndexPlanFields @ index.ts#L472
CausalIndexPlanPosture @ index.ts#L473
GraphDiffFields @ index.ts#L477
GraphDiffOptions @ index.ts#L476
ObserverConfig @ index.ts#L453
ObserverPlanFields @ index.ts#L478
ObserverReadingEnvelopeBudget @ index.ts#L479
ObserverReadingEnvelopeFields @ index.ts#L480
OperationPolicyExecuteOptions @ index.ts#L244
OperationRetryDecision @ index.ts#L244
OperationRetryObserver @ index.ts#L244
OpticAperturePostureValue @ index.ts#L460
OpticBasisPostureValue @ index.ts#L461
OpticContextValue @ index.ts#L462
OpticCoordinatePostureValue @ index.ts#L463
OpticFields @ index.ts#L464
OpticPostureFields @ index.ts#L465
OpticSupportRuleValue @ index.ts#L466
PropValue @ index.ts#L454
SnapshotPropValue @ index.ts#L455
SupportFragmentMaterializationPosture @ index.ts#L474
SupportFragmentPlanFields @ index.ts#L475
SyncRateLimitConfig @ index.ts#L456
TtdMergeBranchFields @ index.ts#L484
TtdMergeFootprintFields @ index.ts#L485
TtdMergeInspectionDomain @ index.ts#L486
TtdMergeInspectionFields @ index.ts#L487
TtdMergeLoweringSurface @ index.ts#L488
TtdMergeLoweringWitnessFields @ index.ts#L489
TtdMergeObjectBranchInput @ index.ts#L490
TtdMergeObjectInspectionInput @ index.ts#L491
TtdMergeObstructionWitnessFields @ index.ts#L492
TtdMergePolicyRequirementFields @ index.ts#L493
WarpKernelPort @ index.ts#L457
WarpWorldlineCoordinateFrontierEntry @ index.ts#L483
WarpWorldlineOpenOptions @ index.ts#L458
WarpWorldlinePatchBuild @ index.ts#L459
ZKWormholeEdgeFields @ index.ts#L482
ZKWormholeVerificationResult @ index.ts#L482
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
