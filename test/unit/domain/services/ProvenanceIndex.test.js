import { describe, it, expect } from 'vitest';
import ProvenanceIndex from '../../../../src/domain/services/ProvenanceIndex.js';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.js';

describe('ProvenanceIndex', () => {
  describe('constructor', () => {
    it('creates empty index with no arguments', () => {
      const index = new ProvenanceIndex();
      expect(index.size).toBe(0);
    });

    it('creates empty index via static empty()', () => {
      const index = ProvenanceIndex.empty();
      expect(index.size).toBe(0);
    });

    it('creates index from initial Map', () => {
      const initialMap = new Map([
        ['node:a', new Set(['sha1', 'sha2'])],
      ]);
      const index = new ProvenanceIndex(initialMap);
      expect(index.size).toBe(1);
      expect(index.patchesFor('node:a')).toEqual(['sha1', 'sha2']);
    });
  });

  describe('addPatch', () => {
    it('adds reads to index', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['node:a', 'node:b'], undefined);

      expect(index.patchesFor('node:a')).toEqual(['sha1']);
      expect(index.patchesFor('node:b')).toEqual(['sha1']);
    });

    it('adds writes to index', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', undefined, ['node:a', 'node:b']);

      expect(index.patchesFor('node:a')).toEqual(['sha1']);
      expect(index.patchesFor('node:b')).toEqual(['sha1']);
    });

    it('handles both reads and writes', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['node:a'], ['node:b', 'node:c']);

      expect(index.patchesFor('node:a')).toEqual(['sha1']);
      expect(index.patchesFor('node:b')).toEqual(['sha1']);
      expect(index.patchesFor('node:c')).toEqual(['sha1']);
    });

    it('deduplicates patches for same entity', () => {
      const index = new ProvenanceIndex();
      // Entity appears in both reads and writes
      index.addPatch('sha1', ['node:a'], ['node:a']);

      expect(index.patchesFor('node:a')).toEqual(['sha1']);
    });

    it('accumulates patches from multiple calls', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['node:a'], []);
      index.addPatch('sha2', ['node:a'], []);
      index.addPatch('sha3', [], ['node:a']);

      expect(index.patchesFor('node:a')).toEqual(['sha1', 'sha2', 'sha3']);
    });

    it('returns this for chaining', () => {
      const index = new ProvenanceIndex();
      const result = index.addPatch('sha1', ['node:a'], []);
      expect(result).toBe(index);
    });

    it('handles empty reads/writes', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', [], []);
      index.addPatch('sha2', undefined, undefined);

      expect(index.size).toBe(0);
    });

    it('indexes edge keys', () => {
      const index = new ProvenanceIndex();
      const edgeKey = encodeEdgeKey('node:a', 'node:b', 'follows');
      index.addPatch('sha1', [edgeKey], []);

      expect(index.patchesFor(edgeKey)).toEqual(['sha1']);
    });
  });

  describe('patchesFor', () => {
    it('returns empty array for unknown entity', () => {
      const index = new ProvenanceIndex();
      expect(index.patchesFor('unknown')).toEqual([]);
    });

    it('returns sorted patch SHAs', () => {
      const index = new ProvenanceIndex();
      index.addPatch('zzz', ['node:a'], []);
      index.addPatch('aaa', ['node:a'], []);
      index.addPatch('mmm', ['node:a'], []);

      expect(index.patchesFor('node:a')).toEqual(['aaa', 'mmm', 'zzz']);
    });
  });

  describe('has', () => {
    it('returns false for unknown entity', () => {
      const index = new ProvenanceIndex();
      expect(index.has('unknown')).toBe(false);
    });

    it('returns true for indexed entity', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['node:a'], []);
      expect(index.has('node:a')).toBe(true);
    });
  });

  describe('size', () => {
    it('returns 0 for empty index', () => {
      const index = new ProvenanceIndex();
      expect(index.size).toBe(0);
    });

    it('returns count of indexed entities', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['a', 'b'], ['c']);
      expect(index.size).toBe(3);
    });
  });

  describe('entities', () => {
    it('returns empty array for empty index', () => {
      const index = new ProvenanceIndex();
      expect(index.entities()).toEqual([]);
    });

    it('returns sorted entity IDs', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['c', 'a', 'b'], []);
      expect(index.entities()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['a', 'b'], []);
      index.clear();
      expect(index.size).toBe(0);
    });

    it('returns this for chaining', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['a'], []);
      const result = index.clear();
      expect(result).toBe(index);
    });
  });

  describe('merge', () => {
    it('merges another index into this one', () => {
      const index1 = new ProvenanceIndex();
      index1.addPatch('sha1', ['a'], []);

      const index2 = new ProvenanceIndex();
      index2.addPatch('sha2', ['b'], []);

      index1.merge(index2);

      expect(index1.patchesFor('a')).toEqual(['sha1']);
      expect(index1.patchesFor('b')).toEqual(['sha2']);
      expect(index1.size).toBe(2);
    });

    it('combines patches for same entity', () => {
      const index1 = new ProvenanceIndex();
      index1.addPatch('sha1', ['a'], []);

      const index2 = new ProvenanceIndex();
      index2.addPatch('sha2', ['a'], []);

      index1.merge(index2);

      expect(index1.patchesFor('a')).toEqual(['sha1', 'sha2']);
    });

    it('returns this for chaining', () => {
      const index1 = new ProvenanceIndex();
      const index2 = new ProvenanceIndex();
      const result = index1.merge(index2);
      expect(result).toBe(index1);
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['a'], []);

      const clone = index.clone();
      clone.addPatch('sha2', ['a'], []);

      expect(index.patchesFor('a')).toEqual(['sha1']);
      expect(clone.patchesFor('a')).toEqual(['sha1', 'sha2']);
    });
  });

  describe('serialization', () => {
    describe('serialize/deserialize', () => {
      it('roundtrips empty index', () => {
        const index = new ProvenanceIndex();
        const buffer = /** @type {Buffer} */ (index.serialize());
        const restored = ProvenanceIndex.deserialize(buffer);

        expect(restored.size).toBe(0);
      });

      it('roundtrips populated index', () => {
        const index = new ProvenanceIndex();
        index.addPatch('sha1', ['a', 'b'], []);
        index.addPatch('sha2', ['a'], ['c']);
        index.addPatch('sha3', [], ['a']);

        const buffer = /** @type {Buffer} */ (index.serialize());
        const restored = ProvenanceIndex.deserialize(buffer);

        expect(restored.patchesFor('a')).toEqual(['sha1', 'sha2', 'sha3']);
        expect(restored.patchesFor('b')).toEqual(['sha1']);
        expect(restored.patchesFor('c')).toEqual(['sha2']);
        expect(restored.size).toBe(3);
      });

      it('produces deterministic output', () => {
        const index1 = new ProvenanceIndex();
        index1.addPatch('sha1', ['b', 'a'], []);

        const index2 = new ProvenanceIndex();
        index2.addPatch('sha1', ['a', 'b'], []);

        const buffer1 = /** @type {Buffer} */ (index1.serialize());
        const buffer2 = /** @type {Buffer} */ (index2.serialize());

        expect(buffer1.equals(buffer2)).toBe(true);
      });

      it('throws on unsupported version', async () => {
        const index = new ProvenanceIndex();
        const buffer = index.serialize();

        // Manually create a buffer with version 99
        const { encode } = await import('../../../../src/infrastructure/codecs/CborCodec.js');
        const badData = encode({ version: 99, entries: [] });

        expect(() => ProvenanceIndex.deserialize(badData)).toThrow('Unsupported');
      });
    });

    describe('toJSON/fromJSON', () => {
      it('roundtrips empty index', () => {
        const index = new ProvenanceIndex();
        const json = index.toJSON();
        const restored = ProvenanceIndex.fromJSON(json);

        expect(restored.size).toBe(0);
      });

      it('roundtrips populated index', () => {
        const index = new ProvenanceIndex();
        index.addPatch('sha1', ['a', 'b'], []);
        index.addPatch('sha2', ['a'], ['c']);

        const json = index.toJSON();
        const restored = ProvenanceIndex.fromJSON(json);

        expect(restored.patchesFor('a')).toEqual(['sha1', 'sha2']);
        expect(restored.patchesFor('b')).toEqual(['sha1']);
        expect(restored.patchesFor('c')).toEqual(['sha2']);
      });

      it('produces JSON with sorted entries', () => {
        const index = new ProvenanceIndex();
        index.addPatch('sha1', ['z', 'a'], []);

        const json = /** @type {any} */ (index.toJSON());

        expect(json.version).toBe(1);
        expect(json.entries[0][0]).toBe('a');
        expect(json.entries[1][0]).toBe('z');
      });

      it('throws on unsupported version', () => {
        expect(() => ProvenanceIndex.fromJSON({ version: 99, entries: [] })).toThrow('Unsupported');
      });

      it('throws on missing entries in fromJSON', () => {
        expect(() => ProvenanceIndex.fromJSON({ version: 1 })).toThrow('Missing or invalid ProvenanceIndex entries');
      });

      it('throws on null entries in fromJSON', () => {
        expect(() => ProvenanceIndex.fromJSON(/** @type {any} */ ({ version: 1, entries: null }))).toThrow('Missing or invalid ProvenanceIndex entries');
      });

      it('handles empty entries array in fromJSON', () => {
        const restored = ProvenanceIndex.fromJSON({ version: 1, entries: [] });
        expect(restored.size).toBe(0);
      });

      it('throws on missing entries in deserialize', async () => {
        const { encode } = await import('../../../../src/infrastructure/codecs/CborCodec.js');
        const badData = encode({ version: 1 }); // missing entries field
        expect(() => ProvenanceIndex.deserialize(badData)).toThrow('Missing or invalid ProvenanceIndex entries');
      });

      it('throws on null entries in deserialize', async () => {
        const { encode } = await import('../../../../src/infrastructure/codecs/CborCodec.js');
        const badData = encode({ version: 1, entries: null });
        expect(() => ProvenanceIndex.deserialize(badData)).toThrow('Missing or invalid ProvenanceIndex entries');
      });
    });
  });

  describe('iteration', () => {
    it('supports for...of', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['a'], []);
      index.addPatch('sha2', ['b'], []);

      const collected = [];
      for (const [entityId, shas] of index) {
        collected.push([entityId, shas]);
      }

      expect(collected.length).toBe(2);
    });

    it('yields sorted SHAs for each entity', () => {
      const index = new ProvenanceIndex();
      index.addPatch('zzz', ['a'], []);
      index.addPatch('aaa', ['a'], []);

      const entries = [...index];
      const aEntry = /** @type {[string, string[]]} */ (entries.find(e => e[0] === 'a'));
      expect(aEntry[1]).toEqual(['aaa', 'zzz']);
    });

    it('yields entities in deterministic sorted order', () => {
      const index = new ProvenanceIndex();
      // Add in non-alphabetical order
      index.addPatch('sha1', ['z', 'a', 'm'], []);

      const entityIds = [...index].map(([entityId]) => entityId);
      expect(entityIds).toEqual(['a', 'm', 'z']);
    });

    it('produces same iteration order as toJSON entries', () => {
      const index = new ProvenanceIndex();
      index.addPatch('sha1', ['c', 'a', 'b'], []);

      const iteratedIds = [...index].map(([id]) => id);
      const jsonIds = /** @type {any} */ (index.toJSON()).entries.map((/** @type {any[]} */ [id]) => id);

      expect(iteratedIds).toEqual(jsonIds);
    });
  });

  describe('complex scenarios', () => {
    it('golden path: 3 patches affecting node X', () => {
      const index = new ProvenanceIndex();

      // Patch 1: adds node X and sets property
      index.addPatch('patch1', [], ['node:X']);

      // Patch 2: adds edge from X to Y (reads X)
      index.addPatch('patch2', ['node:X'], [encodeEdgeKey('node:X', 'node:Y', 'follows')]);

      // Patch 3: updates property on X (reads and writes X)
      index.addPatch('patch3', ['node:X'], ['node:X']);

      expect(index.patchesFor('node:X')).toEqual(['patch1', 'patch2', 'patch3']);
    });

    it('handles patches from multiple writers', () => {
      const index = new ProvenanceIndex();

      // Writer A's patches
      index.addPatch('writer-a-1', [], ['node:shared']);
      index.addPatch('writer-a-2', ['node:shared'], ['node:shared']);

      // Writer B's patches
      index.addPatch('writer-b-1', ['node:shared'], []);
      index.addPatch('writer-b-2', [], ['node:shared']);

      const shas = index.patchesFor('node:shared');
      expect(shas).toContain('writer-a-1');
      expect(shas).toContain('writer-a-2');
      expect(shas).toContain('writer-b-1');
      expect(shas).toContain('writer-b-2');
      expect(shas.length).toBe(4);
    });

    it('stress: 1000 patches index correctly', () => {
      const index = new ProvenanceIndex();

      for (let i = 0; i < 1000; i++) {
        const reads = [`node:${i % 10}`, `node:${(i + 1) % 10}`];
        const writes = [`node:${i % 5}`];
        index.addPatch(`patch-${i}`, reads, writes);
      }

      // Verify correctness (performance testing belongs in benchmarks, not unit tests)
      expect(index.size).toBe(10); // nodes 0-9
      expect(index.patchesFor('node:0').length).toBeGreaterThan(0);
    });
  });
});
