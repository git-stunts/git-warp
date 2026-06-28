import { describe, it, expect, vi, beforeEach } from 'vitest';
import StreamingBitmapIndexBuilder from '../../../../src/domain/services/index/StreamingBitmapIndexBuilder.ts';
import BitmapIndexReader from '../../../../src/domain/services/index/BitmapIndexReader.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { collectAsyncIterable, normalizeToAsyncIterable } from '../../../../src/domain/utils/streamUtils.ts';

function createMockStorage() {
  const blobStore = new Map();
  let blobCounter = 0;
  const storage = {
    writeBlob: vi.fn().mockImplementation(async (/** @type {Uint8Array} */ buffer) => {
      const oid = String(blobCounter++).padStart(40, '0');
      blobStore.set(oid, buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
      return oid;
    }),
    writeBlobStream: vi.fn().mockImplementation(async (source) => {
      const buffer = await collectAsyncIterable(source);
      return await storage.writeBlob(buffer);
    }),
    writeTree: vi.fn().mockResolvedValue('tree-oid'),
    readBlob: vi.fn().mockImplementation(async (/** @type {string} */ oid) => {
      const buf = blobStore.get(oid);
      if (buf) { return buf; }
      return defaultCodec.encode({});
    }),
    readBlobStream: vi.fn().mockImplementation((/** @type {string} */ oid) => ({
      [Symbol.asyncIterator]: () => normalizeToAsyncIterable(blobStore.get(oid) || defaultCodec.encode({}))[Symbol.asyncIterator](),
    })),
  };
  return { blobStore, storage };
}

describe('StreamingBitmapIndexBuilder', () => {
    let mockStorage;
    let writtenBlobs;

  beforeEach(() => {
    const fixture = createMockStorage();
    writtenBlobs = fixture.blobStore;
    mockStorage = fixture.storage;
  });

  describe('constructor', () => {
    it('requires storage adapter', () => {
      expect(() => new StreamingBitmapIndexBuilder(({} as any))).toThrow('requires a streaming storage adapter');
    });

    it('throws when maxMemoryBytes is zero', () => {
      expect(() => new StreamingBitmapIndexBuilder((({
        storage: mockStorage,
        maxMemoryBytes: 0,
      }) as any))).toThrow('maxMemoryBytes must be a positive number');
    });

    it('throws when maxMemoryBytes is negative', () => {
      expect(() => new StreamingBitmapIndexBuilder((({
        storage: mockStorage,
        maxMemoryBytes: -100,
      }) as any))).toThrow('maxMemoryBytes must be a positive number');
    });
  });

  describe('registerNode', () => {
    it('assigns sequential IDs to nodes', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      const id1 = await builder.registerNode('abc123');
      const id2 = await builder.registerNode('def456');
      const id3 = await builder.registerNode('abc123'); // duplicate

      expect(id1).toBe(0);
      expect(id2).toBe(1);
      expect(id3).toBe(0);
    });
  });

  describe('addEdge', () => {
    it('registers both nodes and creates bitmaps', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      await builder.addEdge('parent1', 'child1');
      const stats = builder.getMemoryStats();

      expect(stats.nodeCount).toBe(2);
      expect(stats.bitmapCount).toBe(2);
    });
  });

  describe('flush', () => {
    it('writes bitmap shards to storage', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      await builder.addEdge('aa1111', 'bb2222');
      await builder.flush();

      expect(mockStorage.writeBlob).toHaveBeenCalled();
      expect(builder.getMemoryStats().bitmapCount).toBe(0);
    });

    it('invokes onFlush callback', async () => {
      const onFlush = vi.fn();
      const builder = new StreamingBitmapIndexBuilder({
        storage: (mockStorage as any),
        codec: defaultCodec,
        onFlush,
      });

      await builder.addEdge('aa1111', 'bb2222');
      await builder.flush();

      expect(onFlush).toHaveBeenCalledWith({
        flushedBytes: expect.any(Number),
        totalFlushedBytes: expect.any(Number),
        flushCount: 1,
      });
    });

    it('does nothing when bitmaps are empty', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      await builder.flush();

      expect(mockStorage.writeBlob).not.toHaveBeenCalled();
    });

    it('preserves SHA→ID mappings after flush', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      await builder.addEdge('aa1111', 'bb2222');
      const statsBefore = builder.getMemoryStats();
      await builder.flush();
      const statsAfter = builder.getMemoryStats();

      expect(statsAfter.nodeCount).toBe(statsBefore.nodeCount);
    });
  });

  describe('finalize', () => {
    it('creates tree with meta and bitmap shards', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      await builder.addEdge('aa1111', 'bb2222');
      const treeOid = await builder.finalize();

      expect(treeOid).toBe('tree-oid');
      expect(mockStorage.writeTree).toHaveBeenCalled();

      const treeEntries = ((mockStorage.writeTree.mock.calls[0] as any[])[0] as string[]);
      expect(treeEntries.some((e) => e.includes('meta_'))).toBe(true);
      expect(treeEntries.some((e) => e.includes('shards_fwd_'))).toBe(true);
      expect(treeEntries.some((e) => e.includes('shards_rev_'))).toBe(true);
    });

    it('uses .cbor extension for shards', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      await builder.addEdge('aa1111', 'bb2222');
      await builder.finalize();

      const treeEntries = ((mockStorage.writeTree.mock.calls[0] as any[])[0] as string[]);
      for (const entry of treeEntries) {
        if (entry.includes('meta_') || entry.includes('shards_')) {
          expect(entry).toContain('.cbor');
        }
      }
    });

    it('writes sorted frontier metadata when provided', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      await builder.addEdge('aa1111', 'bb2222');
      await builder.finalize({
        frontier: new Map([
          ['writer-b', 'bbbb'],
          ['writer-a', 'aaaa'],
        ]),
      });

      const treeEntries = ((mockStorage.writeTree.mock.calls[0] as any[])[0] as string[]);
      expect(treeEntries.find((e) => e.includes('\tfrontier.json'))).toBeDefined();
      expect(treeEntries.find((e) => e.includes('\tfrontier.cbor'))).toBeDefined();
    });
  });

  describe('getMemoryStats', () => {
    it('returns current memory statistics', async () => {
      const builder = new StreamingBitmapIndexBuilder({ storage: (mockStorage as any), codec: defaultCodec });

      await builder.addEdge('aa1111', 'bb2222');
      const stats = builder.getMemoryStats();

      expect(stats.nodeCount).toBe(2);
      expect(stats.bitmapCount).toBe(2);
      expect(stats.estimatedBitmapBytes).toBeGreaterThan(0);
      expect(stats.flushCount).toBe(0);
    });
  });

  describe('automatic flush on memory threshold', () => {
    it('flushes when memory exceeds threshold', async () => {
      const onFlush = vi.fn();
      const builder = new StreamingBitmapIndexBuilder({
        storage: (mockStorage as any),
        codec: defaultCodec,
        maxMemoryBytes: 200,
        onFlush,
      });

      for (let i = 0; i < 10; i++) {
        await builder.addEdge(`aa${i.toString().padStart(4, '0')}`, `bb${i.toString().padStart(4, '0')}`);
      }

      expect(onFlush).toHaveBeenCalled();
      expect(builder.getMemoryStats().flushCount).toBeGreaterThan(0);
    });
  });

  describe('chunk merging', () => {
    it('writes multiple chunk entries for the same shard', async () => {
      const builder = new StreamingBitmapIndexBuilder({
        storage: (mockStorage as any),
        codec: defaultCodec,
        maxMemoryBytes: 100,
      });

      await builder.addEdge('aa1111', 'aa2222');
      await builder.flush();
      await builder.addEdge('aa3333', 'aa4444');
      await builder.flush();
      await builder.finalize();

      expect(mockStorage.writeTree).toHaveBeenCalled();
      const treeEntries = ((mockStorage.writeTree.mock.calls[0] as any[])[0] as string[]);
      expect(treeEntries.filter((entry) => entry.includes('shards_fwd_aa.chunk-')).length).toBeGreaterThan(1);
    });

    it('keeps multi-chunk shard queries correct through BitmapIndexReader', async () => {
      const builder = new StreamingBitmapIndexBuilder({
        storage: (mockStorage as any),
        codec: defaultCodec,
        maxMemoryBytes: 1,
      });

      await builder.addEdge('aa0001', 'bb0001');
      await builder.addEdge('aa0002', 'bb0002');

      const treeOid = await builder.finalize();
      expect(treeOid).toBe('tree-oid');

      const treeEntries = ((mockStorage.writeTree.mock.calls[0] as any[])[0] as string[]);
      const shardOids: Record<string, string> = {};
      treeEntries.forEach((entry) => {
        const match = entry.match(/100644 blob (\S+)\t(\S+)/);
        const oid = match?.[1];
        const path = match?.[2];
        if (oid !== undefined && path !== undefined) {
          shardOids[path] = oid;
        }
      });
      const reader = new BitmapIndexReader({ storage: (mockStorage as any), codec: defaultCodec });
      reader.setup(shardOids);
      await expect(reader.getChildren('aa0001')).resolves.toContain('bb0001');
      await expect(reader.getChildren('aa0002')).resolves.toContain('bb0002');

      expect(builder.getMemoryStats().nodeCount).toBe(4);
    });
  });
});

