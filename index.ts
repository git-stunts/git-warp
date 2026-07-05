/**
 * @module
 *
 * Public v19 application boundary.
 *
 * Root users should write intents, read timelines, and keep receipts. The
 * graph-first compatibility surface is deprecated and isolated under
 * `@git-stunts/git-warp/legacy` for migration-only use.
 * Storage adapters live under `@git-stunts/git-warp/storage`; formal read,
 * evidence, and support machinery lives under `@git-stunts/git-warp/advanced`;
 * operator inspection tools live under `@git-stunts/git-warp/diagnostics`.
 */

import { installDefaultRuntimeHostNodePorts } from './src/application/RuntimeHostNodeDefaults.ts';

installDefaultRuntimeHostNodePorts();

export * from './src/domain/memory/index.ts';

export { default as OperationPolicyPort } from './src/ports/OperationPolicyPort.ts';
export type {
  OperationPolicyExecuteOptions,
  OperationRetryDecision,
} from './src/ports/OperationPolicyPort.ts';
export { default as CasContentEncryptionPolicy } from './src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
export type {
  CasContentEncryptionDiagnostics,
  CasContentEncryptionScheme,
  CasResolvedVaultKeyOptions,
} from './src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
export { default as AlfredOperationPolicyAdapter } from './src/infrastructure/adapters/AlfredOperationPolicyAdapter.ts';
export { default as NoopOperationPolicyAdapter } from './src/infrastructure/adapters/NoopOperationPolicyAdapter.ts';
export {
  AuditError,
  ContinuumArtifactAuthorityError,
  EncryptionError,
  ForkError,
  IndexError,
  MemoryBudgetError,
  OperationAbortedError,
  OperationPolicyExhaustedError,
  OperationPolicyTimeoutError,
  PatchError,
  QueryError,
  SchemaUnsupportedError,
  ShardCorruptionError,
  ShardLoadError,
  ShardValidationError,
  StorageError,
  StrandError,
  SyncError,
  TraversalError,
  WormholeError,
} from './src/domain/errors/index.ts';

export { default as HealthCheckService, HealthStatus } from './src/domain/services/HealthCheckService.ts';
export { default as IndexRebuildService } from './src/domain/services/index/IndexRebuildService.ts';
export { default as BitmapIndexBuilder } from './src/domain/services/index/BitmapIndexBuilder.ts';
export { default as BitmapIndexReader } from './src/domain/services/index/BitmapIndexReader.ts';
export { default as LoggerPort } from './src/ports/LoggerPort.ts';
export { default as NoOpLogger } from './src/infrastructure/adapters/NoOpLogger.ts';
export { default as ConsoleLogger, LogLevel } from './src/infrastructure/adapters/ConsoleLogger.ts';
export { default as WriterError } from './src/domain/errors/WriterError.ts';
export { default as BlobStoragePort } from './src/ports/BlobStoragePort.ts';
export { default as InMemoryBlobStorageAdapter } from './src/domain/utils/defaultBlobStorage.ts';
export { default as CryptoPort } from './src/ports/CryptoPort.ts';
export { default as HttpServerPort } from './src/ports/HttpServerPort.ts';
export { default as NodeCryptoAdapter } from './src/infrastructure/adapters/NodeCryptoAdapter.ts';
export { default as WebCryptoAdapter } from './src/infrastructure/adapters/WebCryptoAdapter.ts';
export { default as BunHttpAdapter } from './src/infrastructure/adapters/BunHttpAdapter.ts';
export { default as DenoHttpAdapter } from './src/infrastructure/adapters/DenoHttpAdapter.ts';
export { checkAborted, createTimeoutSignal } from './src/domain/utils/cancellation.ts';
export { default as SyncSecret } from './src/domain/services/sync/SyncSecret.ts';
export type { SyncRateLimitConfig } from './src/domain/services/sync/SyncRateLimiter.ts';
export {
  createTickReceipt,
  canonicalJson as tickReceiptCanonicalJson,
  OP_TYPES as TICK_RECEIPT_OP_TYPES,
  RESULT_TYPES as TICK_RECEIPT_RESULT_TYPES,
} from './src/domain/types/TickReceipt.ts';
export { default as EffectSinkPort } from './src/ports/EffectSinkPort.ts';
export { MultiplexSink } from './src/domain/services/MultiplexSink.ts';
export { EffectPipeline } from './src/domain/services/EffectPipeline.ts';
export {
  createEffectEmission,
  canonicalEmissionJson,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
} from './src/domain/types/EffectEmission.ts';
export {
  createDeliveryObservation,
  canonicalObservationJson,
} from './src/domain/types/DeliveryObservation.ts';
export {
  createExternalizationPolicy,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
} from './src/domain/types/ExternalizationPolicy.ts';
export { NoOpEffectSink } from './src/infrastructure/adapters/NoOpEffectSink.ts';
export { ConsoleEffectSink } from './src/infrastructure/adapters/ConsoleEffectSink.ts';
export { ChunkEffectSink } from './src/infrastructure/adapters/ChunkEffectSink.ts';
