import { describe, it, expect, vi, beforeEach } from 'vitest';
import IndexRebuildService from '../../../../src/domain/services/index/IndexRebuildService.ts';
import GraphNode from '../../../../src/domain/entities/GraphNode.ts';
import MockStreamingIndexStorage from '../../../helpers/MockStreamingIndexStorage.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const ROOT_SHA = 'a'.repeat(40);
const CHILD_SHA = 'b'.repeat(40);

describe('IndexRebuildService streaming mode', () => {
    let service;
    let mockStorage;
    let mockGraphService;

  beforeEach(() => {
    mockStorage = new MockStreamingIndexStorage();
  });

  describe('rebuild with maxMemoryBytes', () => {
    it('uses streaming builder when maxMemoryBytes is specified', async () => {
      mockGraphService = {
        async *iterateNodes() {
          yield new GraphNode({ sha: 'aa1111', author: 'test', date: '2026-01-28', message: 'msg1', parents: [] });
          yield new GraphNode({ sha: 'bb2222', author: 'test', date: '2026-01-28', message: 'msg2', parents: ['aa1111'] });
        }
      };

      service = new IndexRebuildService(({ storage: mockStorage, graphService: mockGraphService, codec: defaultCodec } as any));

      const treeOid = await service.rebuild('main', { maxMemoryBytes: 50 * 1024 * 1024 });

      expect(treeOid).toMatch(/^tree_/);
      expect(mockStorage.writeTree).toHaveBeenCalled();
    });

    it('invokes onFlush callback during streaming rebuild', async () => {
      // Generate enough nodes to trigger flush
      mockGraphService = {
        async *iterateNodes() {
          for (let i = 0; i < 100; i++) {
            const sha = `${(i % 256).toString(16).padStart(2, '0')}${i.toString().padStart(6, '0')}`;
            const parents = i > 0 ? [`${((i-1) % 256).toString(16).padStart(2, '0')}${(i-1).toString().padStart(6, '0')}`] : [];
            yield new GraphNode({ sha, author: 'test', date: '2026-01-28', message: `msg${i}`, parents });
          }
        }
      };

      service = new IndexRebuildService(({ storage: mockStorage, graphService: mockGraphService, codec: defaultCodec } as any));

            const flushCalls = ([]) as any[];
      await service.rebuild('main', {
        maxMemoryBytes: 1000, // Low threshold to trigger flushes
        onFlush: (/** @type {any} */ data) => flushCalls.push(data),
      });

      expect(flushCalls.length).toBeGreaterThan(0);
      expect(flushCalls[0]).toHaveProperty('flushCount');
      expect(flushCalls[0]).toHaveProperty('flushedBytes');
    });

    it('invokes onProgress callback during streaming rebuild', async () => {
      // Generate enough nodes to trigger progress callback
      mockGraphService = {
        async *iterateNodes() {
          for (let i = 0; i < 25000; i++) {
            const sha = `${(i % 256).toString(16).padStart(2, '0')}${i.toString().padStart(6, '0')}`;
            yield new GraphNode({ sha, author: 'test', date: '2026-01-28', message: `msg${i}`, parents: [] });
          }
        }
      };

      service = new IndexRebuildService(({ storage: mockStorage, graphService: mockGraphService, codec: defaultCodec } as any));

            const progressCalls = ([]) as any[];
      await service.rebuild('main', {
        maxMemoryBytes: 50 * 1024 * 1024,
        onProgress: (/** @type {any} */ data) => progressCalls.push(data),
      });

      // Should have received progress callbacks
      expect(progressCalls.length).toBeGreaterThan(0);
      // Verify all progress calls have valid data
      for (const call of progressCalls) {
        expect(call).toHaveProperty('processedNodes');
        expect(call).toHaveProperty('currentMemoryBytes');
      }
    });

    it('produces valid index that can be loaded', async () => {
      mockGraphService = {
        async *iterateNodes() {
          yield new GraphNode({ sha: ROOT_SHA, author: 'test', date: '2026-01-28', message: 'root', parents: [] });
          yield new GraphNode({ sha: CHILD_SHA, author: 'test', date: '2026-01-28', message: 'child', parents: [ROOT_SHA] });
        }
      };

      service = new IndexRebuildService(({ storage: mockStorage, graphService: mockGraphService, codec: defaultCodec } as any));

      const treeOid = await service.rebuild('main', { maxMemoryBytes: 50 * 1024 * 1024 });

      // Verify tree structure was created
      const treeEntries = mockStorage.writeTree.mock.calls[0][0];
      expect(treeEntries.some((/** @type {any} */ e) => e.includes('meta_'))).toBe(true);
      expect(treeEntries.some((/** @type {any} */ e) => e.includes('shards_'))).toBe(true);

      const reader = await service.load(treeOid);
      await expect(reader.getParents(CHILD_SHA)).resolves.toEqual([ROOT_SHA]);
      await expect(reader.getChildren(ROOT_SHA)).resolves.toEqual([CHILD_SHA]);
    });
  });

  describe('backward compatibility', () => {
    it('uses in-memory builder when maxMemoryBytes is not specified', async () => {
      mockGraphService = {
        async *iterateNodes() {
          yield new GraphNode({ sha: 'aa1111', author: 'test', date: '2026-01-28', message: 'msg1', parents: [] });
        }
      };

      service = new IndexRebuildService(({ storage: mockStorage, graphService: mockGraphService, codec: defaultCodec } as any));

      // Without maxMemoryBytes, should use in-memory builder (original behavior)
      const treeOid = await service.rebuild('main');

      expect(treeOid).toMatch(/^tree_/);
      expect(mockStorage.writeTree).toHaveBeenCalled();
    });

    it('in-memory mode still supports onProgress', async () => {
      mockGraphService = {
        async *iterateNodes() {
          for (let i = 0; i < 15000; i++) {
            yield new GraphNode({
              sha: `${i.toString(16).padStart(8, '0')}`,
              author: 'test',
              date: '2026-01-28',
              message: `msg${i}`,
              parents: []
            });
          }
        }
      };

      service = new IndexRebuildService(({ storage: mockStorage, graphService: mockGraphService, codec: defaultCodec } as any));

            const progressCalls = ([]) as any[];
      await service.rebuild('main', {
        onProgress: (/** @type {any} */ data) => progressCalls.push(data),
      });

      expect(progressCalls.length).toBeGreaterThanOrEqual(1); // Progress called at 10000-node intervals
      expect(progressCalls[0].processedNodes).toBe(10000);
      expect(progressCalls[0].currentMemoryBytes).toBeNull(); // in-memory mode doesn't track
    });
  });

  describe('memory guard integration', () => {
    it('rebuild does not exceed configured memory threshold', async () => {
      const memoryThreshold = 10000; // 10KB
      let maxMemorySeen = 0;

      // Generate a moderate number of nodes with edges
      mockGraphService = {
        async *iterateNodes() {
          for (let i = 0; i < 200; i++) {
            const prefix = (i % 256).toString(16).padStart(2, '0');
            const sha = `${prefix}${i.toString().padStart(6, '0')}`;
            const parents: string[] = [];

            // Add parent edges
            if (i > 0) {
              const parentPrefix = ((i - 1) % 256).toString(16).padStart(2, '0');
              parents.push(`${parentPrefix}${(i - 1).toString().padStart(6, '0')}`);
            }
            if (i > 5) {
              const parentPrefix = ((i - 5) % 256).toString(16).padStart(2, '0');
              parents.push(`${parentPrefix}${(i - 5).toString().padStart(6, '0')}`);
            }

            yield new GraphNode({ sha, author: 'test', date: '2026-01-28', message: `msg${i}`, parents });
          }
        }
      };

      service = new IndexRebuildService(({ storage: mockStorage, graphService: mockGraphService, codec: defaultCodec } as any));

      let flushCount = 0;
      await service.rebuild('main', {
        maxMemoryBytes: memoryThreshold,
        onFlush: () => flushCount++,
        onProgress: (/** @type {any} */ { currentMemoryBytes }) => {
          if (currentMemoryBytes !== null) {
            maxMemorySeen = Math.max(maxMemorySeen, currentMemoryBytes);
          }
        },
      });

      // Should have flushed multiple times
      expect(flushCount).toBeGreaterThan(0);

      // Memory should stay bounded (with some tolerance for batch processing).
      // We use a generous 50% tolerance because:
      // 1. Batch processing overhead - nodes are processed in batches before memory is checked
      // 2. Flush timing - the memory check happens after adding nodes, so a batch may
      //    temporarily exceed the threshold before the flush occurs
      // 3. Shard data structures - internal bookkeeping (Maps, arrays) adds overhead
      //    beyond the raw node/edge data being tracked
      const tolerance = memoryThreshold * 0.5;
      expect(maxMemorySeen).toBeLessThan(memoryThreshold + tolerance);
    });
  });
});
