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
| npm export | `./storage` | `types=./dist/storage.d.ts; import=./dist/storage.js; default=./dist/storage.js` | `package.json#L32` |
| npm export | `./advanced` | `types=./dist/advanced.d.ts; import=./dist/advanced.js; default=./dist/advanced.js` | `package.json#L37` |
| npm export | `./diagnostics` | `types=./dist/diagnostics.d.ts; import=./dist/diagnostics.js; default=./dist/diagnostics.js` | `package.json#L42` |
| npm export | `./sha1sync` | `types=./dist/src/infrastructure/adapters/sha1sync.d.ts; import=./dist/src/infrastructure/adapters/sha1sync.js; default=./dist/src/infrastructure/adapters/sha1sync.js` | `package.json#L47` |
| npm export | `./package.json` | `./package.json` | `package.json#L52` |
| JSR export | `.` | `./index.ts` | `jsr.json#L8` |
| JSR export | `./storage` | `./storage.ts` | `jsr.json#L9` |
| JSR export | `./advanced` | `./advanced.ts` | `jsr.json#L10` |
| JSR export | `./diagnostics` | `./diagnostics.ts` | `jsr.json#L11` |
| JSR export | `./sha1sync` | `./src/infrastructure/adapters/sha1sync.ts` | `jsr.json#L12` |

## Root API export surface

First-use product API: `openWarp`, `intent`, `reading`, timelines, and receipts.

### Export modules

| Module | Kind | Source |
| --- | --- | --- |
| `./src/domain/memory/index.ts` | export * | `index.ts#L58` |

### Value exports

Source: `index.ts`. Count: 73.

```text
AlfredOperationPolicyAdapter @ index.ts#L71
AuditError @ index.ts#L74
BunHttpAdapter @ index.ts#L108
canonicalEmissionJson @ index.ts#L129
canonicalObservationJson @ index.ts#L130
CasContentEncryptionPolicy @ index.ts#L65
checkAborted @ index.ts#L110
ChunkEffectSink @ index.ts#L140
ConsoleEffectSink @ index.ts#L139
ConsoleLogger @ index.ts#L102
ContinuumArtifactAuthorityError @ index.ts#L75
createDeliveryObservation @ index.ts#L127
createEffectEmission @ index.ts#L123
createExternalizationPolicy @ index.ts#L133
createTickReceipt @ index.ts#L114
createTimeoutSignal @ index.ts#L110
CryptoPort @ index.ts#L104
DELIVERY_MODES @ index.ts#L124
DELIVERY_OUTCOMES @ index.ts#L125
DenoHttpAdapter @ index.ts#L109
DraftTimeline @ index.ts#L18
EffectPipeline @ index.ts#L121
EffectSinkPort @ index.ts#L119
EncryptionError @ index.ts#L76
ForkError @ index.ts#L77
HealthCheckService @ index.ts#L97
HealthStatus @ index.ts#L98
HttpServerPort @ index.ts#L105
IndexError @ index.ts#L78
INSPECT_LENS @ index.ts#L136
intent @ index.ts#L21
Intent @ index.ts#L22
JoinReceipt @ index.ts#L23
JoinResult @ index.ts#L24
LIVE_LENS @ index.ts#L134
LoggerPort @ index.ts#L100
LogLevel @ index.ts#L102
MemoryBudgetError @ index.ts#L79
MultiplexSink @ index.ts#L120
NodeCryptoAdapter @ index.ts#L106
NoOpEffectSink @ index.ts#L138
NoOpLogger @ index.ts#L101
NoopOperationPolicyAdapter @ index.ts#L72
openWarp @ index.ts#L17
OperationAbortedError @ index.ts#L80
OperationPolicyExhaustedError @ index.ts#L81
OperationPolicyPort @ index.ts#L60
OperationPolicyTimeoutError @ index.ts#L82
PatchError @ index.ts#L83
QueryError @ index.ts#L84
reading @ index.ts#L25
Reading @ index.ts#L26
ReadingResult @ index.ts#L27
ReadReceipt @ index.ts#L28
REPLAY_LENS @ index.ts#L135
SchemaUnsupportedError @ index.ts#L85
ShardCorruptionError @ index.ts#L86
ShardLoadError @ index.ts#L87
ShardValidationError @ index.ts#L88
StorageError @ index.ts#L89
StrandError @ index.ts#L90
SyncError @ index.ts#L91
SyncSecret @ index.ts#L111
TICK_RECEIPT_OP_TYPES @ index.ts#L115
TICK_RECEIPT_RESULT_TYPES @ index.ts#L116
tickReceiptCanonicalJson @ index.ts#L118
Timeline @ index.ts#L20
TraversalError @ index.ts#L92
Warp @ index.ts#L19
WebCryptoAdapter @ index.ts#L107
WormholeError @ index.ts#L93
WriteReceipt @ index.ts#L29
WriterError @ index.ts#L103
```

