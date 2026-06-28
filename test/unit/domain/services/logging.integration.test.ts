import { describe, it, expect, vi, beforeEach } from 'vitest';
import IndexRebuildService from '../../../../src/domain/services/index/IndexRebuildService.ts';
import BitmapIndexReader from '../../../../src/domain/services/index/BitmapIndexReader.ts';
import GraphNode from '../../../../src/domain/entities/GraphNode.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MockStreamingIndexStorage from '../../../helpers/MockStreamingIndexStorage.ts';

const crypto = new NodeCryptoAdapter();

/**
 * Creates a mock logger that tracks all calls.
 */
/** @returns {any} */
function createMockLogger() {
  const calls: { debug: any[]; info: any[]; warn: any[]; error: any[]; child: any[] } = {
    debug: [],
    info: [],
    warn: [],
    error: [],
    child: [],
  };

  const createLogger = (parentCalls = calls) => ({
    debug: vi.fn((msg, ctx) => parentCalls['debug'].push({ msg, ctx })),
    info: vi.fn((msg, ctx) => parentCalls['info'].push({ msg, ctx })),
    warn: vi.fn((msg, ctx) => parentCalls['warn'].push({ msg, ctx })),
    error: vi.fn((msg, ctx) => parentCalls['error'].push({ msg, ctx })),
    child: vi.fn((ctx) => {
      parentCalls['child'].push({ ctx });
      return createLogger(parentCalls);
    }),
    _calls: parentCalls,
  });

  return createLogger();
}

describe('Service Logging Integration', () => {
  describe('IndexRebuildService', () => {
        let mockGraphService;
        let mockStorage;
        let mockLogger;

    beforeEach(() => {
      mockGraphService = {
        iterateNodes: vi.fn().mockImplementation(async function* () {
          yield new GraphNode({ sha: 'sha1', message: 'msg1', parents: [] });
          yield new GraphNode({ sha: 'sha2', message: 'msg2', parents: ['sha1'] });
        })
      };
      mockStorage = new MockStreamingIndexStorage();
      mockStorage.writeBlob.mockResolvedValue('blob-oid');
      mockStorage.writeTree.mockResolvedValue('tree-oid');
      mockStorage.readTreeOids.mockResolvedValue({ 'meta_ab.json': 'aaa1bbb2ccc3ddd4eee5fff6aaa1bbb2ccc3ddd4' });
      mockLogger = createMockLogger();
    });

    describe('rebuild', () => {
      it('logs info at start and completion', async () => {
        const service = new IndexRebuildService((({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger,
          codec: defaultCodec,
        }) as any));

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
        // durationMs removed — timing no longer tracked in domain services
      });

      it('propagates errors from iterateNodes', async () => {
        mockGraphService.iterateNodes = vi.fn().mockImplementation(async function* () {
          yield new GraphNode({ sha: 'dummy', message: 'dummy', parents: [] });
          throw new Error('Graph error');
        });

        const service = new IndexRebuildService((({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger,
          codec: defaultCodec,
        }) as any));

        await expect(service.rebuild('HEAD')).rejects.toThrow('Graph error');
      });

      it('indicates streaming mode in logs', async () => {
        const service = new IndexRebuildService((({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger,
          codec: defaultCodec,
        }) as any));

        await service.rebuild('HEAD', { maxMemoryBytes: 1024 * 1024 });

        const startLog = mockLogger._calls.info[0];
        expect(startLog.ctx.mode).toBe('streaming');
        expect(startLog.ctx.maxMemoryBytes).toBe(1024 * 1024);
      });
    });

    describe('load', () => {
      it('logs debug on load', async () => {
        const service = new IndexRebuildService((({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger,
          codec: defaultCodec,
        }) as any));

        await service.load('tree-oid');

        expect(mockLogger._calls.debug.length).toBe(2);

        const startLog = mockLogger._calls.debug[0];
        expect(startLog.msg).toBe('Loading index');
        expect(startLog.ctx.treeOid).toBe('tree-oid');

        const endLog = mockLogger._calls.debug[1];
        expect(endLog.msg).toBe('Index loaded');
        expect(endLog.ctx.shardCount).toBe(1);
        // durationMs removed — timing no longer tracked in domain services
      });

      it('creates child logger for BitmapIndexReader', async () => {
        const service = new IndexRebuildService((({
          graphService: mockGraphService,
          storage: mockStorage,
          logger: mockLogger,
          codec: defaultCodec,
        }) as any));

        await service.load('tree-oid');

        expect(mockLogger._calls.child.length).toBe(1);
        expect(mockLogger._calls.child[0].ctx.component).toBe('BitmapIndexReader');
      });
    });
  });

  describe('BitmapIndexReader', () => {
        let mockStorage;
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

        const reader = new BitmapIndexReader((({
          storage: mockStorage,
          strict: false,
          logger: mockLogger,
          crypto,
        }) as any));
        reader.setup({ 'meta_sh.cbor': 'aaa1bbb2ccc3ddd4eee5fff6aaa7bbb8ccc9ddd0' });

        const id = await reader.lookupId('sha123');

        // Should return empty due to validation failure
        expect(id).toBeUndefined();

        // Should have logged the warning
        expect(mockLogger._calls.warn.length).toBe(1);
        const logEntry = mockLogger._calls.warn[0];
        expect(logEntry.ctx.operation).toBe('loadShard');
        expect(logEntry.ctx.shardPath).toBe('meta_sh.cbor');
      });
    });
  });
});
