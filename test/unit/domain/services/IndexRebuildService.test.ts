import { describe, it, expect, vi, beforeEach } from 'vitest';
import IndexRebuildService from '../../../../src/domain/services/index/IndexRebuildService.ts';
import GraphNode from '../../../../src/domain/entities/GraphNode.ts';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.ts';
import MockStreamingIndexStorage from '../../../helpers/MockStreamingIndexStorage.ts';

const ROOT_SHA = 'a'.repeat(40);
const CHILD_SHA = 'b'.repeat(40);
const GRANDCHILD_SHA = 'c'.repeat(40);

function createReadableIndexHarness() {
  const storage = new MockStreamingIndexStorage();
  const graphService = {
    async *iterateNodes() {
      yield { sha: ROOT_SHA, parents: [] };
      yield { sha: CHILD_SHA, parents: [ROOT_SHA] };
      yield { sha: GRANDCHILD_SHA, parents: [CHILD_SHA] };
    },
  };
  const indexService = new IndexRebuildService({
    storage,
    graphService,
  });
  return { indexService, storage };
}

describe('IndexRebuildService', () => {
    let service;
    let mockStorage;
    let mockGraphService;

  beforeEach(() => {
    mockStorage = new MockStreamingIndexStorage();
    mockStorage.writeTree.mockResolvedValue('tree-oid');
    mockStorage.readTreeOids.mockResolvedValue({});
    mockStorage.readBlob.mockResolvedValue(Buffer.from('{}'));

    // Mock iterateNodes as an async generator
    mockGraphService = {
      async *iterateNodes(/** @type {any} */ { ref: _ref, limit: _limit }) {
        yield new GraphNode({ sha: 'sha1', author: 'test', date: '2026-01-08', message: 'msg1', parents: [] });
        yield new GraphNode({ sha: 'sha2', author: 'test', date: '2026-01-08', message: 'msg2', parents: ['sha1'] });
      }
    };

    service = new IndexRebuildService((({
      storage: mockStorage,
      graphService: mockGraphService,
    }) as any));
  });

  describe('constructor validation', () => {
    it('throws when graphService is not provided', () => {
      expect(() => new IndexRebuildService(({ storage: mockStorage } as any)))
        .toThrow('IndexRebuildService requires a graphService');
    });

    it('throws when storage is not provided', () => {
      expect(() => new IndexRebuildService(({ graphService: mockGraphService } as any)))
        .toThrow('IndexRebuildService requires a storage adapter');
    });

    it('throws when called with empty options', () => {
      expect(() => new IndexRebuildService(({} as any)))
        .toThrow('IndexRebuildService requires a graphService');
    });
  });

  it('rebuilds, persists, and reloads a readable index', async () => {
    const { indexService, storage } = createReadableIndexHarness();

    const treeOid = await indexService.rebuild('main');
    const reader = await indexService.load(treeOid);

    expect(storage.writeBlob).toHaveBeenCalled();
    expect(storage.writeTree).toHaveBeenCalled();
    await expect(reader.getParents(CHILD_SHA)).resolves.toEqual([ROOT_SHA]);
    await expect(reader.getChildren(ROOT_SHA)).resolves.toEqual([CHILD_SHA]);
  });

  it('loads an index from a tree OID and answers relationship lookups', async () => {
    const { indexService } = createReadableIndexHarness();
    const treeOid = await indexService.rebuild('main');

    const reader = await indexService.load(treeOid);

    await expect(reader.getParents(GRANDCHILD_SHA)).resolves.toEqual([CHILD_SHA]);
    await expect(reader.getChildren(CHILD_SHA)).resolves.toEqual([GRANDCHILD_SHA]);
  });

  it('persists shard blobs and tree entries during rebuild', async () => {
    const { indexService, storage } = createReadableIndexHarness();

    const treeOid = await indexService.rebuild('main');
    const treeCall = storage.writeTree.mock.calls[0];
    if (treeCall === undefined) {
      throw new Error('expected writeTree call');
    }
    const treeEntries = treeCall[0];

    expect(treeOid).toMatch(/^tree_/);
    expect(storage.writeBlob.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(storage.writeTree).toHaveBeenCalledTimes(1);
    expect(treeEntries.length).toBeGreaterThanOrEqual(2);
    expect(treeEntries.every((entry: string) => entry.startsWith('100644 blob'))).toBe(true);
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

    it('strict mode throws ShardCorruptionError on invalid CBOR', async () => {
      mockStorage.readTreeOids.mockResolvedValue({
        'meta_ab.cbor': 'c0aac0aac0aac0aac0aac0aac0aac0aac0aac0aa'
      });
      mockStorage.readBlob.mockResolvedValue(Buffer.from('not valid cbor'));

      const reader = await service.load('tree-oid');

      const { ShardCorruptionError } = await import('../../../../src/domain/errors/index.ts');

      await expect(reader.lookupId('ab123456')).rejects.toThrow(ShardCorruptionError);
    });

    it('non-strict mode returns empty on decode failure instead of throwing', async () => {
      mockStorage.readTreeOids.mockResolvedValue({
        'meta_ab.cbor': 'bad0bad0bad0bad0bad0bad0bad0bad0bad0bad0'
      });
      mockStorage.readBlob.mockResolvedValue(Buffer.from('invalid'));

      const reader = await service.load('tree-oid', { strict: false });

      // Should not throw, returns undefined for unknown ID
      const id = await reader.lookupId('ab123456');
      expect(id).toBeUndefined();
    });

    it('returns data from valid CBOR-encoded shard', async () => {
      const shardData = { 'ab123456abcdef0123456789abcdef0123456789': 0 };
      const encoded = defaultCodec.encode(shardData);

      mockStorage.readTreeOids.mockResolvedValue({
        'meta_ab.cbor': 'aabbccddaabbccddaabbccddaabbccddaabbccdd'
      });
      mockStorage.readBlob.mockResolvedValue(Buffer.from(encoded));

      const reader = await service.load('tree-oid');
      const id = await reader.lookupId('ab123456abcdef0123456789abcdef0123456789');
      expect(id).toBe(0);
    });
  });
});