### Type exports

Source: `index.ts`. Count: 32.

```text
CasContentEncryptionDiagnostics @ index.ts#L67
CasContentEncryptionScheme @ index.ts#L68
CasResolvedVaultKeyOptions @ index.ts#L69
EdgeIntentFields @ index.ts#L32
EdgePropertyIntentFields @ index.ts#L33
IntentBuilders @ index.ts#L39
IntentDescriptor @ index.ts#L34
IntentKind @ index.ts#L35
JoinMode @ index.ts#L41
JoinOptions @ index.ts#L46
JoinPolicy @ index.ts#L46
JoinReceiptOptions @ index.ts#L42
JoinReceiptOutcome @ index.ts#L43
JoinResultOptions @ index.ts#L45
NodeIntentFields @ index.ts#L36
NodeReadingFields @ index.ts#L48
OpenWarpOptions @ index.ts#L30
OperationPolicyExecuteOptions @ index.ts#L62
OperationRetryDecision @ index.ts#L63
PropertyIntentFields @ index.ts#L37
PropertyReadingFields @ index.ts#L49
ReadingBuilders @ index.ts#L53
ReadingDescriptor @ index.ts#L50
ReadingKind @ index.ts#L51
ReadingResultOptions @ index.ts#L54
ReadingValue @ index.ts#L54
ReadReceiptOptions @ index.ts#L55
ReadReceiptOutcome @ index.ts#L55
ReceiptOutcome @ index.ts#L56
SyncRateLimitConfig @ index.ts#L112
WarpStorage @ index.ts#L30
WriteReceiptOptions @ index.ts#L56
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
| `./src/continuumExports.ts` | export * | `advanced.ts#L80` |

### Value exports

Source: `advanced.ts`. Count: 31.

```text
BoundedSupportRule @ advanced.ts#L9
CausalIndexPlan @ advanced.ts#L16
composeWormholes @ advanced.ts#L23
createWormhole @ advanced.ts#L24
deserializeWormhole @ advanced.ts#L25
LiveSelector @ advanced.ts#L29
Observer @ advanced.ts#L30
ObserverAccumulation @ advanced.ts#L31
ObserverBasis @ advanced.ts#L32
ObserverEmission @ advanced.ts#L33
ObserverPlan @ advanced.ts#L34
ObserverReadingEnvelope @ advanced.ts#L36
openAperture @ advanced.ts#L42
Optic @ advanced.ts#L45
OpticAperturePosture @ advanced.ts#L51
OpticBasisPosture @ advanced.ts#L53
OpticCoordinatePosture @ advanced.ts#L55
OpticSupportRule @ advanced.ts#L57
ProjectionHandle @ advanced.ts#L59
RejectedZKWormhole @ advanced.ts#L60
replayWormhole @ advanced.ts#L26
serializeWormhole @ advanced.ts#L27
StrandSelector @ advanced.ts#L61
SupportFragmentPlan @ advanced.ts#L62
VerifiedZKWormhole @ advanced.ts#L67
verifyZKWormhole @ advanced.ts#L43
WarpWorldlineCoordinate @ advanced.ts#L68
WarpWorldlineOpticBasis @ advanced.ts#L70
WorldlineSelector @ advanced.ts#L71
ZKWormholeEdge @ advanced.ts#L72
ZKWormholeProofVerifierPort @ advanced.ts#L78
```

