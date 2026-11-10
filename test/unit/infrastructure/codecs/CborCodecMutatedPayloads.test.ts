import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const CORPUS_SEED = 1088;
const CORPUS_RUNS = 128;
const payloads = fc.record({
  writer: fc.string({ minLength: 1, maxLength: 24 }),
  sequence: fc.integer({ min: 0, max: 100_000 }),
  values: fc.array(fc.integer(), { maxLength: 24 }),
  bytes: fc.uint8Array({ maxLength: 64 }),
});
const refusedTags = fc.integer({ min: 4, max: 65_535 }).filter((tag) => tag !== 64);

describe('CborCodec bounded payload mutations', () => {
  it('preserves generated valid payloads and refuses a non-allowlisted tag around each', () => {
    // The oracle is the input value plus the explicit tag allow-list in #1088.
    // Each case uses at most 512 encoded bytes; fast-check retains and shrinks failures.
    fc.assert(fc.property(payloads, refusedTags, (payload, tag) => {
      const encoded = defaultCodec.encode(payload);
      expect(defaultCodec.decode(encoded)).toEqual(payload);

      const tagged = Uint8Array.from([0xd9, tag >>> 8, tag & 0xff, ...encoded]);
      expect(() => defaultCodec.decode(tagged)).toThrowError(expect.objectContaining({
        code: 'E_CBOR_DECODE_BOUNDS',
        context: { reason: 'tag is not in the allowed tag set' },
      }));
    }), { seed: CORPUS_SEED, numRuns: CORPUS_RUNS });
  });

  it('refuses every proper truncation of a valid compound payload', () => {
    const encoded = defaultCodec.encode({ writer: 'replica-a', values: [1, 2], bytes: new Uint8Array([3]) });

    for (let end = 0; end < encoded.byteLength; end += 1) {
      expect(() => defaultCodec.decode(encoded.subarray(0, end)), `truncation at byte ${String(end)}`)
        .toThrowError(expect.objectContaining({ code: 'E_CBOR_DECODE_BOUNDS' }));
    }
  });

  it('accepts a byte string at the five MiB encoded limit', () => {
    const encoded = new Uint8Array(5 * 1024 * 1024);
    encoded.set([0x5a, 0x00, 0x4f, 0xff, 0xfb]);

    const decoded = defaultCodec.decode<Uint8Array>(encoded);

    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded.byteLength).toBe(encoded.byteLength - 5);
    expect(decoded.every((byte) => byte === 0)).toBe(true);
  });

  it('accepts one million total items and refuses one more item', () => {
    const atLimit = new Uint8Array(1_000_004);
    atLimit.set([0x9a, 0x00, 0x0f, 0x42, 0x3f]);
    const overLimit = new Uint8Array(1_000_005);
    overLimit.set([0x9a, 0x00, 0x0f, 0x42, 0x40]);

    const decoded = defaultCodec.decode<readonly number[]>(atLimit);

    expect(decoded).toHaveLength(999_999);
    expect(decoded.every((value) => value === 0)).toBe(true);
    expect(() => defaultCodec.decode(overLimit)).toThrowError(expect.objectContaining({
      code: 'E_CBOR_DECODE_BOUNDS',
      context: { reason: 'decoded item count exceeds the configured maximum' },
    }));
  });

  it('refuses an over-limit container declaration before reading its missing body', () => {
    const encoded = Uint8Array.from([0x9a, 0x00, 0x0f, 0x42, 0x41]);

    expect(() => defaultCodec.decode(encoded)).toThrowError(expect.objectContaining({
      code: 'E_CBOR_DECODE_BOUNDS',
      context: { reason: 'container entry count exceeds the configured maximum' },
    }));
  });
});
