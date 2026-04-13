import { describe, it, expect } from 'vitest';
import BitmapIndexBuilder from '../../../../src/domain/services/index/BitmapIndexBuilder.ts';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.ts';

describe('BitmapIndexBuilder', () => {
  describe('constructor', () => {
    it('creates an empty builder', () => {
      const builder = new BitmapIndexBuilder();
      expect(builder.shaToId.size).toBe(0);
      expect(builder.idToSha.length).toBe(0);
      expect(builder.bitmaps.size).toBe(0);
    });
  });

  describe('registerNode', () => {
    it('assigns sequential IDs to nodes', () => {
      const builder = new BitmapIndexBuilder();
      const id1 = builder.registerNode('sha1');
      const id2 = builder.registerNode('sha2');
      expect(id1).toBe(0);
      expect(id2).toBe(1);
    });

    it('returns existing ID for duplicate SHA', () => {
      const builder = new BitmapIndexBuilder();
      const id1 = builder.registerNode('sha1');
      const id2 = builder.registerNode('sha1');
      expect(id1).toBe(id2);
    });
  });

  describe('addEdge', () => {
    it('creates forward and reverse bitmaps', () => {
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbccdd', 'eeffgghh');

      expect(builder.bitmaps.has('fwd_aabbccdd')).toBe(true);
      expect(builder.bitmaps.has('rev_eeffgghh')).toBe(true);
    });
  });

  describe('serialize', () => {
    it('produces sharded output structure', async () => {
      const builder = new BitmapIndexBuilder();
      builder.registerNode('aabbcc');
      builder.addEdge('aabbcc', 'aaddee');

      const tree = await builder.serialize();

      // Should have meta shard for 'aa' prefix
      expect(tree['meta_aa.cbor']).toBeDefined();
      // Should have forward/reverse shards
      expect(Object.keys(tree).some(k => k.startsWith('shards_fwd_'))).toBe(true);
      expect(Object.keys(tree).some(k => k.startsWith('shards_rev_'))).toBe(true);
    });

    it('encodes bitmaps as Uint8Array in CBOR', async () => {
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbcc', 'aaddee');

      const tree = await builder.serialize();
      const data = defaultCodec.decode((tree['shards_fwd_aa.cbor'] as Uint8Array));

      // Decoded data IS the shard map — no envelope wrapping
      expect(((data))['aabbcc']).toBeInstanceOf(Uint8Array);
    });

    it('writes CBOR shards with no version envelope', async () => {
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbcc', 'ddeeff');

      const tree = await builder.serialize();

      // Decode meta shard — should be a plain ID map, no version/checksum
      const metaData = defaultCodec.decode((tree['meta_aa.cbor'] as Uint8Array));
      expect(metaData).not.toHaveProperty('version');
      expect(metaData).not.toHaveProperty('checksum');

      // Decode forward shard — should be a plain bitmap map, no envelope
      const fwdData = defaultCodec.decode((tree['shards_fwd_aa.cbor'] as Uint8Array));
      expect(fwdData).not.toHaveProperty('version');
      expect(fwdData).not.toHaveProperty('checksum');

      // Decode reverse shard — should be a plain bitmap map, no envelope
      const revData = defaultCodec.decode((tree['shards_rev_dd.cbor'] as Uint8Array));
      expect(revData).not.toHaveProperty('version');
      expect(revData).not.toHaveProperty('checksum');
    });
  });
});
