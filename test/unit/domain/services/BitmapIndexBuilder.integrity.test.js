import { describe, it, expect } from 'vitest';
import BitmapIndexBuilder from '../../../../src/domain/services/BitmapIndexBuilder.js';

describe('BitmapIndexBuilder Integrity Tests', () => {
  describe('Merkle-like properties', () => {
    it('produces different serialization for different graph structures', () => {
      // Graph A: a -> b -> c (linear)
      const builderA = new BitmapIndexBuilder();
      builderA.addEdge('aaa', 'bbb');
      builderA.addEdge('bbb', 'ccc');
      const treeA = builderA.serialize();

      // Graph B: a -> b, a -> c (fork)
      const builderB = new BitmapIndexBuilder();
      builderB.addEdge('aaa', 'bbb');
      builderB.addEdge('aaa', 'ccc');
      const treeB = builderB.serialize();

      // The forward shard for 'aaa' should differ
      const fwdA = treeA['shards_fwd_aa.json']?.toString();
      const fwdB = treeB['shards_fwd_aa.json']?.toString();

      expect(fwdA).not.toBe(fwdB);
    });

    it('produces identical serialization for identical graphs', () => {
      const builder1 = new BitmapIndexBuilder();
      builder1.addEdge('aaa', 'bbb');
      builder1.addEdge('bbb', 'ccc');

      const builder2 = new BitmapIndexBuilder();
      builder2.addEdge('aaa', 'bbb');
      builder2.addEdge('bbb', 'ccc');

      const tree1 = builder1.serialize();
      const tree2 = builder2.serialize();

      // Same structure should produce same output
      expect(Object.keys(tree1).sort()).toEqual(Object.keys(tree2).sort());

      for (const key of Object.keys(tree1)) {
        expect(tree1[key].toString()).toBe(tree2[key].toString());
      }
    });

    it('detects when a node is added to an existing graph', () => {
      const builder1 = new BitmapIndexBuilder();
      builder1.addEdge('aaa', 'bbb');
      const tree1 = builder1.serialize();

      const builder2 = new BitmapIndexBuilder();
      builder2.addEdge('aaa', 'bbb');
      builder2.addEdge('bbb', 'ccc'); // Extra edge
      const tree2 = builder2.serialize();

      // tree2 should have more shards or different content
      const keys1 = Object.keys(tree1).sort();
      const keys2 = Object.keys(tree2).sort();

      // Either more files or different content
      const hasMoreFiles = keys2.length > keys1.length;
      const hasDifferentContent = keys1.some(k =>
        tree1[k]?.toString() !== tree2[k]?.toString()
      );

      expect(hasMoreFiles || hasDifferentContent).toBe(true);
    });

    it('node ID assignment is deterministic based on insertion order', () => {
      // Same insertion order = same IDs
      const builder1 = new BitmapIndexBuilder();
      builder1.registerNode('aaa');
      builder1.registerNode('bbb');
      builder1.registerNode('ccc');

      const builder2 = new BitmapIndexBuilder();
      builder2.registerNode('aaa');
      builder2.registerNode('bbb');
      builder2.registerNode('ccc');

      expect(builder1.shaToId.get('aaa')).toBe(builder2.shaToId.get('aaa'));
      expect(builder1.shaToId.get('bbb')).toBe(builder2.shaToId.get('bbb'));
      expect(builder1.shaToId.get('ccc')).toBe(builder2.shaToId.get('ccc'));
    });

    it('different insertion order produces different ID mappings', () => {
      const builder1 = new BitmapIndexBuilder();
      builder1.registerNode('aaa');
      builder1.registerNode('bbb');

      const builder2 = new BitmapIndexBuilder();
      builder2.registerNode('bbb'); // Different order
      builder2.registerNode('aaa');

      // IDs should be swapped
      expect(builder1.shaToId.get('aaa')).toBe(0);
      expect(builder1.shaToId.get('bbb')).toBe(1);
      expect(builder2.shaToId.get('bbb')).toBe(0);
      expect(builder2.shaToId.get('aaa')).toBe(1);
    });
  });
});
