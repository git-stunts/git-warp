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
  IndexError,
  QueryError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  SyncError,
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
  IndexError,
  QueryError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  SyncError,

  // Cancellation utilities
  checkAborted,
  createTimeoutSignal,

  // Multi-writer graph support (WARP)
  WarpGraph,
  QueryBuilder,

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
};

// WarpGraph is the primary API for V7
export default WarpGraph;