### Type exports

Source: `advanced.ts`. Count: 25.

```text
Aperture @ advanced.ts#L79
ApertureOpeningVerificationResult @ advanced.ts#L75
BoundedSupportDirection @ advanced.ts#L11
BoundedSupportKind @ advanced.ts#L12
BoundedSupportRuleFields @ advanced.ts#L13
BoundedSupportSurface @ advanced.ts#L14
CausalIndexFamily @ advanced.ts#L18
CausalIndexPlanFields @ advanced.ts#L19
CausalIndexPlanPosture @ advanced.ts#L20
ObserverConfig @ advanced.ts#L79
ObserverPlanFields @ advanced.ts#L35
ObserverReadingEnvelopeBudget @ advanced.ts#L38
ObserverReadingEnvelopeFields @ advanced.ts#L39
OpticAperturePostureValue @ advanced.ts#L52
OpticBasisPostureValue @ advanced.ts#L54
OpticContextValue @ advanced.ts#L47
OpticCoordinatePostureValue @ advanced.ts#L56
OpticFields @ advanced.ts#L48
OpticPostureFields @ advanced.ts#L49
OpticSupportRuleValue @ advanced.ts#L58
SupportFragmentMaterializationPosture @ advanced.ts#L64
SupportFragmentPlanFields @ advanced.ts#L65
WarpWorldlineCoordinateFrontierEntry @ advanced.ts#L69
ZKWormholeEdgeFields @ advanced.ts#L73
ZKWormholeVerificationResult @ advanced.ts#L76
```

## Diagnostics export surface

Operator, inspection, comparison, and replay tools.

### Value exports

Source: `diagnostics.ts`. Count: 18.

```text
BisectService @ diagnostics.ts#L8
CommitDagTraversalService @ diagnostics.ts#L9
ContentAttachmentProjection @ diagnostics.ts#L10
exportCoordinateComparisonFact @ diagnostics.ts#L12
exportCoordinateTransferPlanFact @ diagnostics.ts#L13
GraphDiff @ diagnostics.ts#L15
GraphOpAlgebraProjection @ diagnostics.ts#L18
nodeIdInVisibleStateScope @ diagnostics.ts#L41
normalizeVisibleStateScope @ diagnostics.ts#L40
QueryBuilder @ diagnostics.ts#L19
scopeMaterializedState @ diagnostics.ts#L42
TtdMergeBranch @ diagnostics.ts#L20
TtdMergeFootprint @ diagnostics.ts#L22
TtdMergeInspection @ diagnostics.ts#L24
TtdMergeInspector @ diagnostics.ts#L27
TtdMergeLoweringWitness @ diagnostics.ts#L33
TtdMergeObstructionWitness @ diagnostics.ts#L35
TtdMergePolicyRequirement @ diagnostics.ts#L37
```

### Type exports

Source: `diagnostics.ts`. Count: 14.

```text
GraphDiffFields @ diagnostics.ts#L16
GraphDiffOptions @ diagnostics.ts#L17
TtdMergeBranchFields @ diagnostics.ts#L21
TtdMergeFootprintFields @ diagnostics.ts#L23
TtdMergeInspectionDomain @ diagnostics.ts#L26
TtdMergeInspectionFields @ diagnostics.ts#L25
TtdMergeLoweringSurface @ diagnostics.ts#L32
TtdMergeLoweringWitnessFields @ diagnostics.ts#L34
TtdMergeObjectBranchInput @ diagnostics.ts#L29
TtdMergeObjectInspectionInput @ diagnostics.ts#L30
TtdMergeObstructionWitnessFields @ diagnostics.ts#L36
TtdMergePolicyRequirementFields @ diagnostics.ts#L38
VisibleStateScope @ diagnostics.ts#L45
VisibleStateScopePrefixFilter @ diagnostics.ts#L46
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
