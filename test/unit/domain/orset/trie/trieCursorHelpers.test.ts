import { describe, expect, it } from 'vitest';

import {
  compareBytes,
  findInsertIndex,
  makeEntry,
  nibbleBitsOf,
  validateDot,
  validateElement,
} from '../../../../../src/domain/orset/trie/trieCursorHelpers.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';

function bytes(...values: readonly number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe('compareBytes', () => {
  it('orders by the first differing byte', () => {
    expect(compareBytes(bytes(1, 2, 3), bytes(1, 9, 3))).toBeLessThan(0);
    expect(compareBytes(bytes(1, 9, 3), bytes(1, 2, 3))).toBeGreaterThan(0);
  });

  it('treats identical content as equal regardless of separate backing arrays', () => {
    expect(compareBytes(bytes(4, 5, 6), bytes(4, 5, 6))).toBe(0);
  });

  it('orders a proper prefix before the sequence that extends it', () => {
    expect(compareBytes(bytes(1, 2), bytes(1, 2, 0))).toBeLessThan(0);
    expect(compareBytes(bytes(1, 2, 0), bytes(1, 2))).toBeGreaterThan(0);
  });

  it('treats an empty sequence as the least element', () => {
    expect(compareBytes(bytes(), bytes(0))).toBeLessThan(0);
    expect(compareBytes(bytes(), bytes())).toBe(0);
  });

  it('compares bytes as unsigned, so 0x80 sorts above 0x7f', () => {
    expect(compareBytes(bytes(0x7f), bytes(0x80))).toBeLessThan(0);
    expect(compareBytes(bytes(0xff), bytes(0x00))).toBeGreaterThan(0);
  });

  it('is antisymmetric across a representative set', () => {
    const samples = [bytes(), bytes(0), bytes(1), bytes(1, 0), bytes(0xff), bytes(1, 2, 3)];
    for (const left of samples) {
      for (const right of samples) {
        // `|| 0` normalises -0, which Object.is distinguishes from +0.
        const forward = Math.sign(compareBytes(left, right)) || 0;
        const backward = Math.sign(compareBytes(right, left)) || 0;
        expect(forward).toBe(-backward || 0);
      }
    }
  });
});

describe('findInsertIndex', () => {
  const entries = [
    makeEntry(bytes(1), 'a', new Set(['w:1'])),
    makeEntry(bytes(3), 'b', new Set(['w:2'])),
    makeEntry(bytes(5), 'c', new Set(['w:3'])),
  ];

  it('returns 0 for a suffix ordering before every entry', () => {
    expect(findInsertIndex(entries, bytes(0))).toBe(0);
  });

  it('returns the length for a suffix ordering after every entry', () => {
    expect(findInsertIndex(entries, bytes(9))).toBe(entries.length);
  });

  it('returns the gap index for a suffix falling between entries', () => {
    expect(findInsertIndex(entries, bytes(2))).toBe(1);
    expect(findInsertIndex(entries, bytes(4))).toBe(2);
  });

  it('returns the index of an equal entry, so insertion is stable at the match', () => {
    expect(findInsertIndex(entries, bytes(3))).toBe(1);
  });

  it('returns 0 for an empty entry list', () => {
    expect(findInsertIndex([], bytes(7))).toBe(0);
  });

  it('keeps the list sorted when each returned index is used to splice', () => {
    const built: ReturnType<typeof makeEntry>[] = [];
    for (const value of [5, 1, 3, 0, 4]) {
      const suffix = bytes(value);
      built.splice(findInsertIndex(built, suffix), 0, makeEntry(suffix, `e${value}`, new Set()));
    }
    expect(built.map((entry) => entry.routeKeySuffix[0])).toStrictEqual([0, 1, 3, 4, 5]);
  });
});

describe('nibbleBitsOf', () => {
  it.each([1, 2, 4, 6, 8])('accepts the supported geometry %i', (value) => {
    expect(nibbleBitsOf(value)).toBe(value);
  });

  it.each([0, 3, 5, 7, 9, 16])('rejects unsupported geometry %i', (value) => {
    expect(() => nibbleBitsOf(value)).toThrow(/nibbleBits must be 1, 2, 4, 6, or 8/u);
  });
});

describe('validateElement', () => {
  it('accepts a non-empty string', () => {
    expect(() => validateElement('node:one')).not.toThrow();
  });

  it('rejects the empty string', () => {
    expect(() => validateElement('')).toThrow(/must be a non-empty string/u);
  });
});

describe('validateDot', () => {
  it('accepts a well-formed dot', () => {
    expect(() => validateDot(new Dot('writer-a', 1))).not.toThrow();
  });

  it('rejects a zero counter, because dot counters start at one', () => {
    expect(() => validateDot(new Dot('writer-a', 1))).not.toThrow();
    expect(() => validateDot(malformedDot({ writerId: 'writer-a', counter: 0 }))).toThrow(
      /positive integer/u,
    );
  });

  it('rejects a fractional counter', () => {
    expect(() => validateDot(malformedDot({ writerId: 'writer-a', counter: 1.5 }))).toThrow(
      /positive integer/u,
    );
  });

  it('rejects an empty writer id', () => {
    expect(() => validateDot(malformedDot({ writerId: '', counter: 1 }))).toThrow(
      /non-empty string/u,
    );
  });

  it('rejects a null dot rather than dereferencing it', () => {
    expect(() => validateDot(malformedDot(null))).toThrow(/TrieCursor dot must be/u);
  });
});

/**
 * Presents a dot shape the compiler would reject.
 *
 * `validateDot` guards a runtime boundary — decoded trie bytes, a JavaScript
 * caller — that the type system does not police, so the bad shape has to reach
 * it unchecked. One cast, confined here.
 */
function malformedDot(fields: unknown): Dot {
  return fields as Dot;
}
