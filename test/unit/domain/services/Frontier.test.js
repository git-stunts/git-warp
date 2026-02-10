import { describe, it, expect } from 'vitest';
import {
  createFrontier,
  updateFrontier,
  getFrontierEntry,
  getWriters,
  serializeFrontier,
  deserializeFrontier,
  cloneFrontier,
  mergeFrontiers,
} from '../../../../src/domain/services/Frontier.js';

describe('Frontier', () => {
  describe('createFrontier', () => {
    it('returns empty Map', () => {
      const frontier = createFrontier();

      expect(frontier).toBeInstanceOf(Map);
      expect(frontier.size).toBe(0);
    });
  });

  describe('updateFrontier', () => {
    it('adds entry', () => {
      const frontier = createFrontier();

      updateFrontier(frontier, 'writer1', 'sha123');

      expect(frontier.get('writer1')).toBe('sha123');
      expect(frontier.size).toBe(1);
    });

    it('overwrites entry', () => {
      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', 'sha123');

      updateFrontier(frontier, 'writer1', 'sha456');

      expect(frontier.get('writer1')).toBe('sha456');
      expect(frontier.size).toBe(1);
    });

    it('maintains multiple writers', () => {
      const frontier = createFrontier();

      updateFrontier(frontier, 'writer1', 'sha111');
      updateFrontier(frontier, 'writer2', 'sha222');
      updateFrontier(frontier, 'writer3', 'sha333');

      expect(frontier.size).toBe(3);
      expect(frontier.get('writer1')).toBe('sha111');
      expect(frontier.get('writer2')).toBe('sha222');
      expect(frontier.get('writer3')).toBe('sha333');
    });
  });

  describe('getFrontierEntry', () => {
    it('returns value for existing writer', () => {
      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', 'sha123');

      const result = getFrontierEntry(frontier, 'writer1');

      expect(result).toBe('sha123');
    });

    it('returns undefined for missing writer', () => {
      const frontier = createFrontier();

      const result = getFrontierEntry(frontier, 'nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('getWriters', () => {
    it('returns empty array for empty frontier', () => {
      const frontier = createFrontier();

      const writers = getWriters(frontier);

      expect(writers).toEqual([]);
    });

    it('returns sorted list of writer IDs', () => {
      const frontier = createFrontier();
      updateFrontier(frontier, 'charlie', 'sha3');
      updateFrontier(frontier, 'alice', 'sha1');
      updateFrontier(frontier, 'bob', 'sha2');

      const writers = getWriters(frontier);

      expect(writers).toEqual(['alice', 'bob', 'charlie']);
    });

    it('handles single writer', () => {
      const frontier = createFrontier();
      updateFrontier(frontier, 'solo', 'sha1');

      const writers = getWriters(frontier);

      expect(writers).toEqual(['solo']);
    });
  });

  describe('serializeFrontier', () => {
    it('produces bytes', () => {
      const frontier = createFrontier();
      updateFrontier(frontier, 'writer1', 'sha123');

      const bytes = serializeFrontier(frontier);

      expect(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array).toBe(true);
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('serializes empty frontier', () => {
      const frontier = createFrontier();

      const bytes = serializeFrontier(frontier);

      expect(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array).toBe(true);
    });

    it('is deterministic - same frontier produces same bytes', () => {
      const frontier1 = createFrontier();
      updateFrontier(frontier1, 'writer1', 'sha111');
      updateFrontier(frontier1, 'writer2', 'sha222');

      const frontier2 = createFrontier();
      updateFrontier(frontier2, 'writer1', 'sha111');
      updateFrontier(frontier2, 'writer2', 'sha222');

      const bytes1 = serializeFrontier(frontier1);
      const bytes2 = serializeFrontier(frontier2);

      expect(Buffer.from(bytes1).equals(Buffer.from(bytes2))).toBe(true);
    });

    it('is deterministic regardless of insertion order', () => {
      const frontier1 = createFrontier();
      updateFrontier(frontier1, 'alice', 'sha1');
      updateFrontier(frontier1, 'bob', 'sha2');

      const frontier2 = createFrontier();
      updateFrontier(frontier2, 'bob', 'sha2');
      updateFrontier(frontier2, 'alice', 'sha1');

      const bytes1 = serializeFrontier(frontier1);
      const bytes2 = serializeFrontier(frontier2);

      expect(Buffer.from(bytes1).equals(Buffer.from(bytes2))).toBe(true);
    });
  });

  describe('deserializeFrontier', () => {
    it('reconstructs frontier from bytes', () => {
      const original = createFrontier();
      updateFrontier(original, 'writer1', 'sha123');
      updateFrontier(original, 'writer2', 'sha456');

      const bytes = /** @type {Buffer} */ (serializeFrontier(original));
      const restored = deserializeFrontier(bytes);

      expect(restored).toBeInstanceOf(Map);
      expect(restored.size).toBe(2);
      expect(restored.get('writer1')).toBe('sha123');
      expect(restored.get('writer2')).toBe('sha456');
    });

    it('reconstructs empty frontier', () => {
      const original = createFrontier();

      const bytes = /** @type {Buffer} */ (serializeFrontier(original));
      const restored = deserializeFrontier(bytes);

      expect(restored).toBeInstanceOf(Map);
      expect(restored.size).toBe(0);
    });
  });

  describe('round-trip serialization', () => {
    it('preserves data through serialize -> deserialize', () => {
      const original = createFrontier();
      updateFrontier(original, 'writer1', 'abc123def456');
      updateFrontier(original, 'writer2', '789xyz');
      updateFrontier(original, 'writer3', 'sha-with-special_chars.ok');

      const bytes = /** @type {Buffer} */ (serializeFrontier(original));
      const restored = deserializeFrontier(bytes);

      expect(restored.size).toBe(original.size);
      for (const [writerId, patchSha] of original) {
        expect(restored.get(writerId)).toBe(patchSha);
      }
    });

    it('multiple round-trips produce identical results', () => {
      const original = createFrontier();
      updateFrontier(original, 'a', 'sha1');
      updateFrontier(original, 'b', 'sha2');

      const bytes1 = /** @type {Buffer} */ (serializeFrontier(original));
      const restored1 = deserializeFrontier(bytes1);
      const bytes2 = /** @type {Buffer} */ (serializeFrontier(restored1));
      const restored2 = deserializeFrontier(bytes2);

      expect(Buffer.from(bytes1).equals(Buffer.from(bytes2))).toBe(true);
      expect(restored2.size).toBe(original.size);
      for (const [writerId, patchSha] of original) {
        expect(restored2.get(writerId)).toBe(patchSha);
      }
    });
  });

  describe('cloneFrontier', () => {
    it('creates independent copy', () => {
      const original = createFrontier();
      updateFrontier(original, 'writer1', 'sha123');

      const clone = cloneFrontier(original);

      // Modify original
      updateFrontier(original, 'writer1', 'modified');
      updateFrontier(original, 'writer2', 'new');

      // Clone should be unaffected
      expect(clone.get('writer1')).toBe('sha123');
      expect(clone.has('writer2')).toBe(false);
      expect(clone.size).toBe(1);
    });

    it('clones empty frontier', () => {
      const original = createFrontier();

      const clone = cloneFrontier(original);

      expect(clone).toBeInstanceOf(Map);
      expect(clone.size).toBe(0);
      expect(clone).not.toBe(original); // Different instance
    });

    it('preserves all entries', () => {
      const original = createFrontier();
      updateFrontier(original, 'a', '1');
      updateFrontier(original, 'b', '2');
      updateFrontier(original, 'c', '3');

      const clone = cloneFrontier(original);

      expect(clone.size).toBe(3);
      expect(clone.get('a')).toBe('1');
      expect(clone.get('b')).toBe('2');
      expect(clone.get('c')).toBe('3');
    });
  });

  describe('mergeFrontiers', () => {
    it('combines two frontiers', () => {
      const a = createFrontier();
      updateFrontier(a, 'writer1', 'sha1');

      const b = createFrontier();
      updateFrontier(b, 'writer2', 'sha2');

      const merged = mergeFrontiers(a, b);

      expect(merged.size).toBe(2);
      expect(merged.get('writer1')).toBe('sha1');
      expect(merged.get('writer2')).toBe('sha2');
    });

    it('b overwrites a for same writer', () => {
      const a = createFrontier();
      updateFrontier(a, 'writer1', 'oldSha');

      const b = createFrontier();
      updateFrontier(b, 'writer1', 'newSha');

      const merged = mergeFrontiers(a, b);

      expect(merged.size).toBe(1);
      expect(merged.get('writer1')).toBe('newSha');
    });

    it('does not mutate original frontiers', () => {
      const a = createFrontier();
      updateFrontier(a, 'writer1', 'sha1');

      const b = createFrontier();
      updateFrontier(b, 'writer2', 'sha2');

      mergeFrontiers(a, b);

      expect(a.size).toBe(1);
      expect(a.has('writer2')).toBe(false);
      expect(b.size).toBe(1);
      expect(b.has('writer1')).toBe(false);
    });

    it('handles empty frontiers', () => {
      const a = createFrontier();
      const b = createFrontier();

      const merged = mergeFrontiers(a, b);

      expect(merged.size).toBe(0);
    });

    it('handles one empty frontier', () => {
      const a = createFrontier();
      updateFrontier(a, 'writer1', 'sha1');

      const b = createFrontier();

      const merged1 = mergeFrontiers(a, b);
      expect(merged1.size).toBe(1);
      expect(merged1.get('writer1')).toBe('sha1');

      const merged2 = mergeFrontiers(b, a);
      expect(merged2.size).toBe(1);
      expect(merged2.get('writer1')).toBe('sha1');
    });

    it('handles complex merge with overlapping and unique writers', () => {
      const a = createFrontier();
      updateFrontier(a, 'writer1', 'a1');
      updateFrontier(a, 'writer2', 'a2');
      updateFrontier(a, 'writer3', 'a3');

      const b = createFrontier();
      updateFrontier(b, 'writer2', 'b2');
      updateFrontier(b, 'writer3', 'b3');
      updateFrontier(b, 'writer4', 'b4');

      const merged = mergeFrontiers(a, b);

      expect(merged.size).toBe(4);
      expect(merged.get('writer1')).toBe('a1'); // Only in a
      expect(merged.get('writer2')).toBe('b2'); // b overwrites a
      expect(merged.get('writer3')).toBe('b3'); // b overwrites a
      expect(merged.get('writer4')).toBe('b4'); // Only in b
    });
  });
});
