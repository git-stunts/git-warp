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
ApertureOpeningProof @ index.ts#L272
AuditError @ index.ts#L241
BisectService @ index.ts#L272
BitmapIndexBuilder @ index.ts#L272
BitmapIndexReader @ index.ts#L272
BlobStoragePort @ index.ts#L272
BoundedSupportRule @ index.ts#L272
BTR @ index.ts#L272
buildWarpStateIndex @ index.ts#L272
BunHttpAdapter @ index.ts#L272
canonicalEmissionJson @ index.ts#L272
canonicalObservationJson @ index.ts#L272
CasContentEncryptionPolicy @ index.ts#L236
CausalIndexPlan @ index.ts#L272
checkAborted @ index.ts#L272
ChunkEffectSink @ index.ts#L272
CommitDagTraversalService @ index.ts#L272
compareVisibleState @ index.ts#L272
composeWormholes @ index.ts#L272
computeStateHash @ index.ts#L272
computeTranslationCost @ index.ts#L272
ConsoleEffectSink @ index.ts#L272
ConsoleLogger @ index.ts#L272
CONTENT_PROPERTY_KEY @ index.ts#L272
ContentAttachmentProjection @ index.ts#L272
ContinuumArtifactAuthorityError @ index.ts#L241
CoordinateSelector @ index.ts#L272
createBlobValue @ index.ts#L272
createBTR @ index.ts#L272
createDeliveryObservation @ index.ts#L272
createEdgeAdd @ index.ts#L272
createEdgeTombstone @ index.ts#L272
createEffectEmission @ index.ts#L272
createExternalizationPolicy @ index.ts#L272
createInlineValue @ index.ts#L272
createNodeAdd @ index.ts#L272
createNodeTombstone @ index.ts#L272
createPropSet @ index.ts#L272
createStateReader @ index.ts#L272
createTickReceipt @ index.ts#L272
createTimeoutSignal @ index.ts#L272
createV18BoundedMemoryCapabilityReport @ index.ts#L272
createWormhole @ index.ts#L272
CryptoPort @ index.ts#L272
decodeEdgePropKey @ index.ts#L272
DELIVERY_MODES @ index.ts#L272
DELIVERY_OUTCOMES @ index.ts#L272
DenoHttpAdapter @ index.ts#L272
deserializeWormhole @ index.ts#L272
EffectPipeline @ index.ts#L272
EffectSinkPort @ index.ts#L272
encodeEdgePropKey @ index.ts#L272
EncryptionError @ index.ts#L241
exportCoordinateComparisonFact @ index.ts#L272
exportCoordinateTransferPlanFact @ index.ts#L272
ForkError @ index.ts#L241
GitGraphAdapter @ index.ts#L272
GraphDiff @ index.ts#L272
GraphNode @ index.ts#L272
GraphOpAlgebraProjection @ index.ts#L272
GraphPersistencePort @ index.ts#L272
HealthCheckService @ index.ts#L272
HealthStatus @ index.ts#L272
HttpServerPort @ index.ts#L272
ImmutableBytes @ index.ts#L272
IndexError @ index.ts#L241
IndexRebuildService @ index.ts#L272
IndexStoragePort @ index.ts#L272
InMemoryBlobStorageAdapter @ index.ts#L272
InMemoryGraphAdapter @ index.ts#L272
INSPECT_LENS @ index.ts#L272
isEdgePropKey @ index.ts#L272
LIVE_LENS @ index.ts#L272
LiveSelector @ index.ts#L272
LoggerPort @ index.ts#L272
LogLevel @ index.ts#L272
MemoryBudgetError @ index.ts#L241
MultiplexSink @ index.ts#L272
NodeCryptoAdapter @ index.ts#L272
NoOpEffectSink @ index.ts#L272
NoOpLogger @ index.ts#L272
NoopOperationPolicyAdapter @ index.ts#L239
normalizeVisibleStateScope @ index.ts#L272
Observer @ index.ts#L272
ObserverAccumulation @ index.ts#L272
ObserverBasis @ index.ts#L272
ObserverEmission @ index.ts#L272
ObserverPlan @ index.ts#L272
ObserverReadingEnvelope @ index.ts#L272
openAperture @ index.ts#L272
openWarpGraph @ index.ts#L272
openWarpWorldline @ index.ts#L272
OperationAbortedError @ index.ts#L241
OperationPolicyExhaustedError @ index.ts#L240
OperationPolicyPort @ index.ts#L234
OperationPolicyTimeoutError @ index.ts#L240
Optic @ index.ts#L272
OpticAperturePosture @ index.ts#L272
OpticBasisPosture @ index.ts#L272
OpticCoordinatePosture @ index.ts#L272
OpticSupportRule @ index.ts#L272
PatchBuilder @ index.ts#L272
PatchError @ index.ts#L241
PatchSession @ index.ts#L272
ProjectionHandle @ index.ts#L272
projectState @ index.ts#L272
ProvenanceIndex @ index.ts#L272
ProvenancePayload @ index.ts#L272
QueryBuilder @ index.ts#L272
QueryError @ index.ts#L241
RejectedApertureOpening @ index.ts#L272
RejectedZKWormhole @ index.ts#L272
REPLAY_LENS @ index.ts#L272
replayBTR @ index.ts#L272
replayWormhole @ index.ts#L272
SchemaUnsupportedError @ index.ts#L241
scopeMaterializedState @ index.ts#L272
SeekCachePort @ index.ts#L272
serializeWormhole @ index.ts#L272
ShardCorruptionError @ index.ts#L241
ShardLoadError @ index.ts#L241
ShardValidationError @ index.ts#L241
SnapshotORSet @ index.ts#L272
SnapshotVersionVector @ index.ts#L272
SnapshotWarpState @ index.ts#L272
StorageError @ index.ts#L241
StrandError @ index.ts#L241
StrandSelector @ index.ts#L272
SupportFragmentPlan @ index.ts#L272
SyncError @ index.ts#L241
SyncSecret @ index.ts#L272
TICK_RECEIPT_OP_TYPES @ index.ts#L272
TICK_RECEIPT_RESULT_TYPES @ index.ts#L272
tickReceiptCanonicalJson @ index.ts#L272
TraversalError @ index.ts#L241
TtdMergeBranch @ index.ts#L272
TtdMergeFootprint @ index.ts#L272
TtdMergeInspection @ index.ts#L272
TtdMergeInspector @ index.ts#L272
TtdMergeLoweringWitness @ index.ts#L272
TtdMergeObstructionWitness @ index.ts#L272
TtdMergePolicyRequirement @ index.ts#L272
VerifiedApertureOpening @ index.ts#L272
VerifiedZKWormhole @ index.ts#L272
verifyBTR @ index.ts#L272
verifyZKWormhole @ index.ts#L272
WarpApp @ index.ts#L272
WarpCore @ index.ts#L272
WarpOpenOptions @ index.ts#L272
WarpStateIndexBuilder @ index.ts#L272
WarpWorldline @ index.ts#L272
WarpWorldlineCoordinate @ index.ts#L272
WarpWorldlineOpticBasis @ index.ts#L272
WebCryptoAdapter @ index.ts#L272
WorldlineSelector @ index.ts#L272
WormholeError @ index.ts#L241
Writer @ index.ts#L272
WriterError @ index.ts#L272
ZKWormholeEdge @ index.ts#L272
ZKWormholeProofVerifierPort @ index.ts#L272
```

## Root API type exports

Source: `index.ts`. Count: 51.

```text
Aperture @ index.ts#L442
ApertureOpeningProofFields @ index.ts#L442
ApertureOpeningVerificationResult @ index.ts#L442
BoundedSupportDirection @ index.ts#L442
BoundedSupportKind @ index.ts#L442
BoundedSupportRuleFields @ index.ts#L442
BoundedSupportSurface @ index.ts#L442
CasContentEncryptionDiagnostics @ index.ts#L237
CasContentEncryptionScheme @ index.ts#L237
CasResolvedVaultKeyOptions @ index.ts#L237
CasVaultResolutionWitness @ index.ts#L237
CausalIndexFamily @ index.ts#L442
CausalIndexPlanFields @ index.ts#L442
CausalIndexPlanPosture @ index.ts#L442
GraphDiffFields @ index.ts#L442
GraphDiffOptions @ index.ts#L442
ObserverConfig @ index.ts#L442
ObserverPlanFields @ index.ts#L442
ObserverReadingEnvelopeBudget @ index.ts#L442
ObserverReadingEnvelopeFields @ index.ts#L442
OperationPolicyExecuteOptions @ index.ts#L235
OperationRetryDecision @ index.ts#L235
OperationRetryObserver @ index.ts#L235
OpticAperturePostureValue @ index.ts#L442
OpticBasisPostureValue @ index.ts#L442
OpticContextValue @ index.ts#L442
OpticCoordinatePostureValue @ index.ts#L442
OpticFields @ index.ts#L442
OpticPostureFields @ index.ts#L442
OpticSupportRuleValue @ index.ts#L442
PropValue @ index.ts#L442
SnapshotPropValue @ index.ts#L442
SupportFragmentMaterializationPosture @ index.ts#L442
SupportFragmentPlanFields @ index.ts#L442
SyncRateLimitConfig @ index.ts#L442
TtdMergeBranchFields @ index.ts#L442
TtdMergeFootprintFields @ index.ts#L442
TtdMergeInspectionDomain @ index.ts#L442
TtdMergeInspectionFields @ index.ts#L442
TtdMergeLoweringSurface @ index.ts#L442
TtdMergeLoweringWitnessFields @ index.ts#L442
TtdMergeObjectBranchInput @ index.ts#L442
TtdMergeObjectInspectionInput @ index.ts#L442
TtdMergeObstructionWitnessFields @ index.ts#L442
TtdMergePolicyRequirementFields @ index.ts#L442
WarpKernelPort @ index.ts#L442
WarpWorldlineCoordinateFrontierEntry @ index.ts#L442
WarpWorldlineOpenOptions @ index.ts#L442
WarpWorldlinePatchBuild @ index.ts#L442
ZKWormholeEdgeFields @ index.ts#L442
ZKWormholeVerificationResult @ index.ts#L442
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

Source: `bin/warp-graph.ts#L130`.

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

