import { describe, it, expect } from "vitest";

import TrieBranch from "../../../../../src/domain/orset/trie/TrieBranch.ts";
import TrieGeometry from "../../../../../src/domain/orset/trie/TrieGeometry.ts";
import type { TrieBranchEntries } from "../../../../../src/domain/orset/trie/TrieBranchEntries.ts";
import TrieBranchError from "../../../../../src/domain/errors/TrieBranchError.ts";

const GEOMETRY = TrieGeometry.default16way();

function emptyChildren(): TrieBranchEntries {
  return new Map<number, string>();
}

describe("TrieBranch", () => {
  describe("constructor", () => {
    it("accepts an empty child map", () => {
      const branch = new TrieBranch(emptyChildren(), GEOMETRY);
      expect(branch.childCount()).toBe(0);
    });

    it("accepts a fully populated 16-way branch", () => {
      const children = new Map<number, string>();
      for (let i = 0; i < 16; i += 1) {
        children.set(i, `oid-${i.toString(16)}`);
      }
      const branch = new TrieBranch(children, GEOMETRY);
      expect(branch.childCount()).toBe(16);
    });

    it("accepts a 256-way geometry", () => {
      const wide = new TrieGeometry({
        fanout: 256,
        nibbleBits: 8,
        leafCapacity: 64,
        leafFloor: 16,
      });
      const children = new Map<number, string>([
        [0, "oid-00"],
        [128, "oid-80"],
        [255, "oid-ff"],
      ]);
      const branch = new TrieBranch(children, wide);
      expect(branch.childCount()).toBe(3);
      expect(branch.get(255)).toBe("oid-ff");
    });

    it("freezes the instance", () => {
      const branch = new TrieBranch(emptyChildren(), GEOMETRY);
      expect(Object.isFrozen(branch)).toBe(true);
    });

    it("rejects a nibble index at the fanout boundary", () => {
      const children = new Map<number, string>([[16, "oid-10"]]);
      try {
        new TrieBranch(children, GEOMETRY);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieBranchError);
        if (err instanceof TrieBranchError) {
          expect(err.code).toBe("E_TRIE_BRANCH_NIBBLE_RANGE");
        }
      }
    });

    it("rejects a negative nibble index with NIBBLE_SHAPE", () => {
      const children = new Map<number, string>([[-1, "oid"]]);
      try {
        new TrieBranch(children, GEOMETRY);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieBranchError);
        if (err instanceof TrieBranchError) {
          expect(err.code).toBe("E_TRIE_BRANCH_NIBBLE_SHAPE");
        }
      }
    });

    it("rejects a non-integer nibble index with NIBBLE_SHAPE", () => {
      const children = new Map<number, string>([[1.5, "oid"]]);
      try {
        new TrieBranch(children, GEOMETRY);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieBranchError);
        if (err instanceof TrieBranchError) {
          expect(err.code).toBe("E_TRIE_BRANCH_NIBBLE_SHAPE");
        }
      }
    });

    it("rejects an empty child OID with CHILD_OID", () => {
      const children = new Map<number, string>([[0, ""]]);
      try {
        new TrieBranch(children, GEOMETRY);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieBranchError);
        if (err instanceof TrieBranchError) {
          expect(err.code).toBe("E_TRIE_BRANCH_CHILD_OID");
        }
      }
    });

    it("tags the error code on any nibble index above fanout", () => {
      const children = new Map<number, string>([[100, "oid"]]);
      try {
        new TrieBranch(children, GEOMETRY);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieBranchError);
        if (err instanceof TrieBranchError) {
          expect(err.code).toBe("E_TRIE_BRANCH_NIBBLE_RANGE");
        }
      }
    });

    it("defaults the error code when an empty options bag is used", () => {
      const err = new TrieBranchError("x");
      expect(err.code).toBe("E_TRIE_BRANCH_NIBBLE_RANGE");
    });
  });

  describe("get", () => {
    it("returns the child OID for a populated nibble", () => {
      const branch = new TrieBranch(
        new Map<number, string>([[3, "oid-3"]]),
        GEOMETRY,
      );
      expect(branch.get(3)).toBe("oid-3");
    });

    it("returns undefined for an empty slot", () => {
      const branch = new TrieBranch(emptyChildren(), GEOMETRY);
      expect(branch.get(7)).toBeUndefined();
    });
  });

  describe("set", () => {
    it("returns a new instance with the child added", () => {
      const original = new TrieBranch(emptyChildren(), GEOMETRY);
      const updated = original.set(5, "oid-5");
      expect(updated).not.toBe(original);
      expect(updated.get(5)).toBe("oid-5");
    });

    it("leaves the original instance unchanged", () => {
      const original = new TrieBranch(emptyChildren(), GEOMETRY);
      original.set(5, "oid-5");
      expect(original.childCount()).toBe(0);
      expect(original.get(5)).toBeUndefined();
    });

    it("overwrites a populated slot in the returned instance", () => {
      const original = new TrieBranch(
        new Map<number, string>([[5, "oid-old"]]),
        GEOMETRY,
      );
      const updated = original.set(5, "oid-new");
      expect(updated.get(5)).toBe("oid-new");
      expect(original.get(5)).toBe("oid-old");
    });

    it("rejects a nibble index outside the geometry fanout", () => {
      const branch = new TrieBranch(emptyChildren(), GEOMETRY);
      try {
        branch.set(16, "oid");
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieBranchError);
        if (err instanceof TrieBranchError) {
          expect(err.code).toBe("E_TRIE_BRANCH_NIBBLE_RANGE");
        }
      }
    });

    it("rejects an empty child OID", () => {
      const branch = new TrieBranch(emptyChildren(), GEOMETRY);
      try {
        branch.set(0, "");
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TrieBranchError);
        if (err instanceof TrieBranchError) {
          expect(err.code).toBe("E_TRIE_BRANCH_CHILD_OID");
        }
      }
    });
  });

  describe("entries", () => {
    it("returns a fresh map in the storage-facing shape", () => {
      const input = new Map<number, string>([
        [0, "oid-0"],
        [7, "oid-7"],
        [15, "oid-f"],
      ]);
      const branch = new TrieBranch(input, GEOMETRY);
      const produced = branch.entries();
      expect(produced.size).toBe(3);
      expect(produced.get(7)).toBe("oid-7");
    });

    it("returns a fresh map on each call (not a shared internal reference)", () => {
      const branch = new TrieBranch(
        new Map<number, string>([[1, "oid-1"]]),
        GEOMETRY,
      );
      const first = branch.entries();
      const second = branch.entries();
      expect(first).not.toBe(second);
      expect(first.size).toBe(1);
      expect(second.size).toBe(1);
    });
  });

  describe("childCount", () => {
    it("reports zero for an empty branch", () => {
      const branch = new TrieBranch(emptyChildren(), GEOMETRY);
      expect(branch.childCount()).toBe(0);
    });

    it("reports the number of populated slots", () => {
      const branch = new TrieBranch(
        new Map<number, string>([
          [0, "a"],
          [5, "b"],
          [10, "c"],
        ]),
        GEOMETRY,
      );
      expect(branch.childCount()).toBe(3);
    });
  });
});
