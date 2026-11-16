import { describe, expect, it } from 'vitest';

import IndexError from '../../../../src/domain/errors/IndexError.ts';
import MessageCodecError from '../../../../src/domain/errors/MessageCodecError.ts';
import type CodecValue from '../../../../src/domain/types/codec/CodecValue.ts';
import { validateBoundedCbor } from '../../../../src/infrastructure/adapters/BoundedCborValidation.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const STRICT_LIMITS = { maxDepth: 32, maxItems: 1_000_000, maxContainerEntries: 1_000_000 };
const WIDE_EPOCHS: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['unsigned eight-byte epoch', [0xc1, 0x1b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]],
  ['negative eight-byte epoch', [0xc1, 0x3b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]],
];
const SUPPORTED_EPOCHS: ReadonlyArray<readonly [string, readonly number[], number]> = [
  ['small positive', [0x01], 1000],
  ['small negative', [0x21], -2000],
  ['one-byte positive', [0x18, 0x01], 1000],
  ['one-byte negative', [0x38, 0x01], -2000],
  ['two-byte positive', [0x19, 0x00, 0x01], 1000],
  ['two-byte negative', [0x39, 0x00, 0x01], -2000],
  ['four-byte positive', [0x1a, 0x00, 0x00, 0x00, 0x01], 1000],
  ['four-byte negative', [0x3a, 0x00, 0x00, 0x00, 0x01], -2000],
  ['half-precision fractional', [0xf9, 0x3e, 0x00], 1500],
  ['single-precision fractional', [0xfa, 0x3f, 0xc0, 0x00, 0x00], 1500],
  ['double-precision fractional', [0xfb, 0x3f, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 1500],
];

function capturedError(operation: () => void): Error | null {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) { return error; }
    throw error;
  }
  return null;
}

describe('CborCodec epoch representations', () => {
  it.each(WIDE_EPOCHS)('refuses the %s at the generic typed boundary', (_name, bytes) => {
    const error = capturedError(() => { defaultCodec.decode(Uint8Array.from(bytes)); });

    expect(error).toBeInstanceOf(MessageCodecError);
    if (!(error instanceof MessageCodecError)) { throw new Error('expected MessageCodecError'); }
    expect(error.code).toBe('E_CBOR_DECODE_BOUNDS');
    expect(error.context).toEqual({ reason: 'tag content has a refused major type' });
  });

  it.each(WIDE_EPOCHS)('refuses the %s at the strict index preflight boundary', (_name, bytes) => {
    const error = capturedError(() => { validateBoundedCbor(Uint8Array.from(bytes), STRICT_LIMITS); });

    expect(error).toBeInstanceOf(IndexError);
    if (!(error instanceof IndexError)) { throw new Error('expected IndexError'); }
    expect(error.code).toBe('E_INDEX_SHARD_MALFORMED');
    expect(error.context).toEqual({ reason: 'tag content has a refused major type' });
  });

  it.each(SUPPORTED_EPOCHS)('preserves the %s epoch representation', (_name, content, milliseconds) => {
    const encoded = Uint8Array.from([0xc1, ...content]);
    expect(() => validateBoundedCbor(encoded, STRICT_LIMITS)).not.toThrow();

    const decoded = defaultCodec.decode<CodecValue>(encoded);

    expect(decoded).toBeInstanceOf(Date);
    if (!(decoded instanceof Date)) { throw new Error('expected Date'); }
    expect(decoded.getTime()).toBe(milliseconds);
  });

  it.each<readonly [string, readonly number[], bigint]>([
    ['unsigned', [0x1b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01], 1n],
    ['negative', [0x3b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01], -2n],
  ])('preserves the untagged %s eight-byte integer', (_name, bytes, expected) => {
    const encoded = Uint8Array.from(bytes);

    expect(() => validateBoundedCbor(encoded, STRICT_LIMITS)).not.toThrow();
    expect(defaultCodec.decode(encoded)).toBe(expected);
  });
});