describe('StreamingBitmapIndexBuilder memory guard', () => {
  it('bitmap memory stays below threshold during large build', async () => {
    let maxMemorySeen = 0;
    const memoryThreshold = 5000;
    const { storage: mockStorage } = createMockStorage();

    const builder = new StreamingBitmapIndexBuilder({
      storage: (mockStorage as any),
        codec: defaultCodec,
      maxMemoryBytes: memoryThreshold,
    });

    for (let i = 0; i < 500; i++) {
      const sha = `${(i % 256).toString(16).padStart(2, '0')}${i.toString().padStart(6, '0')}`;
      await builder.registerNode(sha);

      const numParents = (i % 3) + 1;
      for (let p = 0; p < numParents && i > p; p++) {
        const parentIdx = Math.max(0, i - p - 1);
        const parentSha = `${(parentIdx % 256).toString(16).padStart(2, '0')}${parentIdx.toString().padStart(6, '0')}`;
        await builder.addEdge(parentSha, sha);
      }

      maxMemorySeen = Math.max(maxMemorySeen, builder.getMemoryStats().estimatedBitmapBytes);
    }

    await builder.finalize();

    const allowedOvershoot = memoryThreshold * 0.5;
    expect(maxMemorySeen).toBeLessThan(memoryThreshold + allowedOvershoot);
    expect(builder.getMemoryStats().flushCount).toBeGreaterThan(0);
    expect(mockStorage.writeTree).toHaveBeenCalled();
  });

  it('produces correct index despite multiple flushes', async () => {
    const { storage: mockStorage } = createMockStorage();

    const builder = new StreamingBitmapIndexBuilder({
      storage: (mockStorage as any),
        codec: defaultCodec,
      maxMemoryBytes: 500,
    });

    const nodes = ['aa0001', 'aa0002', 'aa0003', 'bb0001', 'bb0002'];
    const edges = [['aa0001', 'aa0002'], ['aa0002', 'aa0003'], ['aa0001', 'bb0001'], ['bb0001', 'bb0002']];

    for (const sha of nodes) { await builder.registerNode(sha); }
    for (const [parent, child] of edges) { await builder.addEdge((parent as string), (child as string)); }
    await builder.finalize();

    const treeEntries = ((mockStorage.writeTree.mock.calls[0] as any[])[0] as string[]);
    const metaEntries = treeEntries.filter((e) => e.includes('meta_'));
    expect(metaEntries.length).toBeGreaterThan(0);
    expect(builder.getMemoryStats().nodeCount).toBe(5);
  });
});

