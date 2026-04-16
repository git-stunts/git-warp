import { describe, it, expect } from "vitest";

import TrieGeometry, {
  SUPPORTED_FANOUTS,
  DEFAULT_FANOUT,
  DEFAULT_NIBBLE_BITS,
  DEFAULT_LEAF_CAPACITY,
  DEFAULT_LEAF_FLOOR,
} from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieGeometryError from "../../../../../src/domain/errors/TrieGeometryError.ts";

describe("TrieGeometry", () => {
  describe("constants", () => {
    it("supports fanouts {16, 64, 256} for v1", () => {
      expect([...SUPPORTED_FANOUTS]).toEqual([16, 64, 256]);
    });

    it("defaults to 16-way fanout with 4-bit nibbles", () => {
      expect(DEFAULT_FANOUT).toBe(16);
      expect(DEFAULT_NIBBLE_BITS).toBe(4);
    });

    it("uses leaf capacity 64 and leaf floor 16 by default", () => {
      expect(DEFAULT_LEAF_CAPACITY).toBe(64);
      expect(DEFAULT_LEAF_FLOOR).toBe(16);
    });
  });

  describe("constructor", () => {
    it("accepts a 16-way geometry (4-bit nibbles)", () => {
      const g = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 16 });
      expect(g.fanout).toBe(16);
      expect(g.nibbleBits).toBe(4);
      expect(g.leafCapacity).toBe(64);
      expect(g.leafFloor).toBe(16);
    });

    it("accepts a 64-way geometry (6-bit nibbles)", () => {
      const g = new TrieGeometry({ fanout: 64, nibbleBits: 6, leafCapacity: 128, leafFloor: 32 });
      expect(g.fanout).toBe(64);
      expect(g.nibbleBits).toBe(6);
    });

    it("accepts a 256-way geometry (8-bit nibbles)", () => {
      const g = new TrieGeometry({ fanout: 256, nibbleBits: 8, leafCapacity: 256, leafFloor: 64 });
      expect(g.fanout).toBe(256);
      expect(g.nibbleBits).toBe(8);
    });

    it("freezes the instance", () => {
      const g = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 16 });
      expect(Object.isFrozen(g)).toBe(true);
    });

    it("rejects fanout outside the v1 supported set", () => {
      expect(() => new TrieGeometry({ fanout: 8, nibbleBits: 3, leafCapacity: 64, leafFloor: 16 })).toThrow(TrieGeometryError);
      expect(() => new TrieGeometry({ fanout: 32, nibbleBits: 5, leafCapacity: 64, leafFloor: 16 })).toThrow(TrieGeometryError);
    });

    it("tags fanout rejection with E_TRIE_GEOMETRY_FANOUT", () => {
      try {
        new TrieGeometry({ fanout: 7, nibbleBits: 3, leafCapacity: 64, leafFloor: 16 });
      } catch (err) {
        expect(err).toBeInstanceOf(TrieGeometryError);
        if (err instanceof TrieGeometryError) {
          expect(err.code).toBe("E_TRIE_GEOMETRY_FANOUT");
        }
      }
    });

    it("rejects nibbleBits that does not equal log2(fanout)", () => {
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 3, leafCapacity: 64, leafFloor: 16 })).toThrow(TrieGeometryError);
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 5, leafCapacity: 64, leafFloor: 16 })).toThrow(TrieGeometryError);
      expect(() => new TrieGeometry({ fanout: 64, nibbleBits: 4, leafCapacity: 64, leafFloor: 16 })).toThrow(TrieGeometryError);
    });

    it("tags nibbleBits rejection with E_TRIE_GEOMETRY_NIBBLE_BITS", () => {
      try {
        new TrieGeometry({ fanout: 16, nibbleBits: 5, leafCapacity: 64, leafFloor: 16 });
      } catch (err) {
        expect(err).toBeInstanceOf(TrieGeometryError);
        if (err instanceof TrieGeometryError) {
          expect(err.code).toBe("E_TRIE_GEOMETRY_NIBBLE_BITS");
        }
      }
    });

    it("rejects non-positive leafCapacity", () => {
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 0, leafFloor: 0 })).toThrow(TrieGeometryError);
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: -1, leafFloor: 0 })).toThrow(TrieGeometryError);
    });

    it("rejects non-integer leafCapacity", () => {
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64.5, leafFloor: 16 })).toThrow(TrieGeometryError);
    });

    it("tags leafCapacity rejection with E_TRIE_GEOMETRY_LEAF_CAPACITY", () => {
      try {
        new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 0, leafFloor: 0 });
      } catch (err) {
        expect(err).toBeInstanceOf(TrieGeometryError);
        if (err instanceof TrieGeometryError) {
          expect(err.code).toBe("E_TRIE_GEOMETRY_LEAF_CAPACITY");
        }
      }
    });

    it("rejects negative leafFloor", () => {
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: -1 })).toThrow(TrieGeometryError);
    });

    it("rejects non-integer leafFloor", () => {
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 2.5 })).toThrow(TrieGeometryError);
    });

    it("rejects leafFloor >= leafCapacity", () => {
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 64 })).toThrow(TrieGeometryError);
      expect(() => new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 65 })).toThrow(TrieGeometryError);
    });

    it("tags leafFloor rejection with E_TRIE_GEOMETRY_LEAF_FLOOR", () => {
      try {
        new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 64 });
      } catch (err) {
        expect(err).toBeInstanceOf(TrieGeometryError);
        if (err instanceof TrieGeometryError) {
          expect(err.code).toBe("E_TRIE_GEOMETRY_LEAF_FLOOR");
        }
      }

      try {
        new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: -1 });
      } catch (err) {
        expect(err).toBeInstanceOf(TrieGeometryError);
        if (err instanceof TrieGeometryError) {
          expect(err.code).toBe("E_TRIE_GEOMETRY_LEAF_FLOOR");
        }
      }
    });

    it("allows leafFloor = 0 (merge never triggered)", () => {
      const g = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 0 });
      expect(g.leafFloor).toBe(0);
    });
  });

  describe("splitRequired", () => {
    it("returns false for counts at or below capacity", () => {
      const g = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 16 });
      expect(g.splitRequired(0)).toBe(false);
      expect(g.splitRequired(63)).toBe(false);
      expect(g.splitRequired(64)).toBe(false);
    });

    it("returns true for counts above capacity", () => {
      const g = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 16 });
      expect(g.splitRequired(65)).toBe(true);
      expect(g.splitRequired(1000)).toBe(true);
    });
  });

  describe("mergeRequired", () => {
    it("returns true for counts strictly below floor", () => {
      const g = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 16 });
      expect(g.mergeRequired(0)).toBe(true);
      expect(g.mergeRequired(15)).toBe(true);
    });

    it("returns false for counts at or above floor", () => {
      const g = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 16 });
      expect(g.mergeRequired(16)).toBe(false);
      expect(g.mergeRequired(64)).toBe(false);
      expect(g.mergeRequired(100)).toBe(false);
    });

    it("never triggers when floor is 0", () => {
      const g = new TrieGeometry({ fanout: 16, nibbleBits: 4, leafCapacity: 64, leafFloor: 0 });
      expect(g.mergeRequired(0)).toBe(false);
    });
  });

  describe("default16way factory", () => {
    it("produces the v1 default geometry", () => {
      const g = TrieGeometry.default16way();
      expect(g.fanout).toBe(DEFAULT_FANOUT);
      expect(g.nibbleBits).toBe(DEFAULT_NIBBLE_BITS);
      expect(g.leafCapacity).toBe(DEFAULT_LEAF_CAPACITY);
      expect(g.leafFloor).toBe(DEFAULT_LEAF_FLOOR);
    });

    it("returns a frozen instance", () => {
      const g = TrieGeometry.default16way();
      expect(Object.isFrozen(g)).toBe(true);
    });
  });
});
