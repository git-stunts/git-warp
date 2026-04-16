import { describe, it, expect } from "vitest";

import DirtyPageSet, {
  encodeDirtyPath,
} from "../../../../../src/domain/orset/trie/DirtyPageSet.ts";
import TrieBranch from "../../../../../src/domain/orset/trie/TrieBranch.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import TrieLeaf from "../../../../../src/domain/orset/trie/TrieLeaf.ts";
import TrieCursorError from "../../../../../src/domain/errors/TrieCursorError.ts";

const GEOMETRY = TrieGeometry.default16way();

function leafAt(): TrieLeaf {
  return new TrieLeaf([], GEOMETRY);
}

function branchAt(): TrieBranch {
  return new TrieBranch(new Map<number, string>(), GEOMETRY);
}

describe("encodeDirtyPath", () => {
  it("encodes the empty path as the empty string", () => {
    expect(encodeDirtyPath([])).toBe("");
  });

  it("encodes a single nibble as one hex digit", () => {
    expect(encodeDirtyPath([0])).toBe("0");
    expect(encodeDirtyPath([15])).toBe("f");
  });

  it("joins multiple nibbles with '/'", () => {
    expect(encodeDirtyPath([0, 15, 3])).toBe("0/f/3");
  });

  it("accepts 8-bit nibbles (up to 0xff)", () => {
    expect(encodeDirtyPath([0, 255, 128])).toBe("0/ff/80");
  });
});

describe("DirtyPageSet", () => {
  describe("construction", () => {
    it("accepts an empty snapshot", () => {
      const set = DirtyPageSet.emptyForRoot(null);
      expect(set.isEmpty()).toBe(true);
      expect(set.rootOid()).toBeNull();
    });

    it("carries a non-null root OID when provided", () => {
      const set = DirtyPageSet.emptyForRoot("root-oid");
      expect(set.rootOid()).toBe("root-oid");
      expect(set.isEmpty()).toBe(true);
    });

    it("freezes the instance", () => {
      const set = DirtyPageSet.emptyForRoot(null);
      expect(Object.isFrozen(set)).toBe(true);
    });

    it("rejects overlap between dirty leaves and dirty branches at the same path", () => {
      const key = encodeDirtyPath([0, 1]);
      try {
        new DirtyPageSet({
          rootOid: null,
          dirtyLeaves: new Map([[key, leafAt()]]),
          dirtyBranches: new Map([[key, branchAt()]]),
          cleanChildren: new Map(),
        });
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieCursorError);
        if (err instanceof TrieCursorError) {
          expect(err.code).toBe("E_TRIE_CURSOR_STRUCTURE");
        }
      }
    });
  });

  describe("accessors", () => {
    it("returns dirty leaves by path", () => {
      const leaf = leafAt();
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map([[encodeDirtyPath([0]), leaf]]),
        dirtyBranches: new Map(),
        cleanChildren: new Map(),
      });
      expect(set.dirtyLeafAt([0])).toBe(leaf);
      expect(set.dirtyLeafAt([1])).toBeNull();
    });

    it("returns dirty branches by path", () => {
      const branch = branchAt();
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map(),
        dirtyBranches: new Map([[encodeDirtyPath([]), branch]]),
        cleanChildren: new Map(),
      });
      expect(set.dirtyBranchAt([])).toBe(branch);
      expect(set.dirtyBranchAt([0])).toBeNull();
    });

    it("returns clean child OIDs by path", () => {
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map(),
        dirtyBranches: new Map(),
        cleanChildren: new Map([[encodeDirtyPath([2, 5]), "oid-clean"]]),
      });
      expect(set.cleanChildOidAt([2, 5])).toBe("oid-clean");
      expect(set.cleanChildOidAt([2])).toBeNull();
    });
  });

  describe("enumerateBottomUp", () => {
    it("yields no entries for an empty snapshot", () => {
      const set = DirtyPageSet.emptyForRoot(null);
      expect([...set.enumerateBottomUp()]).toEqual([]);
    });

    it("yields leaves and branches in deepest-first order", () => {
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map([
          [encodeDirtyPath([0, 1, 2]), leafAt()],
          [encodeDirtyPath([3]), leafAt()],
        ]),
        dirtyBranches: new Map([[encodeDirtyPath([]), branchAt()]]),
        cleanChildren: new Map(),
      });
      const order = [...set.enumerateBottomUp()].map((e) => e.path);
      expect(order).toEqual([[0, 1, 2], [3], []]);
    });

    it("breaks ties in ascending nibble order", () => {
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map([
          [encodeDirtyPath([5]), leafAt()],
          [encodeDirtyPath([0]), leafAt()],
          [encodeDirtyPath([3]), leafAt()],
        ]),
        dirtyBranches: new Map(),
        cleanChildren: new Map(),
      });
      const order = [...set.enumerateBottomUp()].map((e) => e.path);
      expect(order).toEqual([[0], [3], [5]]);
    });

    it("breaks deep-path ties lexicographically", () => {
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map([
          [encodeDirtyPath([2, 5]), leafAt()],
          [encodeDirtyPath([2, 1]), leafAt()],
          [encodeDirtyPath([1, 9]), leafAt()],
        ]),
        dirtyBranches: new Map(),
        cleanChildren: new Map(),
      });
      const order = [...set.enumerateBottomUp()].map((e) => e.path);
      expect(order).toEqual([
        [1, 9],
        [2, 1],
        [2, 5],
      ]);
    });

    it("returns equal order for identical-path entries", () => {
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map([[encodeDirtyPath([4]), leafAt()]]),
        dirtyBranches: new Map([[encodeDirtyPath([7]), branchAt()]]),
        cleanChildren: new Map(),
      });
      const order = [...set.enumerateBottomUp()].map((e) => e.path);
      expect(order).toEqual([[4], [7]]);
    });
  });

  describe("isEmpty", () => {
    it("returns true when nothing is dirty", () => {
      const set = new DirtyPageSet({
        rootOid: "oid",
        dirtyLeaves: new Map(),
        dirtyBranches: new Map(),
        cleanChildren: new Map([[encodeDirtyPath([]), "oid"]]),
      });
      expect(set.isEmpty()).toBe(true);
    });

    it("returns false when a leaf is dirty", () => {
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map([[encodeDirtyPath([0]), leafAt()]]),
        dirtyBranches: new Map(),
        cleanChildren: new Map(),
      });
      expect(set.isEmpty()).toBe(false);
    });

    it("returns false when a branch is dirty", () => {
      const set = new DirtyPageSet({
        rootOid: null,
        dirtyLeaves: new Map(),
        dirtyBranches: new Map([[encodeDirtyPath([]), branchAt()]]),
        cleanChildren: new Map(),
      });
      expect(set.isEmpty()).toBe(false);
    });
  });
});
