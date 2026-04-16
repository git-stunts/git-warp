import { describe, it, expect } from "vitest";

import TrieLeaf, {
  TRIE_LEAF_WIRE_VERSION,
  type TrieLeafEntry,
} from "../../../../../src/domain/orset/trie/TrieLeaf.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieLeafError from "../../../../../src/domain/errors/TrieLeafError.ts";
import cborCodec from "../../../../../src/infrastructure/codecs/CborCodec.ts";

function entry(
  suffix: ReadonlyArray<number>,
  element: string,
  dots: ReadonlyArray<string> = [],
  tombstoned: ReadonlyArray<string> = [],
): TrieLeafEntry {
  return {
    routeKeySuffix: Uint8Array.from(suffix),
    element,
    dots: new Set(dots),
    tombstonedDots: new Set(tombstoned),
  };
}

const GEOMETRY = TrieGeometry.default16way();

describe("TrieLeaf", () => {
  describe("constants", () => {
    it("pins the wire format version at 1 for v1", () => {
      expect(TRIE_LEAF_WIRE_VERSION).toBe(1);
    });
  });

  describe("constructor", () => {
    it("accepts an empty entry array", () => {
      const leaf = new TrieLeaf([], GEOMETRY);
      expect(leaf.size()).toBe(0);
    });

    it("accepts a singleton entry array", () => {
      const leaf = new TrieLeaf([entry([0x01], "node:a")], GEOMETRY);
      expect(leaf.size()).toBe(1);
    });

    it("accepts strictly sorted entries", () => {
      const leaf = new TrieLeaf(
        [
          entry([0x01], "node:a"),
          entry([0x02], "node:b"),
          entry([0x03], "node:c"),
        ],
        GEOMETRY,
      );
      expect(leaf.size()).toBe(3);
    });

    it("rejects unsorted entries with E_TRIE_LEAF_UNSORTED", () => {
      try {
        new TrieLeaf(
          [
            entry([0x02], "node:b"),
            entry([0x01], "node:a"),
          ],
          GEOMETRY,
        );
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_UNSORTED");
        }
      }
    });

    it("rejects duplicate suffixes with E_TRIE_LEAF_UNSORTED", () => {
      try {
        new TrieLeaf(
          [
            entry([0x01], "node:a"),
            entry([0x01], "node:b"),
          ],
          GEOMETRY,
        );
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_UNSORTED");
        }
      }
    });

    it("sorts by byte-lex, not length", () => {
      // [0x01, 0x00] is byte-lex greater than [0x01] because at the
      // shared prefix they match and the shorter one comes first.
      const leaf = new TrieLeaf(
        [entry([0x01], "a"), entry([0x01, 0x00], "ab")],
        GEOMETRY,
      );
      expect(leaf.size()).toBe(2);
    });

    it("freezes the instance", () => {
      const leaf = new TrieLeaf([entry([0x01], "a")], GEOMETRY);
      expect(Object.isFrozen(leaf)).toBe(true);
    });
  });

  describe("binarySearch", () => {
    const leaf = new TrieLeaf(
      [
        entry([0x10], "node:a"),
        entry([0x20], "node:b"),
        entry([0x30], "node:c"),
        entry([0x40], "node:d"),
      ],
      GEOMETRY,
    );

    it("finds the first entry", () => {
      expect(leaf.binarySearch(Uint8Array.from([0x10]))).toBe(0);
    });

    it("finds a middle entry", () => {
      expect(leaf.binarySearch(Uint8Array.from([0x30]))).toBe(2);
    });

    it("finds the last entry", () => {
      expect(leaf.binarySearch(Uint8Array.from([0x40]))).toBe(3);
    });

    it("returns -1 for a miss below the smallest entry", () => {
      expect(leaf.binarySearch(Uint8Array.from([0x05]))).toBe(-1);
    });

    it("returns -1 for a miss above the largest entry", () => {
      expect(leaf.binarySearch(Uint8Array.from([0xff]))).toBe(-1);
    });

    it("returns -1 for a miss between two entries", () => {
      expect(leaf.binarySearch(Uint8Array.from([0x25]))).toBe(-1);
    });

    it("returns -1 on an empty leaf", () => {
      const empty = new TrieLeaf([], GEOMETRY);
      expect(empty.binarySearch(Uint8Array.from([0x00]))).toBe(-1);
    });
  });

  describe("split / merge predicates", () => {
    it("requires split when entry count exceeds capacity", () => {
      const small = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 2,
        leafFloor: 1,
      });
      const leaf = new TrieLeaf(
        [entry([0x01], "a"), entry([0x02], "b"), entry([0x03], "c")],
        small,
      );
      expect(leaf.requiresSplit(small)).toBe(true);
      expect(leaf.requiresMerge(small)).toBe(false);
    });

    it("requires merge when entry count is below floor", () => {
      const tall = new TrieGeometry({
        fanout: 16,
        nibbleBits: 4,
        leafCapacity: 64,
        leafFloor: 16,
      });
      const leaf = new TrieLeaf([entry([0x01], "a")], tall);
      expect(leaf.requiresMerge(tall)).toBe(true);
      expect(leaf.requiresSplit(tall)).toBe(false);
    });

    it("neither splits nor merges when count is in range", () => {
      const g = TrieGeometry.default16way();
      const leaf = new TrieLeaf(
        [entry([0x01], "a"), entry([0x02], "b"), entry([0x03], "c"), entry([0x04], "d"), entry([0x05], "e"), entry([0x06], "f"), entry([0x07], "g"), entry([0x08], "h"), entry([0x09], "i"), entry([0x0a], "j"), entry([0x0b], "k"), entry([0x0c], "l"), entry([0x0d], "m"), entry([0x0e], "n"), entry([0x0f], "o"), entry([0x10], "p"), entry([0x11], "q"), entry([0x12], "r"), entry([0x13], "s"), entry([0x14], "t")],
        g,
      );
      expect(leaf.requiresSplit(g)).toBe(false);
      expect(leaf.requiresMerge(g)).toBe(false);
    });
  });

  describe("entries accessor", () => {
    it("returns the same entries in the same order as constructed", () => {
      const input = [
        entry([0x10], "a", ["d1"]),
        entry([0x20], "b", ["d2", "d3"], ["t1"]),
      ];
      const leaf = new TrieLeaf(input, GEOMETRY);
      const output = leaf.entries();
      expect(output.length).toBe(2);
      expect(output[0]?.element).toBe("a");
      expect(output[1]?.element).toBe("b");
      expect([...(output[1]?.dots ?? [])]).toEqual(["d2", "d3"]);
      expect([...(output[1]?.tombstonedDots ?? [])]).toEqual(["t1"]);
    });
  });

  describe("serialize / deserialize round-trip", () => {
    it("round-trips an empty leaf", () => {
      const leaf = new TrieLeaf([], GEOMETRY);
      const bytes = leaf.serialize(cborCodec);
      const round = TrieLeaf.deserialize(bytes, GEOMETRY, cborCodec);
      expect(round.size()).toBe(0);
    });

    it("round-trips a singleton leaf", () => {
      const leaf = new TrieLeaf(
        [entry([0x01], "node:a", ["d1"], ["t1"])],
        GEOMETRY,
      );
      const bytes = leaf.serialize(cborCodec);
      const round = TrieLeaf.deserialize(bytes, GEOMETRY, cborCodec);
      expect(round.size()).toBe(1);
      const got = round.entries()[0];
      expect(got?.element).toBe("node:a");
      expect([...(got?.dots ?? [])]).toEqual(["d1"]);
      expect([...(got?.tombstonedDots ?? [])]).toEqual(["t1"]);
      expect([...(got?.routeKeySuffix ?? [])]).toEqual([0x01]);
    });

    it("round-trips a many-entry leaf preserving sort order", () => {
      const input: TrieLeafEntry[] = [];
      for (let i = 0; i < 20; i += 1) {
        input.push(entry([i], `node:${String(i)}`, [`d${String(i)}`]));
      }
      const leaf = new TrieLeaf(input, GEOMETRY);
      const bytes = leaf.serialize(cborCodec);
      const round = TrieLeaf.deserialize(bytes, GEOMETRY, cborCodec);
      expect(round.size()).toBe(20);
      for (let i = 0; i < 20; i += 1) {
        expect(round.entries()[i]?.element).toBe(`node:${String(i)}`);
      }
    });

    it("rejects bytes with an unknown version", () => {
      const bad = cborCodec.encode({
        version: 999,
        entries: [],
      });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_VERSION");
        }
      }
    });

    it("rejects bytes with a missing version field", () => {
      const bad = cborCodec.encode({ entries: [] });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_WIRE_SHAPE");
        }
      }
    });

    it("rejects bytes with a non-object envelope", () => {
      const bad = cborCodec.encode([1, 2, 3]);
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_WIRE_SHAPE");
        }
      }
    });

    it("rejects bytes with a non-array entries field", () => {
      const bad = cborCodec.encode({ version: 1, entries: "not an array" });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_WIRE_SHAPE");
        }
      }
    });

    it("rejects bytes whose entries have wrong arity", () => {
      const bad = cborCodec.encode({
        version: 1,
        entries: [[Uint8Array.from([1]), "a", []]],
      });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_WIRE_SHAPE");
        }
      }
    });

    it("rejects bytes whose entries carry a non-Uint8Array suffix", () => {
      const bad = cborCodec.encode({
        version: 1,
        entries: [["not bytes", "a", [], []]],
      });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_WIRE_SHAPE");
        }
      }
    });

    it("rejects bytes whose entries carry a non-string element", () => {
      const bad = cborCodec.encode({
        version: 1,
        entries: [[Uint8Array.from([1]), 42, [], []]],
      });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_WIRE_SHAPE");
        }
      }
    });

    it("rejects bytes whose dots array contains non-strings", () => {
      const bad = cborCodec.encode({
        version: 1,
        entries: [[Uint8Array.from([1]), "a", [1, 2], []]],
      });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_WIRE_SHAPE");
        }
      }
    });

    it("rejects bytes whose tombstonedDots array contains non-strings", () => {
      const bad = cborCodec.encode({
        version: 1,
        entries: [[Uint8Array.from([1]), "a", [], [1]]],
      });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_WIRE_SHAPE");
        }
      }
    });

    it("rejects bytes whose entries are not sorted", () => {
      const bad = cborCodec.encode({
        version: 1,
        entries: [
          [Uint8Array.from([0x02]), "b", [], []],
          [Uint8Array.from([0x01]), "a", [], []],
        ],
      });
      try {
        TrieLeaf.deserialize(bad, GEOMETRY, cborCodec);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieLeafError);
        if (err instanceof TrieLeafError) {
          expect(err.code).toBe("E_TRIE_LEAF_UNSORTED");
        }
      }
    });

    it("defaults the error code when an empty options bag is used", () => {
      const err = new TrieLeafError("anything");
      expect(err.code).toBe("E_TRIE_LEAF_ENTRY_SHAPE");
    });
  });
});
