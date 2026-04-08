/* @ts-self-types="./index.d.ts" */

/**
 * @module
 *
 * Deterministic WARP graph over Git: graph-native storage, traversal,
 * and tooling. All graph state lives as Git commits pointing to the
 * well-known empty tree — invisible to normal Git workflows, but
 * inheriting content-addressing, cryptographic integrity, and
 * distributed replication.
 *
 * @example
 * ```ts
 * import GitPlumbing from "@git-stunts/plumbing";
 * import WarpApp from "@git-stunts/git-warp";
 * import { GitGraphAdapter } from "@git-stunts/git-warp";
 *
 * const plumbing = new GitPlumbing({ cwd: "." });
 * const persistence = new GitGraphAdapter({ plumbing });
 *
 * const app = await WarpApp.open({
 *   persistence,
 *   graphName: "myGraph",
 *   writerId: "writer-1",
 * });
 *
 * const patch = await app.createPatch();
 * patch.addNode("user:alice").setProperty("user:alice", "name", "Alice");
 * await patch.commit();
 * const worldline = app.worldline();
 * const node = await worldline.getNodeProps("user:alice");
 * ```
 */

import GitGraphAdapter from './src/infrastructure/adapters/GitGraphAdapter.js';
import GraphNode from './src/domain/entities/GraphNode.js';
import BitmapIndexBuilder from './src/domain/services/index/BitmapIndexBuilder.js';
import BitmapIndexReader from './src/domain/services/index/BitmapIndexReader.js';
import IndexRebuildService from './src/domain/services/index/IndexRebuildService.js';
import HealthCheckService, { HealthStatus } from './src/domain/services/HealthCheckService.js';
import CommitDagTraversalService from './src/domain/services/dag/CommitDagTraversalService.js';
import GraphPersistencePort from './src/ports/GraphPersistencePort.js';
import IndexStoragePort from './src/ports/IndexStoragePort.js';
import LoggerPort from './src/ports/LoggerPort.js';
import ClockPort from './src/ports/ClockPort.js';
import SeekCachePort from './src/ports/SeekCachePort.js';
import InMemoryGraphAdapter from './src/infrastructure/adapters/InMemoryGraphAdapter.js';
import NoOpLogger from './src/infrastructure/adapters/NoOpLogger.js';
import ConsoleLogger, { LogLevel } from './src/infrastructure/adapters/ConsoleLogger.js';
import ClockAdapter from './src/infrastructure/adapters/ClockAdapter.js';
import {
  AuditError,
  EncryptionError,
  ForkError,
  IndexError,
  QueryError,
  PatchError,
  SchemaUnsupportedError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  SyncError,
  StrandError,
  WormholeError,
} from './src/domain/errors/index.ts';
import WriterError from './src/domain/errors/WriterError.ts';
import BlobStoragePort from './src/ports/BlobStoragePort.js';
import InMemoryBlobStorageAdapter from './src/domain/utils/defaultBlobStorage.ts';
import CryptoPort from './src/ports/CryptoPort.js';
import HttpServerPort from './src/ports/HttpServerPort.js';
import NodeCryptoAdapter from './src/infrastructure/adapters/NodeCryptoAdapter.js';
import WebCryptoAdapter from './src/infrastructure/adapters/WebCryptoAdapter.js';
import BunHttpAdapter from './src/infrastructure/adapters/BunHttpAdapter.js';
import DenoHttpAdapter from './src/infrastructure/adapters/DenoHttpAdapter.js';
import { checkAborted, createTimeoutSignal } from './src/domain/utils/cancellation.ts';

// Multi-writer graph support (WARP)
import WarpCore from './src/domain/WarpCore.js';
import WarpApp from './src/domain/WarpApp.js';
import {
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createEventId,
} from './src/domain/types/WarpTypes.ts';
import { migrateV4toV5 } from './src/domain/services/MigrationService.js';
import QueryBuilder from './src/domain/services/query/QueryBuilder.js';
import Observer from './src/domain/services/query/Observer.js';
import Worldline from './src/domain/services/Worldline.js';
import WorldlineSelector from './src/domain/types/WorldlineSelector.ts';
import LiveSelector from './src/domain/types/LiveSelector.ts';
import CoordinateSelector from './src/domain/types/CoordinateSelector.ts';
import StrandSelector from './src/domain/types/StrandSelector.ts';
import { computeTranslationCost } from './src/domain/services/TranslationCost.js';
import {
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,
} from './src/domain/services/KeyCodec.js';
import {
  createTickReceipt,
  canonicalJson as tickReceiptCanonicalJson,
  OP_TYPES as TICK_RECEIPT_OP_TYPES,
  RESULT_TYPES as TICK_RECEIPT_RESULT_TYPES,
} from './src/domain/types/TickReceipt.ts';

// Provenance payload (HOLOGRAM)
import ProvenancePayload from './src/domain/services/provenance/ProvenancePayload.js';

// Boundary Transition Records (HOLOGRAM)
import {
  createBTR,
  verifyBTR,
  replayBTR,
  serializeBTR,
  deserializeBTR,
} from './src/domain/services/provenance/BoundaryTransitionRecord.js';

