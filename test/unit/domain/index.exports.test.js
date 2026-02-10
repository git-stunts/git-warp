/**
 * Tests for the main index.js exports.
 *
 * Verifies that all expected exports are available from the package entry point,
 * supporting both ESM and CommonJS import styles.
 */

import { describe, it, expect } from 'vitest';

// Import everything from the main entry point
import WarpGraphDefault, {
  // Core classes
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
  ClockAdapter,
  PerformanceClockAdapter,
  GlobalClockAdapter,


  // Error types
  ForkError,
  WormholeError,
  IndexError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,

  // Cancellation utilities
  checkAborted,
  createTimeoutSignal,

  // WARP type creators
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createEventId,
} from '../../../index.js';

// WarpGraph is both default and named export; index.d.ts only declares
// the default, so we pull the named export via dynamic import to avoid TS2614.
const { WarpGraph } = /** @type {any} */ (await import('../../../index.js'));

describe('index.js exports', () => {
  describe('default export', () => {
    it('exports WarpGraph as default', () => {
      expect(WarpGraphDefault).toBeDefined();
      expect(typeof WarpGraphDefault).toBe('function');
      expect(WarpGraphDefault.name).toBe('WarpGraph');
    });
  });

  describe('core classes', () => {
    it('exports GitGraphAdapter', () => {
      expect(GitGraphAdapter).toBeDefined();
      expect(typeof GitGraphAdapter).toBe('function');
    });

    it('exports GraphNode', () => {
      expect(GraphNode).toBeDefined();
      expect(typeof GraphNode).toBe('function');
    });

    it('exports BitmapIndexBuilder', () => {
      expect(BitmapIndexBuilder).toBeDefined();
      expect(typeof BitmapIndexBuilder).toBe('function');
    });

    it('exports BitmapIndexReader', () => {
      expect(BitmapIndexReader).toBeDefined();
      expect(typeof BitmapIndexReader).toBe('function');
    });

    it('exports IndexRebuildService', () => {
      expect(IndexRebuildService).toBeDefined();
      expect(typeof IndexRebuildService).toBe('function');
    });

    it('exports HealthCheckService', () => {
      expect(HealthCheckService).toBeDefined();
      expect(typeof HealthCheckService).toBe('function');
    });

    it('exports HealthStatus enum', () => {
      expect(HealthStatus).toBeDefined();
      expect(HealthStatus.HEALTHY).toBe('healthy');
      expect(HealthStatus.DEGRADED).toBe('degraded');
      expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
    });

    it('exports CommitDagTraversalService', () => {
      expect(CommitDagTraversalService).toBeDefined();
      expect(typeof CommitDagTraversalService).toBe('function');
    });

    it('exports TraversalService', () => {
      expect(TraversalService).toBeDefined();
      expect(typeof TraversalService).toBe('function');
      expect(TraversalService).toBe(CommitDagTraversalService);
    });
  });

  describe('port interfaces', () => {
    it('exports GraphPersistencePort', () => {
      expect(GraphPersistencePort).toBeDefined();
      expect(typeof GraphPersistencePort).toBe('function');
    });

    it('exports IndexStoragePort', () => {
      expect(IndexStoragePort).toBeDefined();
      expect(typeof IndexStoragePort).toBe('function');
    });
  });

  describe('logging infrastructure', () => {
    it('exports LoggerPort', () => {
      expect(LoggerPort).toBeDefined();
      expect(typeof LoggerPort).toBe('function');
    });

    it('exports NoOpLogger', () => {
      expect(NoOpLogger).toBeDefined();
      expect(typeof NoOpLogger).toBe('function');
    });

    it('exports ConsoleLogger', () => {
      expect(ConsoleLogger).toBeDefined();
      expect(typeof ConsoleLogger).toBe('function');
    });

    it('exports LogLevel enum', () => {
      expect(LogLevel).toBeDefined();
      expect(LogLevel.DEBUG).toBeDefined();
      expect(LogLevel.INFO).toBeDefined();
      expect(LogLevel.WARN).toBeDefined();
      expect(LogLevel.ERROR).toBeDefined();
    });
  });

  describe('clock infrastructure', () => {
    it('exports ClockPort', () => {
      expect(ClockPort).toBeDefined();
      expect(typeof ClockPort).toBe('function');
    });

    it('exports ClockAdapter', () => {
      expect(ClockAdapter).toBeDefined();
      expect(typeof ClockAdapter).toBe('function');
    });

    it('exports PerformanceClockAdapter', () => {
      expect(PerformanceClockAdapter).toBeDefined();
      expect(typeof PerformanceClockAdapter).toBe('function');
    });

    it('exports GlobalClockAdapter', () => {
      expect(GlobalClockAdapter).toBeDefined();
      expect(typeof GlobalClockAdapter).toBe('function');
    });
  });

  describe('error types', () => {
    it('exports ForkError', () => {
      expect(ForkError).toBeDefined();
      expect(typeof ForkError).toBe('function');
    });

    it('exports WormholeError', () => {
      expect(WormholeError).toBeDefined();
      expect(typeof WormholeError).toBe('function');
    });

    it('exports IndexError', () => {
      expect(IndexError).toBeDefined();
      expect(typeof IndexError).toBe('function');
    });

    it('exports ShardLoadError', () => {
      expect(ShardLoadError).toBeDefined();
      expect(typeof ShardLoadError).toBe('function');
    });

    it('exports ShardCorruptionError', () => {
      expect(ShardCorruptionError).toBeDefined();
      expect(typeof ShardCorruptionError).toBe('function');
    });

    it('exports ShardValidationError', () => {
      expect(ShardValidationError).toBeDefined();
      expect(typeof ShardValidationError).toBe('function');
    });

    it('exports StorageError', () => {
      expect(StorageError).toBeDefined();
      expect(typeof StorageError).toBe('function');
    });

    it('exports TraversalError', () => {
      expect(TraversalError).toBeDefined();
      expect(typeof TraversalError).toBe('function');
    });

    it('exports OperationAbortedError', () => {
      expect(OperationAbortedError).toBeDefined();
      expect(typeof OperationAbortedError).toBe('function');
    });
  });

  describe('cancellation utilities', () => {
    it('exports checkAborted', () => {
      expect(checkAborted).toBeDefined();
      expect(typeof checkAborted).toBe('function');
    });

    it('exports createTimeoutSignal', () => {
      expect(createTimeoutSignal).toBeDefined();
      expect(typeof createTimeoutSignal).toBe('function');
    });
  });

  describe('multi-writer graph support (WARP)', () => {
    it('exports WarpGraph', () => {
      expect(WarpGraph).toBeDefined();
      expect(typeof WarpGraph).toBe('function');
      expect(WarpGraph.name).toBe('WarpGraph');
    });

    it('WarpGraph has static open method', () => {
      expect(typeof WarpGraph.open).toBe('function');
    });
  });

  describe('WARP type creators', () => {
    it('exports createNodeAdd', () => {
      expect(createNodeAdd).toBeDefined();
      expect(typeof createNodeAdd).toBe('function');
      const op = createNodeAdd('user:alice');
      expect(op).toEqual({ type: 'NodeAdd', node: 'user:alice' });
    });

    it('exports createNodeTombstone', () => {
      expect(createNodeTombstone).toBeDefined();
      expect(typeof createNodeTombstone).toBe('function');
      const op = createNodeTombstone('user:alice');
      expect(op).toEqual({ type: 'NodeTombstone', node: 'user:alice' });
    });

    it('exports createEdgeAdd', () => {
      expect(createEdgeAdd).toBeDefined();
      expect(typeof createEdgeAdd).toBe('function');
      const op = createEdgeAdd('user:alice', 'user:bob', 'follows');
      expect(op).toEqual({ type: 'EdgeAdd', from: 'user:alice', to: 'user:bob', label: 'follows' });
    });

    it('exports createEdgeTombstone', () => {
      expect(createEdgeTombstone).toBeDefined();
      expect(typeof createEdgeTombstone).toBe('function');
      const op = createEdgeTombstone('user:alice', 'user:bob', 'follows');
      expect(op).toEqual({ type: 'EdgeTombstone', from: 'user:alice', to: 'user:bob', label: 'follows' });
    });

    it('exports createPropSet', () => {
      expect(createPropSet).toBeDefined();
      expect(typeof createPropSet).toBe('function');
      const value = createInlineValue('Alice');
      const op = createPropSet('user:alice', 'name', value);
      expect(op).toEqual({ type: 'PropSet', node: 'user:alice', key: 'name', value: { type: 'inline', value: 'Alice' } });
    });

    // Note: createPatch (schema:1) has been removed - use createPatchV2 from WarpTypesV2

    it('exports createInlineValue', () => {
      expect(createInlineValue).toBeDefined();
      expect(typeof createInlineValue).toBe('function');
      const ref = createInlineValue('hello');
      expect(ref).toEqual({ type: 'inline', value: 'hello' });
    });

    it('exports createBlobValue', () => {
      expect(createBlobValue).toBeDefined();
      expect(typeof createBlobValue).toBe('function');
      const ref = createBlobValue('abc123def456');
      expect(ref).toEqual({ type: 'blob', oid: 'abc123def456' });
    });

    it('exports createEventId', () => {
      expect(createEventId).toBeDefined();
      expect(typeof createEventId).toBe('function');
      const eventId = createEventId({
        lamport: 5,
        writerId: 'node-1',
        patchSha: 'abc123',
        opIndex: 2,
      });
      expect(eventId).toEqual({
        lamport: 5,
        writerId: 'node-1',
        patchSha: 'abc123',
        opIndex: 2,
      });
    });
  });

  describe('usage patterns', () => {
    it('supports ESM default and named imports for WarpGraph', () => {
      // This test verifies the import syntax works
      // import WarpGraph, { WarpGraph as MWG } from 'warp';
      expect(WarpGraphDefault).toBeDefined();
      expect(WarpGraph).toBeDefined();
      expect(WarpGraphDefault).toBe(WarpGraph);
    });

    it('supports importing all WARP utilities together', () => {
      // Verify all the pieces needed for WARP usage are available
      expect(WarpGraph).toBeDefined();
      expect(createNodeAdd).toBeDefined();
      // Note: createPatch (schema:1) removed - use createPatchV2 from WarpTypesV2
    });
  });
});
