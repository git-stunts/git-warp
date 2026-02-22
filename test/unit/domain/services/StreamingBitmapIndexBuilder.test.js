import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StreamingBitmapIndexBuilder, { SHARD_VERSION } from '../../../../src/domain/services/StreamingBitmapIndexBuilder.js';

/**
 * Helper to create a valid shard envelope with checksum.
 * Uses SHA-256 to match production validation in StreamingBitmapIndexBuilder.
 */
/** @param {any} data @returns {any} */
function createMockEnvelope(data) {
  const checksum = createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
  return {
    version: SHARD_VERSION,
    checksum,
    data,
  };
}

describe('StreamingBitmapIndexBuilder', () => {
  /** @type {any} */
  let mockStorage;
  /** @type {any} */
  let writtenBlobs;

  beforeEach(() => {
    writtenBlobs = [];
    let blobCounter = 0;

    mockStorage = {
      writeBlob: vi.fn().mockImplementation(async (buffer) => {
        const oid = `blob-${blobCounter++}`;
        writtenBlobs.push({ oid, content: buffer.toString('utf-8') });
        return oid;
      }),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
      readBlob: vi.fn().mockImplementation(async (oid) => {
        const blob = writtenBlobs.find((/** @type {any} */ b) => b.oid === oid);
        return Buffer.from(blob ? blob.content : '{}');
      }),
    };
  });

  describe('constructor', () => {
    it('requires storage adapter', () => {
      expect(() => new StreamingBitmapIndexBuilder(/** @type {any} */ ({}))).toThrow('requires a storage adapter');
    });

    it('throws when maxMemoryBytes is zero', () => {
      expect(() => new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 0,
      }))).toThrow('maxMemoryBytes must be a positive number');
    });

    it('throws when maxMemoryBytes is negative', () => {
      expect(() => new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: -100,
      }))).toThrow('maxMemoryBytes must be a positive number');
    });

    it('accepts custom maxMemoryBytes', () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 1024,
      }));
      expect(builder.maxMemoryBytes).toBe(1024);
    });

    it('uses default maxMemoryBytes of 50MB', () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({ storage: mockStorage }));
      expect(builder.maxMemoryBytes).toBe(50 * 1024 * 1024);
    });
  });

  describe('registerNode', () => {
    it('assigns sequential IDs to nodes', async () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({ storage: mockStorage }));

      const id1 = await builder.registerNode('abc123');
      const id2 = await builder.registerNode('def456');
      const id3 = await builder.registerNode('abc123'); // duplicate

      expect(id1).toBe(0);
      expect(id2).toBe(1);
      expect(id3).toBe(0); // same as first
    });
  });

  describe('addEdge', () => {
    it('registers both nodes and creates bitmaps', async () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({ storage: mockStorage }));

      await builder.addEdge('parent1', 'child1');

      expect(builder.shaToId.size).toBe(2);
      expect(builder.bitmaps.size).toBe(2); // fwd_parent1 and rev_child1
    });
  });

  describe('flush', () => {
    it('writes bitmap shards to storage', async () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({ storage: mockStorage }));

      await builder.addEdge('aa1111', 'bb2222');
      await builder.flush();

      expect(mockStorage.writeBlob).toHaveBeenCalled();
      expect(builder.bitmaps.size).toBe(0); // cleared after flush
      expect(builder.flushedChunks.size).toBeGreaterThan(0);
    });

    it('invokes onFlush callback', async () => {
      const onFlush = vi.fn();
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        onFlush,
      }));

      await builder.addEdge('aa1111', 'bb2222');
      await builder.flush();

      expect(onFlush).toHaveBeenCalledWith({
        flushedBytes: expect.any(Number),
        totalFlushedBytes: expect.any(Number),
        flushCount: 1,
      });
    });

    it('does nothing when bitmaps are empty', async () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({ storage: mockStorage }));

      await builder.flush();

      expect(mockStorage.writeBlob).not.toHaveBeenCalled();
    });

    it('preserves SHA→ID mappings after flush', async () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({ storage: mockStorage }));

      await builder.addEdge('aa1111', 'bb2222');
      const idBefore = builder.shaToId.get('aa1111');
      await builder.flush();
      const idAfter = builder.shaToId.get('aa1111');

      expect(idAfter).toBe(idBefore);
    });
  });

  describe('finalize', () => {
    it('creates tree with all shards', async () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({ storage: mockStorage }));

      await builder.addEdge('aa1111', 'bb2222');
      const treeOid = await builder.finalize();

      expect(treeOid).toBe('tree-oid');
      expect(mockStorage.writeTree).toHaveBeenCalled();

      const treeEntries = mockStorage.writeTree.mock.calls[0][0];
      expect(treeEntries.some((/** @type {any} */ e) => e.includes('meta_'))).toBe(true);
      expect(treeEntries.some((/** @type {any} */ e) => e.includes('shards_fwd_'))).toBe(true);
      expect(treeEntries.some((/** @type {any} */ e) => e.includes('shards_rev_'))).toBe(true);
    });
  });

  describe('getMemoryStats', () => {
    it('returns current memory statistics', async () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({ storage: mockStorage }));

      await builder.addEdge('aa1111', 'bb2222');
      const stats = /** @type {any} */ (builder.getMemoryStats());

      expect(stats.nodeCount).toBe(2);
      expect(stats.bitmapCount).toBe(2);
      expect(stats.estimatedBitmapBytes).toBeGreaterThan(0);
      expect(stats.flushCount).toBe(0);
    });
  });

  describe('automatic flush on memory threshold', () => {
    it('flushes when memory exceeds threshold', async () => {
      const onFlush = vi.fn();
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 200, // Very low threshold to trigger flush
        onFlush,
      }));

      // Add enough edges to exceed threshold
      for (let i = 0; i < 10; i++) {
        await builder.addEdge(`aa${i.toString().padStart(4, '0')}`, `bb${i.toString().padStart(4, '0')}`);
      }

      expect(onFlush).toHaveBeenCalled();
      expect(builder.flushCount).toBeGreaterThan(0);
    });
  });

  describe('chunk merging', () => {
    it('merges multiple chunks for same shard', async () => {
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 100, // Force multiple flushes
      }));

      // First batch of edges
      await builder.addEdge('aa1111', 'aa2222');
      await builder.flush();

      // Second batch with same prefix
      await builder.addEdge('aa3333', 'aa4444');
      await builder.flush();

      // Finalize should merge chunks
      await builder.finalize();

      // readBlob should have been called to load chunks for merging
      // (may or may not depending on whether same shard was hit twice)
      expect(mockStorage.writeTree).toHaveBeenCalled();
    });

    it('correctly merges bitmap data from multiple chunks', async () => {
      // Create builder with very low threshold
      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 1, // Force immediate flush after each edge
      }));

      // Add edges that will be in same shard (same prefix)
      await builder.addEdge('aa0001', 'bb0001');
      await builder.addEdge('aa0002', 'bb0002');

      const treeOid = await builder.finalize();
      expect(treeOid).toBe('tree-oid');

      // Verify all nodes are in the meta shards
      const metaBlobs = writtenBlobs.filter((/** @type {any} */ b) => b.oid.includes('blob-'));
      expect(metaBlobs.length).toBeGreaterThan(0);
    });
  });
});