// Wormhole compression (HOLOGRAM)
import {
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
} from './src/domain/services/WormholeService.js';

import BisectService from './src/domain/services/BisectService.js';
import EffectSinkPort from './src/ports/EffectSinkPort.js';
import { MultiplexSink } from './src/domain/services/MultiplexSink.js';
import { EffectPipeline } from './src/domain/services/EffectPipeline.js';
import {
  createEffectEmission,
  canonicalEmissionJson,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
} from './src/domain/types/EffectEmission.ts';
import {
  createDeliveryObservation,
  canonicalObservationJson,
} from './src/domain/types/DeliveryObservation.ts';
import {
  createExternalizationPolicy,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
} from './src/domain/types/ExternalizationPolicy.ts';
import { NoOpEffectSink } from './src/infrastructure/adapters/NoOpEffectSink.js';
import { ConsoleEffectSink } from './src/infrastructure/adapters/ConsoleEffectSink.js';
import { ChunkEffectSink } from './src/infrastructure/adapters/ChunkEffectSink.js';
import { PatchBuilderV2 } from './src/domain/services/PatchBuilderV2.js';
import { PatchSession } from './src/domain/warp/PatchSession.js';
import { Writer } from './src/domain/warp/Writer.js';
import { ProvenanceIndex } from './src/domain/services/provenance/ProvenanceIndex.js';
import WarpStateIndexBuilder, { buildWarpStateIndex } from './src/domain/services/index/WarpStateIndexBuilder.js';
import { computeStateHashV5, projectStateV5 } from './src/domain/services/state/StateSerializerV5.js';
import { createStateReaderV5 } from './src/domain/services/state/StateReaderV5.js';
import { compareVisibleStateV5 } from './src/domain/services/VisibleStateComparisonV5.js';
import {
  normalizeVisibleStateScopeV1,
  scopeMaterializedStateV5,
} from './src/domain/services/VisibleStateScopeV1.js';
import {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from './src/domain/services/CoordinateFactExport.js';

export {
  GitGraphAdapter,
  InMemoryGraphAdapter,
  GraphNode,
  BitmapIndexBuilder,
  BitmapIndexReader,
  IndexRebuildService,
  HealthCheckService,
  HealthStatus,
  CommitDagTraversalService,
  BisectService,
  GraphPersistencePort,
  IndexStoragePort,

  // Logging infrastructure
  LoggerPort,
  NoOpLogger,
  ConsoleLogger,
  LogLevel,

  // Clock infrastructure
  ClockPort,

  // Seek cache (RECALL)
  SeekCachePort,
  ClockAdapter,

  // Port contracts
  BlobStoragePort,
  InMemoryBlobStorageAdapter,
  CryptoPort,
  HttpServerPort,

  // Crypto adapters
  NodeCryptoAdapter,
  WebCryptoAdapter,

  // HTTP adapters
  BunHttpAdapter,
  DenoHttpAdapter,

  // Error types for integrity failure handling
  AuditError,
  EncryptionError,
  PatchError,
  ForkError,
  IndexError,
  QueryError,
  SchemaUnsupportedError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  SyncError,
  StrandError,
  WormholeError,
  WriterError,

  // Cancellation utilities
  checkAborted,
  createTimeoutSignal,

  // Multi-writer graph support (WARP)
  WarpApp,
  WarpCore,
  Worldline,
  WorldlineSelector,
  LiveSelector,
  CoordinateSelector,
  StrandSelector,
  QueryBuilder,
  Observer,
  PatchBuilderV2,
  PatchSession,
  Writer,
  ProvenanceIndex,
  computeTranslationCost,

  // WARP type creators
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createEventId,

  // Key codec utilities (BULKHEAD)
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,

  // State indexing & hashing
  WarpStateIndexBuilder,
  buildWarpStateIndex,
  computeStateHashV5,
  projectStateV5,
  createStateReaderV5,
  compareVisibleStateV5,
  normalizeVisibleStateScopeV1,
  scopeMaterializedStateV5,
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,

  // WARP migration
  migrateV4toV5,

  // Tick receipts (LIGHTHOUSE)
  createTickReceipt,
  tickReceiptCanonicalJson,
  TICK_RECEIPT_OP_TYPES,
  TICK_RECEIPT_RESULT_TYPES,

  // Provenance payload (HOLOGRAM)
  ProvenancePayload,

  // Boundary Transition Records (HOLOGRAM)
  createBTR,
  verifyBTR,
  replayBTR,
  serializeBTR,
  deserializeBTR,

  // Wormhole compression (HOLOGRAM)
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,

  // Effect emission & delivery observation
  EffectSinkPort,
  MultiplexSink,
  EffectPipeline,
  createEffectEmission,
  canonicalEmissionJson,
  createDeliveryObservation,
  canonicalObservationJson,
  createExternalizationPolicy,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
  NoOpEffectSink,
  ConsoleEffectSink,
  ChunkEffectSink,
};

// WarpApp is the primary product-facing API for v15.
export default WarpApp;
