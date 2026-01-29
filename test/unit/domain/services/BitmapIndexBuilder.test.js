import { describe, it, expect } from 'vitest';
import BitmapIndexBuilder from '../../../../src/domain/services/BitmapIndexBuilder.js';

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
    it('produces sharded output structure', () => {
      const builder = new BitmapIndexBuilder();
      builder.registerNode('aabbcc');
      builder.addEdge('aabbcc', 'aaddee');

      const tree = builder.serialize();

      // Should have meta shard for 'aa' prefix
      expect(tree['meta_aa.json']).toBeDefined();
      // Should have forward/reverse shards
      expect(Object.keys(tree).some(k => k.startsWith('shards_fwd_'))).toBe(true);
      expect(Object.keys(tree).some(k => k.startsWith('shards_rev_'))).toBe(true);
    });

    it('encodes bitmaps as base64 in JSON', () => {
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbcc', 'aaddee');

      const tree = builder.serialize();
      const envelope = JSON.parse(tree['shards_fwd_aa.json'].toString());

      // Shard is wrapped in version/checksum envelope
      expect(envelope.version).toBeDefined();
      expect(envelope.checksum).toBeDefined();
      expect(typeof envelope.data['aabbcc']).toBe('string'); // base64 encoded
    });
  });
});
