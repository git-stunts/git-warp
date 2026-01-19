import { describe, it, expect, vi, beforeEach } from 'vitest';
import BitmapIndexService from '../../../../src/domain/services/BitmapIndexService.js';

describe('BitmapIndexService', () => {
  // Sample SHAs with various prefixes for testing sharding behavior
  const SHA_A = 'aa11111111111111111111111111111111111111';
  const SHA_B = 'bb22222222222222222222222222222222222222';
  const SHA_C = 'aa33333333333333333333333333333333333333';
  const SHA_D = 'cc44444444444444444444444444444444444444';

  describe('Static Rebuild Methods', () => {
    describe('createRebuildState', () => {
      it('returns an empty state with required structures', () => {
        const state = BitmapIndexService.createRebuildState();

        expect(state.shaToId).toBeInstanceOf(Map);
        expect(state.idToSha).toBeInstanceOf(Array);
        expect(state.bitmaps).toBeInstanceOf(Map);
        expect(state.shaToId.size).toBe(0);
        expect(state.idToSha.length).toBe(0);
        expect(state.bitmaps.size).toBe(0);
      });

      it('creates independent state objects on each call', () => {
        const state1 = BitmapIndexService.createRebuildState();
        const state2 = BitmapIndexService.createRebuildState();

        state1.shaToId.set('test', 0);
        expect(state2.shaToId.size).toBe(0);
      });
    });

    describe('addEdge', () => {
      let state;

      beforeEach(() => {
        state = BitmapIndexService.createRebuildState();
      });

      it('assigns sequential IDs to new SHAs', () => {
        BitmapIndexService.addEdge(SHA_A, SHA_B, state);

        expect(state.shaToId.get(SHA_A)).toBe(0);
        expect(state.shaToId.get(SHA_B)).toBe(1);
        expect(state.idToSha[0]).toBe(SHA_A);
        expect(state.idToSha[1]).toBe(SHA_B);
      });

      it('reuses existing IDs for known SHAs', () => {
        BitmapIndexService.addEdge(SHA_A, SHA_B, state);
        BitmapIndexService.addEdge(SHA_A, SHA_C, state);

        expect(state.shaToId.get(SHA_A)).toBe(0);
        expect(state.shaToId.get(SHA_B)).toBe(1);
        expect(state.shaToId.get(SHA_C)).toBe(2);
        expect(state.idToSha.length).toBe(3);
      });

      it('creates forward bitmap keyed by source SHA (full)', () => {
        BitmapIndexService.addEdge(SHA_A, SHA_B, state);

        const fwdKey = `fwd_${SHA_A}`;
        expect(state.bitmaps.has(fwdKey)).toBe(true);
        expect(state.bitmaps.get(fwdKey).has(1)).toBe(true); // target ID
      });

      it('creates reverse bitmap keyed by target SHA (full)', () => {
        BitmapIndexService.addEdge(SHA_A, SHA_B, state);

        const revKey = `rev_${SHA_B}`;
        expect(state.bitmaps.has(revKey)).toBe(true);
        expect(state.bitmaps.get(revKey).has(0)).toBe(true); // source ID
      });

      it('creates separate bitmaps for nodes with same prefix', () => {
        // SHA_A and SHA_C share the same prefix 'aa' but get separate bitmaps
        BitmapIndexService.addEdge(SHA_A, SHA_B, state);
        BitmapIndexService.addEdge(SHA_C, SHA_D, state);

        const fwdKeyA = `fwd_${SHA_A}`;
        const fwdKeyC = `fwd_${SHA_C}`;
        expect(state.bitmaps.get(fwdKeyA).has(1)).toBe(true); // SHA_B's ID
        expect(state.bitmaps.get(fwdKeyA).has(3)).toBe(false); // SHA_D's ID NOT in A's bitmap
        expect(state.bitmaps.get(fwdKeyC).has(3)).toBe(true); // SHA_D's ID in C's bitmap
      });

      it('handles self-referential edges', () => {
        BitmapIndexService.addEdge(SHA_A, SHA_A, state);

        expect(state.shaToId.get(SHA_A)).toBe(0);
        expect(state.idToSha.length).toBe(1);

        const fwdKey = `fwd_${SHA_A}`;
        const revKey = `rev_${SHA_A}`;
        expect(state.bitmaps.get(fwdKey).has(0)).toBe(true);
        expect(state.bitmaps.get(revKey).has(0)).toBe(true);
      });
    });

    describe('serialize', () => {
      let state;

      beforeEach(() => {
        state = BitmapIndexService.createRebuildState();
      });

      it('returns empty tree for empty state', () => {
        const tree = BitmapIndexService.serialize(state);
        expect(Object.keys(tree).length).toBe(0);
      });

      it('creates meta JSON shards keyed by SHA prefix', () => {
        BitmapIndexService.addEdge(SHA_A, SHA_B, state);
        const tree = BitmapIndexService.serialize(state);

        expect(tree['meta_aa.json']).toBeDefined();
        expect(tree['meta_bb.json']).toBeDefined();

        const metaAA = JSON.parse(tree['meta_aa.json'].toString());
        expect(metaAA[SHA_A]).toBe(0);
      });

      it('creates JSON shards for forward and reverse indexes', () => {
        BitmapIndexService.addEdge(SHA_A, SHA_B, state);
        const tree = BitmapIndexService.serialize(state);

        // New format: .json files containing {sha: base64Bitmap, ...}
        expect(tree['shards_fwd_aa.json']).toBeDefined();
        expect(tree['shards_rev_bb.json']).toBeDefined();
        expect(tree['shards_fwd_aa.json']).toBeInstanceOf(Buffer);
        expect(tree['shards_rev_bb.json']).toBeInstanceOf(Buffer);
      });

      it('groups SHAs with same prefix into single meta shard', () => {
        BitmapIndexService.addEdge(SHA_A, SHA_B, state);
        BitmapIndexService.addEdge(SHA_C, SHA_D, state);
        const tree = BitmapIndexService.serialize(state);

        const metaAA = JSON.parse(tree['meta_aa.json'].toString());
        expect(metaAA[SHA_A]).toBe(0);
        expect(metaAA[SHA_C]).toBe(2);
      });

      it('produces deserializable per-node bitmaps in JSON shards', async () => {
        const roaring = await import('roaring');
        const { RoaringBitmap32 } = roaring.default;

        BitmapIndexService.addEdge(SHA_A, SHA_B, state);
        const tree = BitmapIndexService.serialize(state);

        // New format: JSON with base64-encoded bitmaps per SHA
        const shard = JSON.parse(tree['shards_fwd_aa.json'].toString());
        expect(shard[SHA_A]).toBeDefined();

        const buffer = Buffer.from(shard[SHA_A], 'base64');
        const bitmap = RoaringBitmap32.deserialize(buffer, true);
        expect(bitmap.has(1)).toBe(true); // SHA_B's ID
      });
    });
  });

  describe('Instance Methods', () => {
    let service;
    let mockPersistence;

    beforeEach(() => {
      mockPersistence = {
        readBlob: vi.fn(),
      };
      service = new BitmapIndexService({ persistence: mockPersistence });
    });

    describe('setup', () => {
      it('initializes shard OID mappings from object', () => {
        const shardOids = {
          'meta_aa.json': 'oid-meta-aa',
          'shards_fwd_aa.json': 'oid-fwd-aa',
        };

        service.setup(shardOids);

        expect(service.shardOids.get('meta_aa.json')).toBe('oid-meta-aa');
        expect(service.shardOids.get('shards_fwd_aa.json')).toBe('oid-fwd-aa');
      });

      it('replaces previous shard mappings', () => {
        service.setup({ 'meta_aa.json': 'oid1' });
        service.setup({ 'meta_bb.json': 'oid2' });

        expect(service.shardOids.has('meta_aa.json')).toBe(false);
        expect(service.shardOids.get('meta_bb.json')).toBe('oid2');
      });
    });

    describe('lookupId', () => {
      it('returns numeric ID for known SHA', async () => {
        const metaData = { [SHA_A]: 42 };
        mockPersistence.readBlob.mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(metaData))
        );
        service.setup({ 'meta_aa.json': 'oid-meta-aa' });

        const id = await service.lookupId(SHA_A);

        expect(id).toBe(42);
        expect(mockPersistence.readBlob).toHaveBeenCalledWith('oid-meta-aa');
      });

      it('returns undefined for unknown SHA in loaded shard', async () => {
        const metaData = { [SHA_A]: 0 };
        mockPersistence.readBlob.mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(metaData))
        );
        service.setup({ 'meta_aa.json': 'oid-meta-aa' });

        const id = await service.lookupId(SHA_C); // Same 'aa' prefix but not in shard

        expect(id).toBeUndefined();
      });

      it('returns undefined when shard OID is not configured', async () => {
        service.setup({}); // No shards configured

        const id = await service.lookupId(SHA_A);

        expect(id).toBeUndefined();
        expect(mockPersistence.readBlob).not.toHaveBeenCalled();
      });

      it('caches loaded shards for subsequent lookups', async () => {
        const metaData = { [SHA_A]: 10, [SHA_C]: 20 };
        mockPersistence.readBlob.mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(metaData))
        );
        service.setup({ 'meta_aa.json': 'oid-meta-aa' });

        await service.lookupId(SHA_A);
        await service.lookupId(SHA_C);

        expect(mockPersistence.readBlob).toHaveBeenCalledTimes(1);
      });

      it('handles persistence errors gracefully', async () => {
        mockPersistence.readBlob.mockRejectedValue(new Error('Blob not found'));
        service.setup({ 'meta_aa.json': 'oid-meta-aa' });

        const id = await service.lookupId(SHA_A);

        expect(id).toBeUndefined();
      });
    });

    describe('_getOrLoadShard', () => {
      it('returns empty object for missing JSON shard', async () => {
        service.setup({});
        const result = await service._getOrLoadShard('meta_xx.json', 'json');
        expect(result).toEqual({});
      });

      it('returns empty bitmap for missing bitmap shard', async () => {
        const roaring = await import('roaring');
        const { RoaringBitmap32 } = roaring.default;

        service.setup({});
        const result = await service._getOrLoadShard('shards_fwd_xx.bitmap', 'bitmap');

        expect(result).toBeInstanceOf(RoaringBitmap32);
        expect(result.size).toBe(0);
      });

      it('loads and deserializes JSON shard correctly', async () => {
        const data = { foo: 'bar' };
        mockPersistence.readBlob.mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(data))
        );
        service.setup({ 'test.json': 'oid-test' });

        const result = await service._getOrLoadShard('test.json', 'json');

        expect(result).toEqual(data);
      });

      it('loads and deserializes bitmap shard correctly', async () => {
        const roaring = await import('roaring');
        const { RoaringBitmap32 } = roaring.default;

        const bitmap = new RoaringBitmap32([1, 2, 3]);
        const serialized = bitmap.serialize(true);
        mockPersistence.readBlob.mockResolvedValue(serialized);
        service.setup({ 'test.bitmap': 'oid-test' });

        const result = await service._getOrLoadShard('test.bitmap', 'bitmap');

        expect(result).toBeInstanceOf(RoaringBitmap32);
        expect(result.has(1)).toBe(true);
        expect(result.has(2)).toBe(true);
        expect(result.has(3)).toBe(true);
      });
    });
  });

  /**
   * =============================================================================
   * NEW QUERY METHODS - Tests for functionality that needs to be implemented
   * These tests are expected to FAIL until the methods are implemented.
   * =============================================================================
   */
  describe('NEW: Query Methods (to be implemented)', () => {
    let service;
    let mockPersistence;
    let state;

    // Helper to build a complete index with known structure
    async function buildTestIndex() {
      state = BitmapIndexService.createRebuildState();
      // Build a graph: A -> B -> C, A -> D
      BitmapIndexService.addEdge(SHA_A, SHA_B, state);
      BitmapIndexService.addEdge(SHA_B, SHA_C, state);
      BitmapIndexService.addEdge(SHA_A, SHA_D, state);
      return BitmapIndexService.serialize(state);
    }

    beforeEach(async () => {
      const tree = await buildTestIndex();

      // Mock persistence to return serialized data
      mockPersistence = {
        readBlob: vi.fn().mockImplementation(async (oid) => {
          // Map OIDs to tree entries
          const oidMap = {};
          for (const [path, buffer] of Object.entries(tree)) {
            oidMap[`oid-${path}`] = buffer;
          }
          return oidMap[oid];
        }),
      };

      service = new BitmapIndexService({ persistence: mockPersistence });

      // Setup shard OIDs
      const shardOids = {};
      for (const path of Object.keys(tree)) {
        shardOids[path] = `oid-${path}`;
      }
      service.setup(shardOids);
    });

    describe('getParents (returns parent SHAs for a node)', () => {
      it('returns empty array for node with no parents (root node)', async () => {
        // SHA_A has no incoming edges (it's a root)
        const parents = await service.getParents(SHA_A);

        expect(parents).toEqual([]);
      });

      it('returns single parent SHA for node with one parent', async () => {
        // SHA_B has one parent: SHA_A
        const parents = await service.getParents(SHA_B);

        expect(parents).toHaveLength(1);
        expect(parents).toContain(SHA_A);
      });

      it('returns all parent SHAs for node with multiple parents', async () => {
        // Add another edge to make SHA_B have multiple parents
        const stateWithMultipleParents = BitmapIndexService.createRebuildState();
        BitmapIndexService.addEdge(SHA_A, SHA_B, stateWithMultipleParents);
        BitmapIndexService.addEdge(SHA_C, SHA_B, stateWithMultipleParents);
        const tree = BitmapIndexService.serialize(stateWithMultipleParents);

        const shardOids = {};
        for (const path of Object.keys(tree)) {
          shardOids[path] = `oid-${path}`;
        }

        mockPersistence.readBlob.mockImplementation(async (oid) => {
          const oidMap = {};
          for (const [path, buffer] of Object.entries(tree)) {
            oidMap[`oid-${path}`] = buffer;
          }
          return oidMap[oid];
        });

        service.setup(shardOids);

        const parents = await service.getParents(SHA_B);

        expect(parents).toHaveLength(2);
        expect(parents).toContain(SHA_A);
        expect(parents).toContain(SHA_C);
      });

      it('returns empty array for unknown SHA', async () => {
        const unknownSha = 'ff99999999999999999999999999999999999999';
        const parents = await service.getParents(unknownSha);

        expect(parents).toEqual([]);
      });

      it('provides O(1) lookup via reverse bitmap', async () => {
        // This test verifies the implementation uses the bitmap approach
        // by checking that it accesses the reverse shard, not all shards
        await service.getParents(SHA_B);

        // Should only load the reverse shard for SHA_B's prefix and meta shards
        const calls = mockPersistence.readBlob.mock.calls.map(c => c[0]);
        expect(calls.some(c => c.includes('rev_bb'))).toBe(true);
      });
    });

    describe('getChildren (returns child SHAs for a node)', () => {
      it('returns empty array for leaf node with no children', async () => {
        // SHA_C has no outgoing edges (it's a leaf)
        const children = await service.getChildren(SHA_C);

        expect(children).toEqual([]);
      });

      it('returns single child SHA for node with one child', async () => {
        // SHA_B has one child: SHA_C
        const children = await service.getChildren(SHA_B);

        expect(children).toHaveLength(1);
        expect(children).toContain(SHA_C);
      });

      it('returns all child SHAs for node with multiple children', async () => {
        // SHA_A has two children: SHA_B and SHA_D
        const children = await service.getChildren(SHA_A);

        expect(children).toHaveLength(2);
        expect(children).toContain(SHA_B);
        expect(children).toContain(SHA_D);
      });

      it('returns empty array for unknown SHA', async () => {
        const unknownSha = 'ff99999999999999999999999999999999999999';
        const children = await service.getChildren(unknownSha);

        expect(children).toEqual([]);
      });

      it('provides O(1) lookup via forward bitmap', async () => {
        // This test verifies the implementation uses the bitmap approach
        await service.getChildren(SHA_A);

        const calls = mockPersistence.readBlob.mock.calls.map(c => c[0]);
        expect(calls.some(c => c.includes('fwd_aa'))).toBe(true);
      });
    });

    describe('getParents and getChildren consistency', () => {
      it('maintains bidirectional relationship integrity', async () => {
        // If B is a child of A, then A should be a parent of B
        const childrenOfA = await service.getChildren(SHA_A);

        for (const childSha of childrenOfA) {
          const parentsOfChild = await service.getParents(childSha);
          expect(parentsOfChild).toContain(SHA_A);
        }
      });

      it('round-trips through parent-child relationship', async () => {
        // For any edge A->B:
        // getChildren(A) should include B
        // getParents(B) should include A
        const children = await service.getChildren(SHA_A);
        expect(children).toContain(SHA_B);

        const parents = await service.getParents(SHA_B);
        expect(parents).toContain(SHA_A);
      });
    });
  });

  /**
   * =============================================================================
   * Integration-style tests for the full rebuild->query workflow
   * =============================================================================
   */
  describe('End-to-End: Rebuild and Query', () => {
    it('can query relationships after a full rebuild cycle', async () => {
      // This test demonstrates the intended workflow:
      // 1. Create rebuild state
      // 2. Add edges from graph traversal
      // 3. Serialize to tree
      // 4. "Persist" (in-memory mock)
      // 5. Setup service with shard OIDs
      // 6. Query parents/children

      const state = BitmapIndexService.createRebuildState();
      BitmapIndexService.addEdge(SHA_A, SHA_B, state);
      BitmapIndexService.addEdge(SHA_B, SHA_C, state);

      const tree = BitmapIndexService.serialize(state);

      // Mock persistence layer
      const blobStore = new Map();
      for (const [path, buffer] of Object.entries(tree)) {
        blobStore.set(`oid-${path}`, buffer);
      }

      const mockPersistence = {
        readBlob: vi.fn().mockImplementation(async (oid) => blobStore.get(oid)),
      };

      const service = new BitmapIndexService({ persistence: mockPersistence });
      const shardOids = {};
      for (const path of Object.keys(tree)) {
        shardOids[path] = `oid-${path}`;
      }
      service.setup(shardOids);

      // Verify ID lookups work
      const idA = await service.lookupId(SHA_A);
      const idB = await service.lookupId(SHA_B);
      expect(idA).toBe(0);
      expect(idB).toBe(1);

      // Verify parent/child relationships
      const parentsOfB = await service.getParents(SHA_B);
      expect(parentsOfB).toContain(SHA_A);

      const childrenOfA = await service.getChildren(SHA_A);
      expect(childrenOfA).toContain(SHA_B);
    });
  });
});