describe('StreamingBitmapIndexBuilder extreme stress tests', () => {
  it('handles 1000 nodes with 512-byte memory limit', async () => {
    let flushCount = 0;
    const { storage: mockStorage } = createMockStorage();

    const builder = new StreamingBitmapIndexBuilder({
      storage: (mockStorage as any),
        codec: defaultCodec,
      maxMemoryBytes: 512,
      onFlush: () => { flushCount++; },
    });

    const nodeCount = 1000;
    for (let i = 0; i < nodeCount; i++) {
      const sha = `${(i % 256).toString(16).padStart(2, '0')}${i.toString(16).padStart(6, '0')}`;
      await builder.registerNode(sha);
      if (i > 0) {
        const prevSha = `${((i - 1) % 256).toString(16).padStart(2, '0')}${(i - 1).toString(16).padStart(6, '0')}`;
        await builder.addEdge(prevSha, sha);
      }
    }

    const treeOid = await builder.finalize();
    expect(treeOid).toBe('tree-oid');
    expect(builder.getMemoryStats().nodeCount).toBe(nodeCount);
    expect(flushCount).toBeGreaterThan(10);

    const treeEntries = ((mockStorage.writeTree.mock.calls[0] as any[])[0] as string[]);
    expect(treeEntries.some((e) => e.includes('meta_'))).toBe(true);
    expect(treeEntries.some((e) => e.includes('shards_fwd_'))).toBe(true);
    expect(treeEntries.some((e) => e.includes('shards_rev_'))).toBe(true);
  });

  it('throws clean error when storage.writeBlob fails mid-flush', async () => {
    let writeCallCount = 0;

    const mockStorage = {
      writeBlob: vi.fn().mockImplementation(async () => {
        writeCallCount++;
        if (writeCallCount === 3) {
          throw new Error('Storage write failed: disk full');
        }
        return `blob-${writeCallCount}`;
      }),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
      readBlob: vi.fn().mockResolvedValue(defaultCodec.encode({})),
      writeBlobStream: vi.fn().mockImplementation(async (source) => {
        await collectAsyncIterable(source);
        return await mockStorage.writeBlob();
      }),
      readBlobStream: vi.fn().mockImplementation(() => normalizeToAsyncIterable(defaultCodec.encode({}))),
    };

    const builder = new StreamingBitmapIndexBuilder({
      storage: (mockStorage as any),
        codec: defaultCodec,
      maxMemoryBytes: 50000,
    });

    await builder.addEdge('aa0001', 'bb0001');
    await builder.addEdge('cc0001', 'dd0001');
    await builder.addEdge('ee0001', 'ff0001');

    await expect(builder.flush()).rejects.toThrow('Storage write failed: disk full');
  });

  it('supports same-prefix queries across 10 different flushed chunks', async () => {
    const { storage: mockStorage } = createMockStorage();

    const builder = new StreamingBitmapIndexBuilder({
      storage: (mockStorage as any),
        codec: defaultCodec,
      maxMemoryBytes: 1,
    });

    const sourceNode = 'aa0001';
    const targetNodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const targetNode = `bb${i.toString().padStart(4, '0')}`;
      targetNodes.push(targetNode);
      await builder.addEdge(sourceNode, targetNode);
    }

    await builder.finalize();

    const treeEntries = ((mockStorage.writeTree.mock.calls[0] as any[])[0] as string[]);
    const shardOids: Record<string, string> = {};
    treeEntries.forEach((entry) => {
      const match = entry.match(/100644 blob (\S+)\t(\S+)/);
      const oid = match?.[1];
      const path = match?.[2];
      if (oid !== undefined && path !== undefined) {
        shardOids[path] = oid;
      }
    });
    const reader = new BitmapIndexReader({ storage: (mockStorage as any), codec: defaultCodec });
    reader.setup(shardOids);
    await expect(reader.getChildren(sourceNode)).resolves.toHaveLength(10);
  });
});
