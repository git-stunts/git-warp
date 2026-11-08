import { describe, it, expect } from 'vitest';

import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MessageCodecError from '../../../../src/domain/errors/MessageCodecError.ts';
import {
  CBOR_TAG_CONTENT_REFUSED_REASON,
  CBOR_TAG_REFUSED_REASON,
} from '../../../../src/infrastructure/adapters/BoundedCborValidation.ts';

const encoder = new TextEncoder();

function text(value: string): number[] {
  const bytes = encoder.encode(value);
  const header = bytes.byteLength < 24 ? [0x60 + bytes.byteLength] : [0x78, bytes.byteLength];
  return [...header, ...bytes];
}

function refusal(bytes: readonly number[]): MessageCodecError {
  try {
    defaultCodec.decode(Uint8Array.from(bytes));
  } catch (error) {
    if (error instanceof MessageCodecError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the decoder to refuse the payload');
}

const REFUSED_TAGS: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['generic object RegExp (tag 27)', [0xd8, 0x1b, 0x83, ...text('RegExp'), ...text('(a+)+'), ...text('')]],
  ['generic object Error (tag 27)', [0xd8, 0x1b, 0x83, ...text('Error'), ...text('x'), ...text('')]],
  ['shareable value (tag 28)', [0xd8, 0x1c, 0x80]],
  ['shared reference (tag 29)', [0xd8, 0x1d, 0x00]],
  ['set (tag 258)', [0xd9, 0x01, 0x02, 0x80]],
  ['map (tag 259)', [0xd9, 0x01, 0x03, 0xa0]],
  ['packed table (tag 51)', [0xd8, 0x33, 0x84, 0x80, 0xf6, 0xf6, 0x01]],
  ['packed reference (tag 6)', [0xc6, 0x00]],
  ['other typed array (tag 72)', [0xd8, 0x48, 0x43, 0x01, 0x02, 0x03]],
  ['other typed array (tag 85)', [0xd8, 0x55, 0x43, 0x01, 0x02, 0x03]],
  ['record definitions (tag 0xdffe)', [0xd9, 0xdf, 0xfe, 0x83, 0x19, 0xe0, 0x00, 0x81, ...text('k'), 0xf6]],
  ['record (tag 0xe000)', [0xd9, 0xe0, 0x00, 0x81, 0x01]],
  ['bundled strings (tag 0xdff9)', [0xd9, 0xdf, 0xf9, 0x80]],
  ['unknown tag 999', [0xd9, 0x03, 0xe7, 0x01]],
  ['unknown tag with an eight-byte number', [0xdb, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x01]],
  ['a refused tag nested in allowed containers', [0x81, 0xa1, ...text('a'), 0xd9, 0x01, 0x02, 0x80]],
];

const REFUSED_CONTENT: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['string date (tag 0) over an integer', [0xc0, 0x00]],
  ['epoch date (tag 1) over a text string', [0xc1, ...text('now')]],
  ['epoch date (tag 1) over a simple value', [0xc1, 0xf6]],
  ['positive bignum (tag 2) over an array', [0xc2, 0x80]],
  ['negative bignum (tag 3) over an integer', [0xc3, 0x01]],
  ['Uint8Array (tag 64) over an integer', [0xd8, 0x40, 0x01]],
  ['Uint8Array (tag 64) over a nested tag', [0xd8, 0x40, 0xd8, 0x40, 0x40]],
];

describe('CborCodec tag allow-list', () => {
  it.each(REFUSED_TAGS)('refuses %s with a typed bounds error', (_name, bytes) => {
    const error = refusal(bytes);

    expect(error.code).toBe('E_CBOR_DECODE_BOUNDS');
    expect(error.context).toEqual({ reason: CBOR_TAG_REFUSED_REASON });
  });

  it('refuses a shared-reference cycle before cbor-x can build it', () => {
    const selfReferencingArray = [0xd8, 0x1c, 0x81, 0xd8, 0x1d, 0x00];

    const error = refusal(selfReferencingArray);

    expect(error.code).toBe('E_CBOR_DECODE_BOUNDS');
    expect(error.context).toEqual({ reason: CBOR_TAG_REFUSED_REASON });
  });

  it.each(REFUSED_CONTENT)('refuses %s with a typed bounds error', (_name, bytes) => {
    const error = refusal(bytes);

    expect(error.code).toBe('E_CBOR_DECODE_BOUNDS');
    expect(error.context).toEqual({ reason: CBOR_TAG_CONTENT_REFUSED_REASON });
  });

  it('refuses a truncated tag with a typed bounds error', () => {
    const error = refusal([0xd8, 0x40]);

    expect(error.code).toBe('E_CBOR_DECODE_BOUNDS');
    expect(error.context).toEqual({ reason: 'value is truncated' });
  });

  it('refuses values that the encoder writes with a refused tag', () => {
    const encodedSet = defaultCodec.encode({ members: new Set(['alpha']) });

    expect(refusal(Array.from(encodedSet)).context).toEqual({ reason: CBOR_TAG_REFUSED_REASON });
  });

  it('accepts each allowed tag over its declared content', () => {
    const decoded = defaultCodec.decode(Uint8Array.from([
      0x87,
      0xc0, ...text('2026-04-06T16:00:00.000Z'),
      0xc1, 0x1a, 0x00, 0x00, 0x00, 0x00,
      0xc1, 0x20,
      0xc1, 0xf9, 0x3c, 0x00,
      0xc2, 0x49, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xc3, 0x41, 0x00,
      0xd8, 0x40, 0x42, 0x01, 0x02,
    ])) as readonly [Date, Date, Date, Date, bigint, bigint, Uint8Array];

    expect(decoded[0].toISOString()).toBe('2026-04-06T16:00:00.000Z');
    expect(decoded[1].getTime()).toBe(0);
    expect(decoded[2].getTime()).toBe(-1000);
    expect(decoded[3].getTime()).toBe(1000);
    expect(decoded[4]).toBe(1n << 70n);
    expect(decoded[5]).toBe(-1n);
    expect(decoded[6]).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded[6])).toEqual([1, 2]);
  });
});