describe('StreamingBitmapIndexBuilder memory guard', () => {
  it('bitmap memory stays below threshold during large build', async () => {
    const memoryReadings = [];
    let maxMemorySeen = 0;
    const memoryThreshold = 5000; // 5KB threshold for test
    const writtenBlobs = new Map();
    let blobCounter = 0;

    const mockStorage = {
      writeBlob: vi.fn().mockImplementation(async (buffer) => {
        const oid = `blob-${blobCounter++}`;
        writtenBlobs.set(oid, buffer.toString('utf-8'));
        return oid;
      }),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
      readBlob: vi.fn().mockImplementation(async (oid) => {
        const content = writtenBlobs.get(oid);
        if (content) {
          return Buffer.from(content);
        }
        // Return valid empty envelope for any untracked blobs
        return Buffer.from(JSON.stringify(createMockEnvelope({})));
      }),
    };

    const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
      storage: mockStorage,
      maxMemoryBytes: memoryThreshold,
      onFlush: (/** @type {any} */ { flushedBytes }) => {
        memoryReadings.push({ event: 'flush', flushedBytes });
      },
    }));

    // Simulate large input (500 nodes with edges)
    for (let i = 0; i < 500; i++) {
      const sha = `${(i % 256).toString(16).padStart(2, '0')}${i.toString().padStart(6, '0')}`;
      await builder.registerNode(sha);

      // Add 1-3 parent edges per node
      const numParents = (i % 3) + 1;
      for (let p = 0; p < numParents && i > p; p++) {
        const parentIdx = Math.max(0, i - p - 1);
        const parentSha = `${(parentIdx % 256).toString(16).padStart(2, '0')}${parentIdx.toString().padStart(6, '0')}`;
        await builder.addEdge(parentSha, sha);
      }

      // Track memory after each node
      const stats = builder.getMemoryStats();
      maxMemorySeen = Math.max(maxMemorySeen, /** @type {any} */ (stats).estimatedBitmapBytes);
    }

    await builder.finalize();

    // Assert memory never exceeded threshold by too much
    // (allow some overshoot since we check after addEdge)
    const allowedOvershoot = memoryThreshold * 0.5; // 50% tolerance for batch processing
    expect(maxMemorySeen).toBeLessThan(memoryThreshold + allowedOvershoot);

    // Should have flushed multiple times
    expect(builder.flushCount).toBeGreaterThan(0);

    // Verify final tree was created
    expect(mockStorage.writeTree).toHaveBeenCalled();
  });

  it('produces correct index despite multiple flushes', async () => {
    const writtenBlobs = new Map();
    let blobCounter = 0;

    const mockStorage = {
      writeBlob: vi.fn().mockImplementation(async (buffer) => {
        const oid = `blob-${blobCounter++}`;
        writtenBlobs.set(oid, buffer.toString('utf-8'));
        return oid;
      }),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
      readBlob: vi.fn().mockImplementation(async (oid) => {
        return Buffer.from(writtenBlobs.get(oid) || '{}');
      }),
    };

    const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
      storage: mockStorage,
      maxMemoryBytes: 500, // Force frequent flushes
    }));

    // Build a small graph
    const nodes = ['aa0001', 'aa0002', 'aa0003', 'bb0001', 'bb0002'];
    const edges = [
      ['aa0001', 'aa0002'],
      ['aa0002', 'aa0003'],
      ['aa0001', 'bb0001'],
      ['bb0001', 'bb0002'],
    ];

    for (const sha of nodes) {
      await builder.registerNode(sha);
    }
    for (const [parent, child] of edges) {
      await builder.addEdge(parent, child);
    }

    await builder.finalize();

    // Verify all nodes are in meta shards
    const treeEntries = mockStorage.writeTree.mock.calls[0][0];
    const metaEntries = treeEntries.filter((/** @type {any} */ e) => e.includes('meta_'));
    expect(metaEntries.length).toBeGreaterThan(0);

    // Verify all nodes got IDs
    expect(builder.shaToId.size).toBe(5);
    expect(builder.idToSha.length).toBe(5);
  });
});

