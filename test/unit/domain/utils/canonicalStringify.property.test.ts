import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { canonicalStringify } from '../../../../src/domain/utils/canonicalStringify.ts';

describe('canonicalStringify property checks', () => {
  it('is idempotent after JSON round-trip', () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      const canonical = canonicalStringify(value);
      const roundTrip = JSON.parse(canonical);
      expect(canonicalStringify(roundTrip)).toBe(canonical);
    }), { numRuns: 100 });
  });

  it('is insensitive to shallow object insertion order', () => {
    const entriesArb = fc.uniqueArray(
      fc.tuple(fc.string(), fc.jsonValue()),
      {
        selector: ([key]) => key,
        maxLength: 8,
      },
    );

    fc.assert(fc.property(entriesArb, (entries) => {
      const forward = Object.fromEntries(entries);
      const reverse = Object.fromEntries([...entries].reverse());
      expect(canonicalStringify(forward)).toBe(canonicalStringify(reverse));
    }), { numRuns: 100 });
  });
});
