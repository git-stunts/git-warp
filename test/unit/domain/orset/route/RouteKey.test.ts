import { describe, it, expect } from "vitest";
import fc from "fast-check";

import RouteKey, {
  ROUTE_KEY_BYTES,
  ROUTE_KEY_BITS,
} from "../../../../../src/domain/orset/route/RouteKey.ts";
import RouteKeyError from "../../../../../src/domain/errors/RouteKeyError.ts";

describe("RouteKey", () => {
  describe("constants", () => {
    it("has a 32-byte output length", () => {
      expect(ROUTE_KEY_BYTES).toBe(32);
    });

    it("exposes total bit count consistent with byte length", () => {
      expect(ROUTE_KEY_BITS).toBe(256);
    });
  });

  describe("constructor", () => {
    it("accepts a 32-byte Uint8Array", () => {
      const key = new RouteKey(new Uint8Array(32));
      expect(key.bytes).toHaveLength(32);
    });

    it("rejects byte arrays of the wrong length", () => {
      expect(() => new RouteKey(new Uint8Array(16))).toThrow(RouteKeyError);
      expect(() => new RouteKey(new Uint8Array(64))).toThrow(RouteKeyError);
    });

    it("clones the input bytes to prevent mutation", () => {
      const bytes = new Uint8Array(32);
      bytes[0] = 0xff;
      const key = new RouteKey(bytes);
      bytes[0] = 0x00;
      expect(key.bytes[0]).toBe(0xff);
    });

    it("freezes the instance", () => {
      const key = new RouteKey(new Uint8Array(32));
      expect(Object.isFrozen(key)).toBe(true);
    });
  });

  describe("fromElement", () => {
    it("derives a 32-byte key from a non-empty element ID", () => {
      const key = RouteKey.fromElement("node:alice");
      expect(key.bytes).toHaveLength(32);
    });

    it("rejects an empty element ID", () => {
      expect(() => RouteKey.fromElement("")).toThrow(RouteKeyError);
    });

    it("is deterministic — same input produces the same key", () => {
      const a = RouteKey.fromElement("node:alice");
      const b = RouteKey.fromElement("node:alice");
      expect(a.toHex()).toBe(b.toHex());
    });

    it("produces different keys for different inputs", () => {
      const a = RouteKey.fromElement("node:alice");
      const b = RouteKey.fromElement("node:bob");
      expect(a.toHex()).not.toBe(b.toHex());
    });

    it("handles non-ASCII element IDs", () => {
      const key = RouteKey.fromElement("node:\u{1F44B}");
      expect(key.bytes).toHaveLength(32);
    });
  });

  describe("nibbleAt", () => {
    const allZeros = new Uint8Array(32);
    const allOnes = new Uint8Array(32).fill(0xff);
    const pattern = new Uint8Array(32);
    pattern[0] = 0xab;
    pattern[1] = 0xcd;

    it("returns 0 for every depth on an all-zero key (4-bit nibbles)", () => {
      const key = new RouteKey(allZeros);
      for (let depth = 0; depth < 64; depth += 1) {
        expect(key.nibbleAt(depth, 4)).toBe(0);
      }
    });

    it("returns the max nibble value on an all-ones key (4-bit nibbles)", () => {
      const key = new RouteKey(allOnes);
      for (let depth = 0; depth < 64; depth += 1) {
        expect(key.nibbleAt(depth, 4)).toBe(0xf);
      }
    });

    it("extracts 4-bit nibbles in MSB-first order from the first byte", () => {
      // First byte is 0xab = 1010 1011 → nibbles [0xa, 0xb]
      const key = new RouteKey(pattern);
      expect(key.nibbleAt(0, 4)).toBe(0xa);
      expect(key.nibbleAt(1, 4)).toBe(0xb);
    });

    it("extracts 4-bit nibbles in MSB-first order from the second byte", () => {
      // Second byte is 0xcd = 1100 1101 → nibbles [0xc, 0xd]
      const key = new RouteKey(pattern);
      expect(key.nibbleAt(2, 4)).toBe(0xc);
      expect(key.nibbleAt(3, 4)).toBe(0xd);
    });

    it("extracts 8-bit nibbles byte-by-byte", () => {
      const key = new RouteKey(pattern);
      expect(key.nibbleAt(0, 8)).toBe(0xab);
      expect(key.nibbleAt(1, 8)).toBe(0xcd);
    });

    it("extracts 1-bit nibbles MSB-first", () => {
      // 0xab = 1010 1011 → bits [1,0,1,0,1,0,1,1]
      const key = new RouteKey(pattern);
      expect(key.nibbleAt(0, 1)).toBe(1);
      expect(key.nibbleAt(1, 1)).toBe(0);
      expect(key.nibbleAt(2, 1)).toBe(1);
      expect(key.nibbleAt(3, 1)).toBe(0);
      expect(key.nibbleAt(4, 1)).toBe(1);
      expect(key.nibbleAt(5, 1)).toBe(0);
      expect(key.nibbleAt(6, 1)).toBe(1);
      expect(key.nibbleAt(7, 1)).toBe(1);
    });

    it("extracts 2-bit nibbles MSB-first", () => {
      // 0xab = 10 10 10 11 → [2, 2, 2, 3]
      const key = new RouteKey(pattern);
      expect(key.nibbleAt(0, 2)).toBe(0b10);
      expect(key.nibbleAt(1, 2)).toBe(0b10);
      expect(key.nibbleAt(2, 2)).toBe(0b10);
      expect(key.nibbleAt(3, 2)).toBe(0b11);
    });

    it("extracts 6-bit nibbles across byte boundaries", () => {
      // 0xabcd... = 101010 111100 110100...
      const key = new RouteKey(pattern);
      expect(key.nibbleAt(0, 6)).toBe(0b101010);
      expect(key.nibbleAt(1, 6)).toBe(0b111100);
      expect(key.nibbleAt(2, 6)).toBe(0b110100);
    });

    it("rejects negative depth", () => {
      const key = new RouteKey(allZeros);
      expect(() => key.nibbleAt(-1, 4)).toThrow(RouteKeyError);
    });

    it("rejects non-integer depth", () => {
      const key = new RouteKey(allZeros);
      expect(() => key.nibbleAt(1.5, 4)).toThrow(RouteKeyError);
    });

    it("rejects depth at or beyond max for the nibble width", () => {
      const key = new RouteKey(allZeros);
      // 4-bit nibbles: max depth is 64 (exclusive)
      expect(() => key.nibbleAt(64, 4)).toThrow(RouteKeyError);
      // 8-bit nibbles: max depth is 32 (exclusive)
      expect(() => key.nibbleAt(32, 8)).toThrow(RouteKeyError);
      // 6-bit nibbles: max whole-slot depth is 42 (exclusive)
      expect(() => key.nibbleAt(42, 6)).toThrow(RouteKeyError);
      // 1-bit nibbles: max depth is 256 (exclusive)
      expect(() => key.nibbleAt(256, 1)).toThrow(RouteKeyError);
    });

    it("rejects unsupported nibble widths", () => {
      const key = new RouteKey(allZeros);
      // @ts-expect-error runtime rejects unsupported JavaScript callers.
      expect(() => key.nibbleAt(0, 3)).toThrow(RouteKeyError);
      // @ts-expect-error runtime rejects unsupported JavaScript callers.
      expect(() => key.nibbleAt(0, 16)).toThrow(RouteKeyError);
    });
  });

  describe("toHex", () => {
    it("returns lowercase hex with correct length", () => {
      const key = new RouteKey(new Uint8Array(32).fill(0xab));
      expect(key.toHex()).toBe("ab".repeat(32));
    });

    it("zero-pads single-digit byte values", () => {
      const bytes = new Uint8Array(32);
      bytes[0] = 0x0a;
      const key = new RouteKey(bytes);
      expect(key.toHex().startsWith("0a")).toBe(true);
    });
  });

  describe("distribution (property-based)", () => {
    it("produces the same hex for the same element (idempotency)", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 200 }), (element) => {
          const a = RouteKey.fromElement(element);
          const b = RouteKey.fromElement(element);
          return a.toHex() === b.toHex();
        }),
        { numRuns: 200 },
      );
    });

    it("different elements produce different keys (collision-resistance, sampled)", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (a, b) => {
            if (a === b) return true;
            const ka = RouteKey.fromElement(a);
            const kb = RouteKey.fromElement(b);
            return ka.toHex() !== kb.toHex();
          },
        ),
        { numRuns: 500 },
      );
    });

    it("first-nibble distribution is roughly uniform across a sample of 1024 element IDs (4-bit)", () => {
      const buckets = new Array<number>(16).fill(0);
      for (let i = 0; i < 1024; i += 1) {
        const key = RouteKey.fromElement(`element:${String(i)}`);
        const nibble = key.nibbleAt(0, 4);
        buckets[nibble] = (buckets[nibble] ?? 0) + 1;
      }
      // Uniform expectation is 64 per bucket. Loose bound rejects obvious bias
      // without flaking on rare-but-legal skew.
      for (const count of buckets) {
        expect(count).toBeGreaterThan(16);
        expect(count).toBeLessThan(160);
      }
    });
  });
});
