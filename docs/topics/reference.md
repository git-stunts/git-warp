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

### Export modules

| Module | Kind | Source |
| --- | --- | --- |
| `./src/domain/memory/index.ts` | export * | `index.ts#L55` |

### Value exports

Source: `index.ts`. Count: 73.

```text
AlfredOperationPolicyAdapter @ index.ts#L68
AuditError @ index.ts#L71
BunHttpAdapter @ index.ts#L102
canonicalEmissionJson @ index.ts#L125
canonicalObservationJson @ index.ts#L126
CasContentEncryptionPolicy @ index.ts#L62
checkAborted @ index.ts#L104
ChunkEffectSink @ index.ts#L136
ConsoleEffectSink @ index.ts#L135
ConsoleLogger @ index.ts#L96
ContinuumArtifactAuthorityError @ index.ts#L72
createDeliveryObservation @ index.ts#L122
createEffectEmission @ index.ts#L117
createExternalizationPolicy @ index.ts#L129
createTickReceipt @ index.ts#L108
createTimeoutSignal @ index.ts#L104
CryptoPort @ index.ts#L98
DELIVERY_MODES @ index.ts#L118
DELIVERY_OUTCOMES @ index.ts#L119
DenoHttpAdapter @ index.ts#L103
DraftTimeline @ index.ts#L19
EffectPipeline @ index.ts#L115
EffectSinkPort @ index.ts#L113
EncryptionError @ index.ts#L73
ForkError @ index.ts#L74
HealthCheckService @ index.ts#L93
HealthStatus @ index.ts#L93
HttpServerPort @ index.ts#L99
IndexError @ index.ts#L75
INSPECT_LENS @ index.ts#L132
intent @ index.ts#L22
Intent @ index.ts#L23
JoinReceipt @ index.ts#L24
JoinResult @ index.ts#L25
LIVE_LENS @ index.ts#L130
LoggerPort @ index.ts#L94
LogLevel @ index.ts#L96
MemoryBudgetError @ index.ts#L76
MultiplexSink @ index.ts#L114
NodeCryptoAdapter @ index.ts#L100
NoOpEffectSink @ index.ts#L134
NoOpLogger @ index.ts#L95
NoopOperationPolicyAdapter @ index.ts#L69
openWarp @ index.ts#L18
OperationAbortedError @ index.ts#L77
OperationPolicyExhaustedError @ index.ts#L78
OperationPolicyPort @ index.ts#L57
OperationPolicyTimeoutError @ index.ts#L79
PatchError @ index.ts#L80
QueryError @ index.ts#L81
reading @ index.ts#L26
Reading @ index.ts#L27
ReadingResult @ index.ts#L28
ReadReceipt @ index.ts#L29
REPLAY_LENS @ index.ts#L131
SchemaUnsupportedError @ index.ts#L82
ShardCorruptionError @ index.ts#L83
ShardLoadError @ index.ts#L84
ShardValidationError @ index.ts#L85
StorageError @ index.ts#L86
StrandError @ index.ts#L87
SyncError @ index.ts#L88
SyncSecret @ index.ts#L105
TICK_RECEIPT_OP_TYPES @ index.ts#L109
TICK_RECEIPT_RESULT_TYPES @ index.ts#L110
tickReceiptCanonicalJson @ index.ts#L112
Timeline @ index.ts#L21
TraversalError @ index.ts#L89
Warp @ index.ts#L20
WebCryptoAdapter @ index.ts#L101
WormholeError @ index.ts#L90
WriteReceipt @ index.ts#L30
WriterError @ index.ts#L97
```

### Type exports

Source: `index.ts`. Count: 32.

