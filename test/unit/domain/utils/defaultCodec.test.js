import { describe, it, expect } from 'vitest';

import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';

describe('defaultCodec', () => {
  it('sorts map keys and nested object keys deterministically', () => {
    const value = new Map([
      ['b', { z: 2, a: 1 }],
      ['a', [{ y: 2, x: 1 }]],
    ]);

    const decoded = /** @type {{ a: Array<{x: number, y: number}>, b: {a: number, z: number} }} */ (
      defaultCodec.decode(defaultCodec.encode(value))
    );

    expect(Object.keys(decoded)).toEqual(['a', 'b']);
    expect(Object.keys(decoded.b)).toEqual(['a', 'z']);
    expect(Object.keys(decoded.a[0])).toEqual(['x', 'y']);
  });

  it('preserves CBOR-native nested values without flattening them into plain objects', () => {
    const when = new Date('2026-04-06T16:00:00.000Z');
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const pattern = /warp/gi;
    const tags = new Set(['alpha', 'beta']);

    const decoded = /** @type {{ when: Date, bytes: Uint8Array, pattern: RegExp, tags: Set<string> }} */ (
      defaultCodec.decode(defaultCodec.encode({
        when,
        bytes,
        pattern,
        tags,
      }))
    );

    expect(decoded.when).toBeInstanceOf(Date);
    expect(decoded.when.toISOString()).toBe(when.toISOString());
    expect(decoded.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded.bytes)).toEqual([1, 2, 3, 4]);
    expect(decoded.pattern).toBeInstanceOf(RegExp);
    expect(decoded.pattern.source).toBe('warp');
    expect(decoded.pattern.flags).toContain('g');
    expect(decoded.pattern.flags).toContain('i');
    expect(decoded.tags).toBeInstanceOf(Set);
    expect(Array.from(decoded.tags)).toEqual(['alpha', 'beta']);
  });
});
