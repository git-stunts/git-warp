import { describe, it, expect } from 'vitest';
import BitmapIndexBuilder, { SHARD_VERSION } from '../../../../src/domain/services/BitmapIndexBuilder.js';

describe('BitmapIndexBuilder', () => {
  describe('SHARD_VERSION export', () => {
    it('exports SHARD_VERSION as 2 (current format)', () => {
      expect(SHARD_VERSION).toBe(2);
    });
  });

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

    it('writes v2 shards by default', () => {
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbcc', 'ddeeff');

      const tree = builder.serialize();

      // Check meta shard
      const metaEnvelope = JSON.parse(tree['meta_aa.json'].toString());
      expect(metaEnvelope.version).toBe(2);

      // Check forward shard
      const fwdEnvelope = JSON.parse(tree['shards_fwd_aa.json'].toString());
      expect(fwdEnvelope.version).toBe(2);

      // Check reverse shard
      const revEnvelope = JSON.parse(tree['shards_rev_dd.json'].toString());
      expect(revEnvelope.version).toBe(2);
    });

    it('uses SHARD_VERSION constant for serialized version', () => {
      const builder = new BitmapIndexBuilder();
      builder.registerNode('testsha1');

      const tree = builder.serialize();
      const envelope = JSON.parse(tree['meta_te.json'].toString());

      expect(envelope.version).toBe(SHARD_VERSION);
    });
  });
});
