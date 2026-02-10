import { describe, it, expect, vi, beforeEach } from 'vitest';
import IndexRebuildService from '../../../../src/domain/services/IndexRebuildService.js';
import BitmapIndexReader from '../../../../src/domain/services/BitmapIndexReader.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

/**
 * Creates a mock logger that tracks all calls.
 */
/** @returns {any} */
function createMockLogger() {
  /** @type {Record<string, any[]>} */
  const calls = {
    debug: [],
    info: [],
    warn: [],
    error: [],
    child: [],
  };

  const createLogger = (parentCalls = calls) => ({
    debug: vi.fn((msg, ctx) => parentCalls.debug.push({ msg, ctx })),
    info: vi.fn((msg, ctx) => parentCalls.info.push({ msg, ctx })),
    warn: vi.fn((msg, ctx) => parentCalls.warn.push({ msg, ctx })),
    error: vi.fn((msg, ctx) => parentCalls.error.push({ msg, ctx })),
    child: vi.fn((ctx) => {
      parentCalls.child.push({ ctx });
      return createLogger(parentCalls);
    }),
    _calls: parentCalls,
  });

  return createLogger();
}

describe('Service Logging Integration', () => {
  describe('IndexRebuildService', () => {
    /** @type {any} */
    /** @type {any} */
    let mockGraphService;
    /** @type {any} */
    /** @type {any} */
    let mockStorage;
    /** @type {any} */
    /** @type {any} */
    let mockLogger;

    beforeEach(() => {
      mockGraphService = {
        iterateNodes: vi.fn().mockImplementation(async function* () {
          yield new GraphNode({ sha: 'sha1', message: 'msg1', parents: [] });
          yield new GraphNode({ sha: 'sha2', message: 'msg2', parents: ['sha1'] });
        })
      };
      mockStorage = {
        writeBlob: vi.fn().mockResolvedValue('blob-oid'),
        writeTree: vi.fn().mockResolvedValue('tree-oid'),
        readTreeOids: vi.fn().mockResolvedValue({ 'meta_ab.json': 'meta-oid' }),
      };
      mockLogger = createMockLogger();
    });

    describe('rebuild', () => {
      it('logs info at start and completion', async () => {
        const service = new IndexRebuildService(/** @type {any} */ ({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger
        }));

        await service.rebuild('HEAD');

        expect(mockLogger._calls.info.length).toBe(2);

        const startLog = mockLogger._calls.info[0];
        expect(startLog.msg).toBe('Starting index rebuild');
        expect(startLog.ctx.operation).toBe('rebuild');
        expect(startLog.ctx.ref).toBe('HEAD');
        expect(startLog.ctx.mode).toBe('in-memory');

        const endLog = mockLogger._calls.info[1];
        expect(endLog.msg).toBe('Index rebuild complete');
        expect(endLog.ctx.treeOid).toBe('tree-oid');
        expect(endLog.ctx.durationMs).toBeDefined();
      });

      it('logs error on failure', async () => {
        mockGraphService.iterateNodes = vi.fn().mockImplementation(async function* () {
          yield new GraphNode({ sha: 'dummy', message: 'dummy', parents: [] });
          throw new Error('Graph error');
        });

        const service = new IndexRebuildService(/** @type {any} */ ({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger
        }));

        await expect(service.rebuild('HEAD')).rejects.toThrow('Graph error');

        expect(mockLogger._calls.error.length).toBe(1);
        const logEntry = mockLogger._calls.error[0];
        expect(logEntry.msg).toBe('Index rebuild failed');
        expect(logEntry.ctx.error).toBe('Graph error');
      });

      it('indicates streaming mode in logs', async () => {
        const service = new IndexRebuildService(/** @type {any} */ ({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger
        }));

        await service.rebuild('HEAD', { maxMemoryBytes: 1024 * 1024 });

        const startLog = mockLogger._calls.info[0];
        expect(startLog.ctx.mode).toBe('streaming');
        expect(startLog.ctx.maxMemoryBytes).toBe(1024 * 1024);
      });
    });

    describe('load', () => {
      it('logs debug on load', async () => {
        const service = new IndexRebuildService(/** @type {any} */ ({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger
        }));

        await service.load('tree-oid');

        expect(mockLogger._calls.debug.length).toBe(2);

        const startLog = mockLogger._calls.debug[0];
        expect(startLog.msg).toBe('Loading index');
        expect(startLog.ctx.treeOid).toBe('tree-oid');

        const endLog = mockLogger._calls.debug[1];
        expect(endLog.msg).toBe('Index loaded');
        expect(endLog.ctx.shardCount).toBe(1);
        expect(endLog.ctx.durationMs).toBeDefined();
      });

      it('creates child logger for BitmapIndexReader', async () => {
        const service = new IndexRebuildService(/** @type {any} */ ({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger
        }));

        await service.load('tree-oid');

        expect(mockLogger._calls.child.length).toBe(1);
        expect(mockLogger._calls.child[0].ctx.component).toBe('BitmapIndexReader');
      });
    });
  });

  describe('BitmapIndexReader', () => {
    /** @type {any} */
    /** @type {any} */
    let mockStorage;
    /** @type {any} */
    /** @type {any} */
    let mockLogger;

    beforeEach(() => {
      mockStorage = {
        readBlob: vi.fn().mockRejectedValue(new Error('Blob not found')),
      };
      mockLogger = createMockLogger();
    });

    describe('validation warnings', () => {
      it('logs warn on validation failure in non-strict mode', async () => {
        // Create a shard with invalid checksum
        mockStorage.readBlob = vi.fn().mockResolvedValue(
          Buffer.from(JSON.stringify({
            version: 1,
            checksum: 'invalid-checksum',
            data: { sha123: 42 }
          }))
        );

        const reader = new BitmapIndexReader(/** @type {any} */ ({
          storage: mockStorage,
          strict: false,
          logger: mockLogger,
          crypto,
        }));
        reader.setup({ 'meta_sh.json': 'blob-oid' });

        const id = await reader.lookupId('sha123');

        // Should return empty due to validation failure
        expect(id).toBeUndefined();

        // Should have logged the warning
        expect(mockLogger._calls.warn.length).toBe(1);
        const logEntry = mockLogger._calls.warn[0];
        expect(logEntry.ctx.operation).toBe('loadShard');
        expect(logEntry.ctx.shardPath).toBe('meta_sh.json');
      });
    });
  });
});