```text
CasContentEncryptionDiagnostics @ index.ts#L64
CasContentEncryptionScheme @ index.ts#L65
CasResolvedVaultKeyOptions @ index.ts#L66
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
OperationPolicyExecuteOptions @ index.ts#L59
OperationRetryDecision @ index.ts#L60
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
SyncRateLimitConfig @ index.ts#L106
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
| `./src/domain/graph/publicGraphSubstrate.ts` | export * | `legacy.ts#L222` |
| `./src/domain/memory/index.ts` | export * | `legacy.ts#L223` |
| `./src/continuumExports.ts` | export * | `legacy.ts#L224` |

### Value exports

Source: `legacy.ts`. Count: 161.

```text
AlfredOperationPolicyAdapter @ legacy.ts#L229
ApertureOpeningProof @ legacy.ts#L408
AuditError @ legacy.ts#L233
BisectService @ legacy.ts#L274
BitmapIndexBuilder @ legacy.ts#L268
BitmapIndexReader @ legacy.ts#L269
BlobStoragePort @ legacy.ts#L288
BoundedSupportRule @ legacy.ts#L331
BTR @ legacy.ts#L397
buildWarpStateIndex @ legacy.ts#L364
BunHttpAdapter @ legacy.ts#L298
canonicalEmissionJson @ legacy.ts#L417
canonicalObservationJson @ legacy.ts#L419
CasContentEncryptionPolicy @ legacy.ts#L227
CausalIndexPlan @ legacy.ts#L332
checkAborted @ legacy.ts#L305
ChunkEffectSink @ legacy.ts#L428
CommitDagTraversalService @ legacy.ts#L273
compareVisibleState @ legacy.ts#L368
composeWormholes @ legacy.ts#L404
computeStateHash @ legacy.ts#L365
computeTranslationCost @ legacy.ts#L345
ConsoleEffectSink @ legacy.ts#L427
ConsoleLogger @ legacy.ts#L281
CONTENT_PROPERTY_KEY @ legacy.ts#L360
ContentAttachmentProjection @ legacy.ts#L430
ContinuumArtifactAuthorityError @ legacy.ts#L234
CoordinateSelector @ legacy.ts#L329
createBlobValue @ legacy.ts#L354
createBTR @ legacy.ts#L398
createDeliveryObservation @ legacy.ts#L418
createEdgeAdd @ legacy.ts#L350
createEdgeTombstone @ legacy.ts#L351
createEffectEmission @ legacy.ts#L416
createExternalizationPolicy @ legacy.ts#L420
createInlineValue @ legacy.ts#L353
createNodeAdd @ legacy.ts#L348
createNodeTombstone @ legacy.ts#L349
createPropSet @ legacy.ts#L352
createStateReader @ legacy.ts#L367
createTickReceipt @ legacy.ts#L388
createTimeoutSignal @ legacy.ts#L306
createV18BoundedMemoryCapabilityReport @ legacy.ts#L385
createWormhole @ legacy.ts#L403
CryptoPort @ legacy.ts#L290
decodeEdgePropKey @ legacy.ts#L358
DELIVERY_MODES @ legacy.ts#L421
DELIVERY_OUTCOMES @ legacy.ts#L422
DenoHttpAdapter @ legacy.ts#L299
deserializeWormhole @ legacy.ts#L407
EffectPipeline @ legacy.ts#L415
EffectSinkPort @ legacy.ts#L413
encodeEdgePropKey @ legacy.ts#L357
EncryptionError @ legacy.ts#L235
exportCoordinateComparisonFact @ legacy.ts#L383
exportCoordinateTransferPlanFact @ legacy.ts#L384
ForkError @ legacy.ts#L236
GitGraphAdapter @ legacy.ts#L264
GraphDiff @ legacy.ts#L369
GraphNode @ legacy.ts#L266
GraphOpAlgebraProjection @ legacy.ts#L267
GraphPersistencePort @ legacy.ts#L275
HealthCheckService @ legacy.ts#L271
HealthStatus @ legacy.ts#L272
HttpServerPort @ legacy.ts#L291
ImmutableBytes @ legacy.ts#L377
IndexError @ legacy.ts#L237
IndexRebuildService @ legacy.ts#L270
IndexStoragePort @ legacy.ts#L276
InMemoryBlobStorageAdapter @ legacy.ts#L289
InMemoryGraphAdapter @ legacy.ts#L265
INSPECT_LENS @ legacy.ts#L425
isEdgePropKey @ legacy.ts#L359
LIVE_LENS @ legacy.ts#L423
LiveSelector @ legacy.ts#L328
LoggerPort @ legacy.ts#L279
LogLevel @ legacy.ts#L282
MemoryBudgetError @ legacy.ts#L238
MultiplexSink @ legacy.ts#L414
NodeCryptoAdapter @ legacy.ts#L294
NoOpEffectSink @ legacy.ts#L426
NoOpLogger @ legacy.ts#L280
NoopOperationPolicyAdapter @ legacy.ts#L230
normalizeVisibleStateScope @ legacy.ts#L381
Observer @ legacy.ts#L335
ObserverAccumulation @ legacy.ts#L336
ObserverBasis @ legacy.ts#L337
ObserverEmission @ legacy.ts#L338
ObserverPlan @ legacy.ts#L339
ObserverReadingEnvelope @ legacy.ts#L340
openAperture @ legacy.ts#L410
openWarpGraph @ legacy.ts#L310
openWarpWorldline @ legacy.ts#L313
OperationAbortedError @ legacy.ts#L239
OperationPolicyExhaustedError @ legacy.ts#L231
OperationPolicyPort @ legacy.ts#L225
OperationPolicyTimeoutError @ legacy.ts#L231
Optic @ legacy.ts#L317
OpticAperturePosture @ legacy.ts#L318
OpticBasisPosture @ legacy.ts#L319
OpticCoordinatePosture @ legacy.ts#L320
OpticSupportRule @ legacy.ts#L321
PatchBuilder @ legacy.ts#L341
PatchError @ legacy.ts#L240
PatchSession @ legacy.ts#L342
ProjectionHandle @ legacy.ts#L322
projectState @ legacy.ts#L366
ProvenanceIndex @ legacy.ts#L344
ProvenancePayload @ legacy.ts#L394
QueryBuilder @ legacy.ts#L334
QueryError @ legacy.ts#L241
RejectedApertureOpening @ legacy.ts#L408
RejectedZKWormhole @ legacy.ts#L408
REPLAY_LENS @ legacy.ts#L424
replayBTR @ legacy.ts#L400
replayWormhole @ legacy.ts#L405
SchemaUnsupportedError @ legacy.ts#L242
scopeMaterializedState @ legacy.ts#L382
SeekCachePort @ legacy.ts#L285
serializeWormhole @ legacy.ts#L406
ShardCorruptionError @ legacy.ts#L243
ShardLoadError @ legacy.ts#L244
ShardValidationError @ legacy.ts#L245
SnapshotORSet @ legacy.ts#L378
SnapshotVersionVector @ legacy.ts#L379
SnapshotWarpState @ legacy.ts#L380
StorageError @ legacy.ts#L246
StrandError @ legacy.ts#L247
StrandSelector @ legacy.ts#L330
SupportFragmentPlan @ legacy.ts#L333
SyncError @ legacy.ts#L248
SyncSecret @ legacy.ts#L429
TICK_RECEIPT_OP_TYPES @ legacy.ts#L390
TICK_RECEIPT_RESULT_TYPES @ legacy.ts#L391
tickReceiptCanonicalJson @ legacy.ts#L389
TraversalError @ legacy.ts#L249
TtdMergeBranch @ legacy.ts#L370
TtdMergeFootprint @ legacy.ts#L371
TtdMergeInspection @ legacy.ts#L372
TtdMergeInspector @ legacy.ts#L373
TtdMergeLoweringWitness @ legacy.ts#L374
TtdMergeObstructionWitness @ legacy.ts#L375
TtdMergePolicyRequirement @ legacy.ts#L376
VerifiedApertureOpening @ legacy.ts#L409
VerifiedZKWormhole @ legacy.ts#L409
verifyBTR @ legacy.ts#L399
verifyZKWormhole @ legacy.ts#L410
WarpApp @ legacy.ts#L325
WarpCore @ legacy.ts#L326
WarpOpenOptions @ legacy.ts#L309
WarpStateIndexBuilder @ legacy.ts#L363
WarpWorldline @ legacy.ts#L314
WarpWorldlineCoordinate @ legacy.ts#L315
WarpWorldlineOpticBasis @ legacy.ts#L316
WebCryptoAdapter @ legacy.ts#L295
WorldlineSelector @ legacy.ts#L327
WormholeError @ legacy.ts#L250
Writer @ legacy.ts#L343
WriterError @ legacy.ts#L302
ZKWormholeEdge @ legacy.ts#L409
ZKWormholeProofVerifierPort @ legacy.ts#L410
```

