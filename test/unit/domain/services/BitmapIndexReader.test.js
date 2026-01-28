import { describe, it, expect, vi, beforeEach } from 'vitest';
import BitmapIndexReader from '../../../../src/domain/services/BitmapIndexReader.js';
import BitmapIndexBuilder from '../../../../src/domain/services/BitmapIndexBuilder.js';

describe('BitmapIndexReader', () => {
  let mockStorage;
  let reader;

  beforeEach(() => {
    mockStorage = {
      readBlob: vi.fn(),
    };
    reader = new BitmapIndexReader({ storage: mockStorage });
  });

  describe('setup', () => {
    it('stores shard OIDs for lazy loading', () => {
      reader.setup({ 'meta_aa.json': 'oid1', 'shards_fwd_aa.json': 'oid2' });
      expect(reader.shardOids.size).toBe(2);
    });

    it('clears cache when called', () => {
      reader._idToShaCache = ['test'];
      reader.loadedShards.set('test', {});

      reader.setup({});

      expect(reader._idToShaCache).toBeNull();
      expect(reader.loadedShards.size).toBe(0);
    });
  });

  describe('getParents / getChildren', () => {
    it('returns empty array for unknown SHA', async () => {
      reader.setup({});
      const parents = await reader.getParents('unknown');
      expect(parents).toEqual([]);
    });

    it('loads and decodes bitmap data', async () => {
      // Build a real index
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbccdd', 'eeffgghh');
      const tree = builder.serialize();

      // Mock storage to return serialized data
      mockStorage.readBlob.mockImplementation(async (oid) => {
        if (oid === 'meta-oid') return tree['meta_aa.json'] || tree['meta_ee.json'];
        if (oid === 'rev-oid') return tree['shards_rev_ee.json'];
        return Buffer.from('{}');
      });

      reader.setup({
        'meta_aa.json': 'meta-oid',
        'meta_ee.json': 'meta-oid',
        'shards_rev_ee.json': 'rev-oid',
      });

      const parents = await reader.getParents('eeffgghh');
      expect(parents).toContain('aabbccdd');
    });
  });

  describe('lookupId', () => {
    it('returns undefined for unknown SHA', async () => {
      reader.setup({});
      const id = await reader.lookupId('unknown');
      expect(id).toBeUndefined();
    });
  });

  describe('corrupt shard recovery', () => {
    it('returns empty array when shard OID points to non-existent blob', async () => {
      mockStorage.readBlob.mockRejectedValue(new Error('object not found'));

      reader.setup({
        'meta_ab.json': 'nonexistent-oid',
        'shards_rev_ab.json': 'also-nonexistent'
      });

      const parents = await reader.getParents('abcd1234');
      expect(parents).toEqual([]);
    });

    it('returns empty array when shard contains invalid JSON', async () => {
      mockStorage.readBlob.mockResolvedValue(Buffer.from('not valid json {{{'));

      reader.setup({
        'meta_ab.json': 'corrupt-oid',
        'shards_rev_ab.json': 'corrupt-oid'
      });

      const parents = await reader.getParents('abcd1234');
      expect(parents).toEqual([]);
    });

    it('returns empty array when shard contains wrong data type', async () => {
      // Valid JSON but wrong structure (array instead of object)
      mockStorage.readBlob.mockResolvedValue(Buffer.from('[1,2,3]'));

      reader.setup({
        'shards_rev_ab.json': 'wrong-type-oid'
      });

      const parents = await reader.getParents('abcd1234');
      expect(parents).toEqual([]);
    });

    it('continues working after encountering corrupt shard', async () => {
      // Build a real index for comparison
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbccdd', 'eeffgghh');
      const tree = builder.serialize();

      let callCount = 0;
      mockStorage.readBlob.mockImplementation(async (oid) => {
        callCount++;
        // First call corrupts, subsequent calls succeed
        if (callCount === 1) {
          throw new Error('transient failure');
        }
        // Return real data for subsequent calls
        if (oid === 'meta-oid') return tree['meta_aa.json'] || tree['meta_ee.json'];
        if (oid === 'rev-oid') return tree['shards_rev_ee.json'];
        return Buffer.from('{}');
      });

      reader.setup({
        'meta_aa.json': 'meta-oid',
        'meta_ee.json': 'meta-oid',
        'shards_rev_ee.json': 'rev-oid',
        'shards_rev_aa.json': 'corrupt-oid' // This one fails
      });

      // First query hits corrupt shard, should degrade gracefully
      const result1 = await reader.getParents('aabbccdd');
      expect(result1).toEqual([]); // Graceful degradation

      // Reader should still be functional for other queries
      // (shards are cached, so this tests the reader didn't crash)
      expect(reader.shardOids.size).toBe(4);
    });
  });
});
