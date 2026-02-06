/**
 * @fileoverview Empty Graph - A graph database substrate using Git commits pointing to the empty tree.
 */

import GitGraphAdapter from './src/infrastructure/adapters/GitGraphAdapter.js';
import GraphNode from './src/domain/entities/GraphNode.js';
import BitmapIndexBuilder from './src/domain/services/BitmapIndexBuilder.js';
import BitmapIndexReader from './src/domain/services/BitmapIndexReader.js';
import IndexRebuildService from './src/domain/services/IndexRebuildService.js';
import HealthCheckService, { HealthStatus } from './src/domain/services/HealthCheckService.js';
import CommitDagTraversalService from './src/domain/services/CommitDagTraversalService.js';
import GraphPersistencePort from './src/ports/GraphPersistencePort.js';
import IndexStoragePort from './src/ports/IndexStoragePort.js';
import LoggerPort from './src/ports/LoggerPort.js';
import ClockPort from './src/ports/ClockPort.js';
import NoOpLogger from './src/infrastructure/adapters/NoOpLogger.js';
import ConsoleLogger, { LogLevel } from './src/infrastructure/adapters/ConsoleLogger.js';
import PerformanceClockAdapter from './src/infrastructure/adapters/PerformanceClockAdapter.js';
import GlobalClockAdapter from './src/infrastructure/adapters/GlobalClockAdapter.js';
import {
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
  WormholeError,
} from './src/domain/errors/index.js';
import { checkAborted, createTimeoutSignal } from './src/domain/utils/cancellation.js';

// Multi-writer graph support (WARP)
import WarpGraph from './src/domain/WarpGraph.js';
import {
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createEventId,
} from './src/domain/types/WarpTypes.js';
import { migrateV4toV5 } from './src/domain/services/MigrationService.js';
import QueryBuilder from './src/domain/services/QueryBuilder.js';
import ObserverView from './src/domain/services/ObserverView.js';
import { computeTranslationCost } from './src/domain/services/TranslationCost.js';
import {
  createTickReceipt,
  canonicalJson as tickReceiptCanonicalJson,
  OP_TYPES as TICK_RECEIPT_OP_TYPES,
  RESULT_TYPES as TICK_RECEIPT_RESULT_TYPES,
} from './src/domain/types/TickReceipt.js';

// Provenance payload (HOLOGRAM)
import ProvenancePayload from './src/domain/services/ProvenancePayload.js';

// Boundary Transition Records (HOLOGRAM)
import {
  createBTR,
  verifyBTR,
  replayBTR,
  serializeBTR,
  deserializeBTR,
} from './src/domain/services/BoundaryTransitionRecord.js';

// Wormhole compression (HOLOGRAM)
import {
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
} from './src/domain/services/WormholeService.js';

const TraversalService = CommitDagTraversalService;

export {
  GitGraphAdapter,
  GraphNode,
  BitmapIndexBuilder,
  BitmapIndexReader,
  IndexRebuildService,
  HealthCheckService,
  HealthStatus,
  CommitDagTraversalService,
  TraversalService,
  GraphPersistencePort,
  IndexStoragePort,

  // Logging infrastructure
  LoggerPort,
  NoOpLogger,
  ConsoleLogger,
  LogLevel,

  // Clock infrastructure
  ClockPort,
  PerformanceClockAdapter,
  GlobalClockAdapter,

  // Error types for integrity failure handling
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
  WormholeError,

  // Cancellation utilities
  checkAborted,
  createTimeoutSignal,

  // Multi-writer graph support (WARP)
  WarpGraph,
  QueryBuilder,
  ObserverView,
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
};

// WarpGraph is the primary API for V7
export default WarpGraph;
