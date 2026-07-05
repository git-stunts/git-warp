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

## Root API export modules

| Module | Kind | Source |
| --- | --- | --- |
| `./src/domain/memory/index.ts` | export * | `index.ts#L17` |

## Root API value exports

Source: `index.ts`. Count: 65.

```text
AlfredOperationPolicyAdapter @ index.ts#L30
AuditError @ index.ts#L33
BitmapIndexBuilder @ index.ts#L57
BitmapIndexReader @ index.ts#L58
BlobStoragePort @ index.ts#L63
BunHttpAdapter @ index.ts#L69
canonicalEmissionJson @ index.ts#L85
canonicalObservationJson @ index.ts#L91
CasContentEncryptionPolicy @ index.ts#L24
checkAborted @ index.ts#L71
ChunkEffectSink @ index.ts#L101
ConsoleEffectSink @ index.ts#L100
ConsoleLogger @ index.ts#L61
ContinuumArtifactAuthorityError @ index.ts#L34
createDeliveryObservation @ index.ts#L90
createEffectEmission @ index.ts#L84
createExternalizationPolicy @ index.ts#L94
createTickReceipt @ index.ts#L75
createTimeoutSignal @ index.ts#L71
CryptoPort @ index.ts#L65
DELIVERY_MODES @ index.ts#L86
DELIVERY_OUTCOMES @ index.ts#L87
DenoHttpAdapter @ index.ts#L70
EffectPipeline @ index.ts#L82
EffectSinkPort @ index.ts#L80
EncryptionError @ index.ts#L35
ForkError @ index.ts#L36
HealthCheckService @ index.ts#L55
HealthStatus @ index.ts#L55
HttpServerPort @ index.ts#L66
IndexError @ index.ts#L37
IndexRebuildService @ index.ts#L56
InMemoryBlobStorageAdapter @ index.ts#L64
INSPECT_LENS @ index.ts#L97
LIVE_LENS @ index.ts#L95
LoggerPort @ index.ts#L59
LogLevel @ index.ts#L61
MemoryBudgetError @ index.ts#L38
MultiplexSink @ index.ts#L81
NodeCryptoAdapter @ index.ts#L67
NoOpEffectSink @ index.ts#L99
NoOpLogger @ index.ts#L60
NoopOperationPolicyAdapter @ index.ts#L31
OperationAbortedError @ index.ts#L39
OperationPolicyExhaustedError @ index.ts#L40
OperationPolicyPort @ index.ts#L19
OperationPolicyTimeoutError @ index.ts#L41
PatchError @ index.ts#L42
QueryError @ index.ts#L43
REPLAY_LENS @ index.ts#L96
SchemaUnsupportedError @ index.ts#L44
ShardCorruptionError @ index.ts#L45
ShardLoadError @ index.ts#L46
ShardValidationError @ index.ts#L47
StorageError @ index.ts#L48
StrandError @ index.ts#L49
SyncError @ index.ts#L50
SyncSecret @ index.ts#L72
TICK_RECEIPT_OP_TYPES @ index.ts#L77
TICK_RECEIPT_RESULT_TYPES @ index.ts#L78
tickReceiptCanonicalJson @ index.ts#L76
TraversalError @ index.ts#L51
WebCryptoAdapter @ index.ts#L68
WormholeError @ index.ts#L52
WriterError @ index.ts#L62
```

## Root API type exports

Source: `index.ts`. Count: 6.

```text
CasContentEncryptionDiagnostics @ index.ts#L26
CasContentEncryptionScheme @ index.ts#L27
CasResolvedVaultKeyOptions @ index.ts#L28
OperationPolicyExecuteOptions @ index.ts#L21
OperationRetryDecision @ index.ts#L22
SyncRateLimitConfig @ index.ts#L73
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
