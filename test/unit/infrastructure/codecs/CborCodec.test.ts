import { describe, it, expect } from 'vitest';

import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

function nestedSingleItemArrays(depth: number): Uint8Array {
  const bytes = new Uint8Array(depth + 1);
  bytes.fill(0x81, 0, depth);
  bytes[depth] = 0xf6;
  return bytes;
}

describe('CborCodec', () => {
  it('sorts map keys and nested object keys deterministically', () => {
    const value = new Map([
      ['b', { z: 2, a: 1 }],
      ['a', [{ y: 2, x: 1 }]],
    ]);

    const decoded = defaultCodec.decode(defaultCodec.encode(value)) as {
      a: Array<{ x: number; y: number }>;
      b: { a: number; z: number };
    };

    expect(Object.keys(decoded)).toEqual(['a', 'b']);
    expect(Object.keys(decoded.b)).toEqual(['a', 'z']);
    expect(Object.keys(decoded.a[0]!)).toEqual(['x', 'y']);
  });

  it('preserves the allowed CBOR-native nested values without flattening them into plain objects', () => {
    const when = new Date('2026-04-06T16:00:00.000Z');
    const fractional = new Date('2026-04-06T16:00:00.250Z');
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const large = 1n << 70n;
    const negative = -(1n << 70n);

    const decoded = defaultCodec.decode(defaultCodec.encode({
      when,
      fractional,
      bytes,
      large,
      negative,
    })) as { when: Date; fractional: Date; bytes: Uint8Array; large: bigint; negative: bigint };

    expect(decoded.when).toBeInstanceOf(Date);
    expect(decoded.when.toISOString()).toBe(when.toISOString());
    expect(decoded.fractional.toISOString()).toBe(fractional.toISOString());
    expect(decoded.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded.bytes)).toEqual([1, 2, 3, 4]);
    expect(decoded.large).toBe(large);
    expect(decoded.negative).toBe(negative);
  });

  it('accepts CBOR at the configured nesting-depth boundary', () => {
    expect(() => defaultCodec.decode(nestedSingleItemArrays(32))).not.toThrow();
  });

  it('preserves valid generic CBOR maps with non-text keys', () => {
    const decoded = defaultCodec.decode(
      Uint8Array.from([0xa1, 0x01, 0x02]),
    ) as { readonly [key: string]: number };

    expect(decoded).toEqual({ 1: 2 });
  });

  it('rejects CBOR deeper than the configured nesting limit before decoding', () => {
    expect(() => defaultCodec.decode(nestedSingleItemArrays(33))).toThrowError(
      expect.objectContaining({
        code: 'E_CBOR_DECODE_BOUNDS',
        context: {
          reason: 'nesting depth exceeds the configured maximum',
        },
      }),
    );
  });

  it('rejects encoded payloads larger than five MiB before structural decoding', () => {
    const oversized = new Uint8Array((5 * 1024 * 1024) + 1);

    expect(() => defaultCodec.decode(oversized)).toThrowError(
      expect.objectContaining({
        code: 'E_CBOR_DECODE_BOUNDS',
        context: {
          reason: expect.stringContaining('encoded byte length'),
        },
      }),
    );
  });
});