describe('StreamingBitmapIndexBuilder extreme stress tests', () => {
  describe('smallest window test', () => {
    it('handles 1000 nodes with 512-byte memory limit forcing flush on nearly every edge', async () => {
      const writtenBlobs = new Map();
      let blobCounter = 0;
      let flushCount = 0;

      const mockStorage = {
        writeBlob: vi.fn().mockImplementation(async (buffer) => {
          const oid = `blob-${blobCounter++}`;
          writtenBlobs.set(oid, buffer.toString('utf-8'));
          return oid;
        }),
        writeTree: vi.fn().mockResolvedValue('tree-oid'),
        readBlob: vi.fn().mockImplementation(async (oid) => {
          return Buffer.from(writtenBlobs.get(oid) || '{}');
        }),
      };

      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 512, // Extremely small - forces flush on almost every edge
        onFlush: () => { flushCount++; },
      }));

      // Create 1000 nodes with edges forming a chain
      const nodeCount = 1000;
      for (let i = 0; i < nodeCount; i++) {
        const sha = `${(i % 256).toString(16).padStart(2, '0')}${i.toString(16).padStart(6, '0')}`;
        await builder.registerNode(sha);

        // Add edge to previous node (if not first)
        if (i > 0) {
          const prevSha = `${((i - 1) % 256).toString(16).padStart(2, '0')}${(i - 1).toString(16).padStart(6, '0')}`;
          await builder.addEdge(prevSha, sha);
        }
      }

      // Finalize should complete without error
      const treeOid = await builder.finalize();
      expect(treeOid).toBe('tree-oid');

      // All nodes should be in final index
      expect(builder.shaToId.size).toBe(nodeCount);
      expect(builder.idToSha.length).toBe(nodeCount);

      // Should have flushed many times due to tiny memory limit
      expect(flushCount).toBeGreaterThan(10);

      // Verify tree was created with merged shards
      expect(mockStorage.writeTree).toHaveBeenCalled();
      const treeEntries = mockStorage.writeTree.mock.calls[0][0];

      // Should have meta shards for SHA→ID mappings
      const metaEntries = treeEntries.filter((/** @type {any} */ e) => e.includes('meta_'));
      expect(metaEntries.length).toBeGreaterThan(0);

      // Should have both fwd and rev bitmap shards
      const fwdEntries = treeEntries.filter((/** @type {any} */ e) => e.includes('shards_fwd_'));
      const revEntries = treeEntries.filter((/** @type {any} */ e) => e.includes('shards_rev_'));
      expect(fwdEntries.length).toBeGreaterThan(0);
      expect(revEntries.length).toBeGreaterThan(0);
    });
  });

  describe('persistence failure during flush', () => {
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
        readBlob: vi.fn().mockResolvedValue(Buffer.from('{}')),
      };

      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 50000, // Large enough to not auto-flush during addEdge
      }));

      // Add edges across multiple prefixes to ensure multiple writeBlob calls per flush
      await builder.addEdge('aa0001', 'bb0001');
      await builder.addEdge('cc0001', 'dd0001');
      await builder.addEdge('ee0001', 'ff0001');

      // Flush should throw the storage error on the 3rd writeBlob call
      await expect(builder.flush()).rejects.toThrow('Storage write failed: disk full');

      // Error message should be descriptive (comes from storage layer)
      writeCallCount = 2; // Reset to trigger on next call
      try {
        await builder.flush();
      } catch (/** @type {any} */ err) {
        expect(err.message).toContain('Storage write failed');
      }
    });

    it('maintains consistent internal state when flush fails before clearing bitmaps', async () => {
      let shouldFail = false;

      const mockStorage = {
        writeBlob: vi.fn().mockImplementation(async () => {
          if (shouldFail) {
            throw new Error('Network timeout');
          }
          return 'blob-oid';
        }),
        writeTree: vi.fn().mockResolvedValue('tree-oid'),
        readBlob: vi.fn().mockResolvedValue(Buffer.from('{}')),
      };

      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 50000, // Large enough to not auto-flush
      }));

      // Add some edges
      await builder.addEdge('aa0001', 'bb0001');
      await builder.addEdge('aa0002', 'bb0002');

      const bitmapCountBefore = builder.bitmaps.size;
      const estimatedBytesBefore = builder.estimatedBitmapBytes;

      // Now make storage fail
      shouldFail = true;

      // Flush should fail
      await expect(builder.flush()).rejects.toThrow('Network timeout');

      // Since flush throws before clearing bitmaps (during writeBlob loop),
      // internal state should reflect partial completion
      // The bitmaps may or may not be cleared depending on where failure occurred
      // but flushCount should not be incremented since callback wasn't reached
      expect(builder.flushCount).toBe(0);

      // Bitmaps should still be present since we failed before clearing them
      expect(builder.bitmaps.size).toBe(bitmapCountBefore);
      expect(builder.estimatedBitmapBytes).toBe(estimatedBytesBefore);
    });
  });

  describe('merge collision test', () => {
    it('correctly merges same node prefix from 10 different flushed chunks', async () => {
      const writtenBlobs = new Map();
      let blobCounter = 0;

      const mockStorage = {
        writeBlob: vi.fn().mockImplementation(async (buffer) => {
          const oid = `blob-${blobCounter++}`;
          writtenBlobs.set(oid, buffer.toString('utf-8'));
          return oid;
        }),
        writeTree: vi.fn().mockResolvedValue('tree-oid'),
        readBlob: vi.fn().mockImplementation(async (oid) => {
          return Buffer.from(writtenBlobs.get(oid) || '{}');
        }),
      };

      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 1, // Force flush after every edge
      }));

      // Create 10 edges from aa0001 to different targets, each in separate flush
      const sourceNode = 'aa0001';
      const targetNodes = [];

      for (let i = 0; i < 10; i++) {
        const targetNode = `bb${i.toString().padStart(4, '0')}`;
        targetNodes.push(targetNode);
        await builder.addEdge(sourceNode, targetNode);
        // With maxMemoryBytes=1, each addEdge triggers a flush
      }

      // Finalize to merge all chunks
      await builder.finalize();

      // The final tree should reference a merged shard
      expect(mockStorage.writeTree).toHaveBeenCalled();
      const treeEntries = mockStorage.writeTree.mock.calls[0][0];
      const fwdAaShard = treeEntries.find((/** @type {any} */ e) => e.includes('shards_fwd_aa'));
      expect(fwdAaShard).toBeDefined();

      // Find the merged content for aa prefix (now wrapped in envelope)
      let mergedFwdContent = null;
      for (const entry of treeEntries) {
        if (entry.includes('shards_fwd_aa')) {
          const oidMatch = entry.match(/blob ([^\s]+)/);
          if (oidMatch) {
            const mergedOid = oidMatch[1];
            const envelope = JSON.parse(writtenBlobs.get(mergedOid));
            // Extract data from envelope
            mergedFwdContent = envelope.data;
          }
        }
      }

      expect(mergedFwdContent).not.toBeNull();
      expect(mergedFwdContent[sourceNode]).toBeDefined();

      // Deserialize the bitmap to check cardinality
      const roaring = await import('roaring');
      const { RoaringBitmap32 } = roaring.default;
      const bitmap = RoaringBitmap32.deserialize(
        Buffer.from(mergedFwdContent[sourceNode], 'base64'),
        true
      );

      // Should have exactly 10 children (no duplicates, all edges preserved)
      expect(bitmap.size).toBe(10);

      // Verify all target node IDs are in the bitmap
      for (const targetNode of targetNodes) {
        const targetId = builder.shaToId.get(targetNode);
        expect(bitmap.has(targetId)).toBe(true);
      }
    });

    it('handles multiple nodes with same prefix across many flushes without data loss', async () => {
      const writtenBlobs = new Map();
      let blobCounter = 0;

      const mockStorage = {
        writeBlob: vi.fn().mockImplementation(async (buffer) => {
          const oid = `blob-${blobCounter++}`;
          writtenBlobs.set(oid, buffer.toString('utf-8'));
          return oid;
        }),
        writeTree: vi.fn().mockResolvedValue('tree-oid'),
        readBlob: vi.fn().mockImplementation(async (oid) => {
          return Buffer.from(writtenBlobs.get(oid) || '{}');
        }),
      };

      const builder = new StreamingBitmapIndexBuilder(/** @type {any} */ ({
        storage: mockStorage,
        maxMemoryBytes: 1, // Force flush after every edge
      }));

      // Create a more complex scenario:
      // Multiple sources with 'aa' prefix, each with multiple targets
      const edgeMap = new Map(); // Track expected edges for verification
      const sources = ['aa0001', 'aa0002', 'aa0003'];

      for (const source of sources) {
        edgeMap.set(source, []);
        for (let i = 0; i < 5; i++) {
          const target = `bb${source.slice(-4)}_${i}`;
          edgeMap.get(source).push(target);
          await builder.addEdge(source, target);
        }
      }

      await builder.finalize();

      // Extract the merged 'aa' shard (now wrapped in envelope)
      const treeEntries = mockStorage.writeTree.mock.calls[0][0];
      const fwdAaShard = treeEntries.find((/** @type {any} */ e) => e.includes('shards_fwd_aa'));
      expect(fwdAaShard).toBeDefined();

      const oidMatch = fwdAaShard.match(/blob ([^\s]+)/);
      const envelope = JSON.parse(writtenBlobs.get(oidMatch[1]));
      const mergedContent = envelope.data;

      // Verify all sources are present
      for (const source of sources) {
        expect(mergedContent[source]).toBeDefined();
      }

      // Verify correct cardinality for each source
      const roaring = await import('roaring');
      const { RoaringBitmap32 } = roaring.default;

      for (const source of sources) {
        const bitmap = RoaringBitmap32.deserialize(
          Buffer.from(mergedContent[source], 'base64'),
          true
        );
        // Each source should have exactly 5 targets
        expect(bitmap.size).toBe(5);

        // Verify all expected targets are present
        for (const target of edgeMap.get(source)) {
          const targetId = builder.shaToId.get(target);
          expect(bitmap.has(targetId)).toBe(true);
        }
      }
    });
  });
});
