/**
 * Tests for the main index.js exports.
 *
 * Verifies that all expected exports are available from the package entry point,
 * supporting both ESM and CommonJS import styles.
 */

import { describe, it, expect } from 'vitest';

// Import everything from the main entry point
import WarpAppDefault, {
  WarpApp,
  WarpCore,
  WarpRuntime,
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
  Observer,

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
  createStateReaderV5,
  compareVisibleStateV5,
  normalizeVisibleStateScopeV1,
  scopeMaterializedStateV5,
} from '../../../index.js';

const { WarpGraph, Worldline, ObserverView } = /** @type {any} */ (await import('../../../index.js'));

describe('index.js exports', () => {
  describe('default export', () => {
    it('exports WarpApp as default', () => {
      expect(WarpAppDefault).toBeDefined();
      expect(typeof WarpAppDefault).toBe('function');
      expect(WarpAppDefault).toBe(WarpApp);
      expect(WarpAppDefault.name).toBe('WarpApp');
    });
  });

  describe('runtime exports', () => {
    it('exports WarpApp as a named export', () => {
      expect(WarpApp).toBeDefined();
      expect(typeof WarpApp).toBe('function');
      expect(WarpApp).toBe(WarpAppDefault);
    });

    it('exports WarpCore as the full plumbing-facing surface', () => {
      expect(WarpCore).toBeDefined();
      expect(typeof WarpCore).toBe('function');
      expect(WarpCore.name).toBe('WarpCore');
    });

    it('keeps WarpRuntime as a compatibility alias to WarpCore', () => {
      expect(WarpRuntime).toBeDefined();
      expect(typeof WarpRuntime).toBe('function');
      expect(WarpRuntime).toBe(WarpCore);
    });

    it('does not export WarpGraph as a public compatibility alias', () => {
      expect(WarpGraph).toBeUndefined();
    });
  });

  describe('visible-state helpers', () => {
    it('exports normalizeVisibleStateScopeV1', () => {
      expect(normalizeVisibleStateScopeV1).toBeDefined();
      expect(typeof normalizeVisibleStateScopeV1).toBe('function');
    });

    it('exports scopeMaterializedStateV5', () => {
      expect(scopeMaterializedStateV5).toBeDefined();
      expect(typeof scopeMaterializedStateV5).toBe('function');
    });
  });

  describe('core classes', () => {
    it('exports Worldline', () => {
      expect(Worldline).toBeDefined();
      expect(typeof Worldline).toBe('function');
    });

    it('exports Observer', () => {
      expect(Observer).toBeDefined();
      expect(typeof Observer).toBe('function');
      expect(Observer.name).toBe('Observer');
      expect(ObserverView).toBeUndefined();
    });

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
    it('exports WarpRuntime as a compatibility alias from the main entry point', () => {
      expect(WarpRuntime).toBeDefined();
      expect(typeof WarpRuntime).toBe('function');
      expect(WarpRuntime).toBe(WarpCore);
    });

    it('WarpRuntime has static open method', () => {
      expect(typeof WarpRuntime.open).toBe('function');
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

    it('exports createStateReaderV5', () => {
      expect(createStateReaderV5).toBeDefined();
      expect(typeof createStateReaderV5).toBe('function');
    });

    it('exports compareVisibleStateV5', () => {
      expect(compareVisibleStateV5).toBeDefined();
      expect(typeof compareVisibleStateV5).toBe('function');
    });
  });

  describe('usage patterns', () => {
    it('supports ESM default and named imports for WarpApp/WarpCore', () => {
      // This test verifies the import syntax works
      // import WarpApp, { WarpCore } from 'warp';
      expect(WarpAppDefault).toBeDefined();
      expect(WarpApp).toBeDefined();
      expect(WarpCore).toBeDefined();
      expect(WarpAppDefault).toBe(WarpApp);
    });

    it('supports importing all WARP utilities together', () => {
      // Verify all the pieces needed for WARP usage are available
      expect(WarpApp).toBeDefined();
      expect(WarpCore).toBeDefined();
      expect(createNodeAdd).toBeDefined();
      // Note: createPatch (schema:1) removed - use createPatchV2 from WarpTypesV2
    });
  });
});