### Type exports

Source: `legacy.ts`. Count: 51.

```text
Aperture @ legacy.ts#L434
ApertureOpeningProofFields @ legacy.ts#L463
ApertureOpeningVerificationResult @ legacy.ts#L463
BoundedSupportDirection @ legacy.ts#L449
BoundedSupportKind @ legacy.ts#L450
BoundedSupportRuleFields @ legacy.ts#L451
BoundedSupportSurface @ legacy.ts#L452
CasContentEncryptionDiagnostics @ legacy.ts#L228
CasContentEncryptionScheme @ legacy.ts#L228
CasResolvedVaultKeyOptions @ legacy.ts#L228
CasVaultResolutionWitness @ legacy.ts#L228
CausalIndexFamily @ legacy.ts#L453
CausalIndexPlanFields @ legacy.ts#L454
CausalIndexPlanPosture @ legacy.ts#L455
GraphDiffFields @ legacy.ts#L459
GraphDiffOptions @ legacy.ts#L458
ObserverConfig @ legacy.ts#L435
ObserverPlanFields @ legacy.ts#L460
ObserverReadingEnvelopeBudget @ legacy.ts#L461
ObserverReadingEnvelopeFields @ legacy.ts#L462
OperationPolicyExecuteOptions @ legacy.ts#L226
OperationRetryDecision @ legacy.ts#L226
OperationRetryObserver @ legacy.ts#L226
OpticAperturePostureValue @ legacy.ts#L442
OpticBasisPostureValue @ legacy.ts#L443
OpticContextValue @ legacy.ts#L444
OpticCoordinatePostureValue @ legacy.ts#L445
OpticFields @ legacy.ts#L446
OpticPostureFields @ legacy.ts#L447
OpticSupportRuleValue @ legacy.ts#L448
PropValue @ legacy.ts#L436
SnapshotPropValue @ legacy.ts#L437
SupportFragmentMaterializationPosture @ legacy.ts#L456
SupportFragmentPlanFields @ legacy.ts#L457
SyncRateLimitConfig @ legacy.ts#L438
TtdMergeBranchFields @ legacy.ts#L466
TtdMergeFootprintFields @ legacy.ts#L467
TtdMergeInspectionDomain @ legacy.ts#L468
TtdMergeInspectionFields @ legacy.ts#L469
TtdMergeLoweringSurface @ legacy.ts#L470
TtdMergeLoweringWitnessFields @ legacy.ts#L471
TtdMergeObjectBranchInput @ legacy.ts#L472
TtdMergeObjectInspectionInput @ legacy.ts#L473
TtdMergeObstructionWitnessFields @ legacy.ts#L474
TtdMergePolicyRequirementFields @ legacy.ts#L475
WarpKernelPort @ legacy.ts#L439
WarpWorldlineCoordinateFrontierEntry @ legacy.ts#L465
WarpWorldlineOpenOptions @ legacy.ts#L440
WarpWorldlinePatchBuild @ legacy.ts#L441
ZKWormholeEdgeFields @ legacy.ts#L464
ZKWormholeVerificationResult @ legacy.ts#L464
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
