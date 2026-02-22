import { describe, it, expect, vi, beforeEach } from 'vitest';
import IndexRebuildService from '../../../../src/domain/services/IndexRebuildService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

describe('IndexRebuildService', () => {
  /** @type {any} */
  let service;
  /** @type {any} */
  let mockStorage;
  /** @type {any} */
  let mockGraphService;

  beforeEach(() => {
    mockStorage = {
      writeBlob: vi.fn().mockResolvedValue('blob-oid'),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
      readTreeOids: vi.fn().mockResolvedValue({}),
      readBlob: vi.fn().mockResolvedValue(Buffer.from('{}')),
    };

    // Mock iterateNodes as an async generator
    mockGraphService = {
      async *iterateNodes(/** @type {any} */ { ref: _ref, limit: _limit }) {
        yield new GraphNode({ sha: 'sha1', author: 'test', date: '2026-01-08', message: 'msg1', parents: [] });
        yield new GraphNode({ sha: 'sha2', author: 'test', date: '2026-01-08', message: 'msg2', parents: ['sha1'] });
      }
    };

    service = new IndexRebuildService(/** @type {any} */ ({
      storage: mockStorage,
      graphService: mockGraphService,
      crypto,
    }));
  });

  describe('constructor validation', () => {
    it('throws when graphService is not provided', () => {
      expect(() => new IndexRebuildService(/** @type {any} */ ({ storage: mockStorage })))
        .toThrow('IndexRebuildService requires a graphService');
    });

    it('throws when storage is not provided', () => {
      expect(() => new IndexRebuildService(/** @type {any} */ ({ graphService: mockGraphService })))
        .toThrow('IndexRebuildService requires a storage adapter');
    });

    it('throws when called with empty options', () => {
      expect(() => new IndexRebuildService(/** @type {any} */ ({})))
        .toThrow('IndexRebuildService requires a graphService');
    });
  });

  it('rebuilds the index and persists it', async () => {
    const treeOid = await service.rebuild('main');

    // Verify blobs are written (one per shard type)
    expect(mockStorage.writeBlob).toHaveBeenCalled();
    expect(mockStorage.writeBlob.mock.calls.length).toBeGreaterThan(0);
    expect(mockStorage.writeTree).toHaveBeenCalled();
    expect(treeOid).toBe('tree-oid');
  });

  it('loads an index from a tree OID', async () => {
    const reader = await service.load('tree-oid');

    expect(mockStorage.readTreeOids).toHaveBeenCalledWith('tree-oid');
    expect(reader).toBeDefined();
    expect(typeof reader.getParents).toBe('function');
    expect(typeof reader.getChildren).toBe('function');
  });

  // Testing _persistIndex directly to verify shard file creation without full rebuild overhead
  it('persists index from builder to storage', async () => {
    // Create a minimal builder with known data
    const BitmapIndexBuilder = (await import('../../../../src/domain/services/BitmapIndexBuilder.js')).default;
    const builder = new BitmapIndexBuilder();
    builder.registerNode('aabbccdd');
    builder.addEdge('aabbccdd', 'eeffgghh');

    const treeOid = await service._persistIndex(builder);

    // Verify blobs were written for each shard
    expect(mockStorage.writeBlob).toHaveBeenCalled();
    // Should have meta shards and edge shards
    const blobCalls = mockStorage.writeBlob.mock.calls;
    expect(blobCalls.length).toBeGreaterThanOrEqual(2);

    // Verify tree was created with all entries
    expect(mockStorage.writeTree).toHaveBeenCalledTimes(1);
    const treeEntries = mockStorage.writeTree.mock.calls[0][0];
    expect(treeEntries.length).toBeGreaterThanOrEqual(2);
    expect(treeEntries.every((/** @type {any} */ e) => e.startsWith('100644 blob'))).toBe(true);

    expect(treeOid).toBe('tree-oid');
  });

  describe('rebuild validation', () => {
    it('throws when maxMemoryBytes is zero', async () => {
      await expect(service.rebuild('main', { maxMemoryBytes: 0 }))
        .rejects.toThrow('maxMemoryBytes must be a positive number');
    });

    it('throws when maxMemoryBytes is negative', async () => {
      await expect(service.rebuild('main', { maxMemoryBytes: -100 }))
        .rejects.toThrow('maxMemoryBytes must be a positive number');
    });

    it('accepts positive maxMemoryBytes', async () => {
      const treeOid = await service.rebuild('main', { maxMemoryBytes: 1024 });
      expect(treeOid).toBe('tree-oid');
    });
  });

  describe('integrity verification', () => {
    it('load() uses strict mode by default', async () => {
      const reader = await service.load('tree-oid');
      expect(reader.strict).toBe(true);
    });

    it('load() allows non-strict mode via option', async () => {
      const reader = await service.load('tree-oid', { strict: false });
      expect(reader.strict).toBe(false);
    });

    it('strict mode throws ShardValidationError on checksum mismatch', async () => {
      // Mock storage to return shard with wrong checksum
      mockStorage.readTreeOids.mockResolvedValue({
        'meta_ab.json': 'badcbadcbadcbadcbadcbadcbadcbadcbadcbadc'
      });
      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify({
        version: 1,
        checksum: 'wrong-checksum',
        data: { 'ab123456': 0 }
      })));

      const reader = await service.load('tree-oid');

      // Import error type
      const { ShardValidationError } = await import('../../../../src/domain/errors/index.js');

      await expect(reader.lookupId('ab123456')).rejects.toThrow(ShardValidationError);
    });

    it('strict mode throws ShardCorruptionError on invalid format', async () => {
      mockStorage.readTreeOids.mockResolvedValue({
        'meta_ab.json': 'c0aac0aac0aac0aac0aac0aac0aac0aac0aac0aa'
      });
      mockStorage.readBlob.mockResolvedValue(Buffer.from('not valid json'));

      const reader = await service.load('tree-oid');

      const { ShardCorruptionError } = await import('../../../../src/domain/errors/index.js');

      await expect(reader.lookupId('ab123456')).rejects.toThrow(ShardCorruptionError);
    });

    it('non-strict mode returns empty on integrity failure instead of throwing', async () => {
      mockStorage.readTreeOids.mockResolvedValue({
        'meta_ab.json': 'bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0'
      });
      mockStorage.readBlob.mockResolvedValue(Buffer.from('invalid'));

      const reader = await service.load('tree-oid', { strict: false });

      // Should not throw, returns undefined for unknown ID
      const id = await reader.lookupId('ab123456');
      expect(id).toBeUndefined();
    });
  });
});
