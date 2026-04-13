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

import GitGraphAdapter from './src/infrastructure/adapters/GitGraphAdapter.ts';
import GraphNode from './src/domain/entities/GraphNode.ts';
import BitmapIndexBuilder from './src/domain/services/index/BitmapIndexBuilder.js';
import BitmapIndexReader from './src/domain/services/index/BitmapIndexReader.js';
import IndexRebuildService from './src/domain/services/index/IndexRebuildService.js';
import HealthCheckService, { HealthStatus } from './src/domain/services/HealthCheckService.ts';
import CommitDagTraversalService from './src/domain/services/dag/CommitDagTraversalService.ts';
import GraphPersistencePort from './src/ports/GraphPersistencePort.ts';
import IndexStoragePort from './src/ports/IndexStoragePort.ts';
import LoggerPort from './src/ports/LoggerPort.ts';
import ClockPort from './src/ports/ClockPort.ts';
import SeekCachePort from './src/ports/SeekCachePort.ts';
import InMemoryGraphAdapter from './src/infrastructure/adapters/InMemoryGraphAdapter.ts';
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
import BlobStoragePort from './src/ports/BlobStoragePort.ts';
import InMemoryBlobStorageAdapter from './src/domain/utils/defaultBlobStorage.ts';
import CryptoPort from './src/ports/CryptoPort.ts';
import HttpServerPort from './src/ports/HttpServerPort.ts';
import NodeCryptoAdapter from './src/infrastructure/adapters/NodeCryptoAdapter.js';
import WebCryptoAdapter from './src/infrastructure/adapters/WebCryptoAdapter.js';
import BunHttpAdapter from './src/infrastructure/adapters/BunHttpAdapter.js';
import DenoHttpAdapter from './src/infrastructure/adapters/DenoHttpAdapter.js';
import { checkAborted, createTimeoutSignal } from './src/domain/utils/cancellation.ts';

// Multi-writer graph support (WARP)
import WarpCore from './src/domain/WarpCore.ts';
import WarpApp from './src/domain/WarpApp.ts';
// V1 op factories — inlined after WarpTypes.ts deletion (deprecated, kept for backward compat)
/** @param {string} node */
function createNodeAdd(node) { return { type: 'NodeAdd', node }; }
/** @param {string} node */
function createNodeTombstone(node) { return { type: 'NodeTombstone', node }; }
/** @param {string} from @param {string} to @param {string} label */
function createEdgeAdd(from, to, label) { return { type: 'EdgeAdd', from, to, label }; }
/** @param {string} from @param {string} to @param {string} label */
function createEdgeTombstone(from, to, label) { return { type: 'EdgeTombstone', from, to, label }; }
/** @param {string} node @param {string} key @param {{ type: 'inline', value: unknown } | { type: 'blob', oid: string }} value */
function createPropSet(node, key, value) { return { type: 'PropSet', node, key, value }; }
/** @param {unknown} value */
function createInlineValue(value) { return { type: 'inline', value }; }
/** @param {string} oid */
function createBlobValue(oid) { return { type: 'blob', oid }; }
import { migrateV4toV5 } from './src/domain/services/MigrationService.ts';
import QueryBuilder from './src/domain/services/query/QueryBuilder.js';
import Observer from './src/domain/services/query/Observer.js';
import Worldline from './src/domain/services/Worldline.ts';
import WorldlineSelector from './src/domain/types/WorldlineSelector.ts';
import LiveSelector from './src/domain/types/LiveSelector.ts';
import CoordinateSelector from './src/domain/types/CoordinateSelector.ts';
import StrandSelector from './src/domain/types/StrandSelector.ts';
import { computeTranslationCost } from './src/domain/services/TranslationCost.ts';
import {
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,
} from './src/domain/services/KeyCodec.ts';
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
} from './src/domain/services/provenance/btrOperations.ts';
import { BTR } from './src/domain/services/provenance/BTR.ts';

// Wormhole compression (HOLOGRAM)
import {
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
} from './src/domain/services/WormholeService.ts';

import BisectService from './src/domain/services/BisectService.ts';
import EffectSinkPort from './src/ports/EffectSinkPort.ts';
import { MultiplexSink } from './src/domain/services/MultiplexSink.ts';
import { EffectPipeline } from './src/domain/services/EffectPipeline.ts';
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
import { openWarpGraph } from './src/domain/WarpGraph.ts';
import { PatchBuilder } from './src/domain/services/PatchBuilder.ts';
import { PatchSession } from './src/domain/warp/PatchSession.ts';
import { Writer } from './src/domain/warp/Writer.ts';
import { ProvenanceIndex } from './src/domain/services/provenance/ProvenanceIndex.js';
import WarpStateIndexBuilder, { buildWarpStateIndex } from './src/domain/services/index/WarpStateIndexBuilder.js';
import { computeStateHash, projectState } from './src/domain/services/state/StateSerializer.js';
import { createStateReader } from './src/domain/services/state/StateReader.js';
import { compareVisibleState } from './src/domain/services/comparison/VisibleStateComparison.ts';
import {
  normalizeVisibleStateScope,
  scopeMaterializedState,
} from './src/domain/services/VisibleStateScope.ts';
import {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from './src/domain/services/CoordinateFactExport.ts';

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

  // Multi-writer graph — admission architecture entry point
  openWarpGraph,

  // Multi-writer graph support (legacy — prefer openWarpGraph)
  WarpApp,
  WarpCore,
  Worldline,
  WorldlineSelector,
  LiveSelector,
  CoordinateSelector,
  StrandSelector,
  QueryBuilder,
  Observer,
  PatchBuilder,
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

  // Key codec utilities (BULKHEAD)
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,

  // State indexing & hashing
  WarpStateIndexBuilder,
  buildWarpStateIndex,
  computeStateHash,
  projectState,
  createStateReader,
  compareVisibleState,
  normalizeVisibleStateScope,
  scopeMaterializedState,
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
  BTR,
  createBTR,
  verifyBTR,
  replayBTR,

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
