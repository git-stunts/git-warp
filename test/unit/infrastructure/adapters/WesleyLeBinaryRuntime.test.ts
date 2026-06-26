import { describe, expect, it } from 'vitest';
import { CodecError, Reader, Writer } from '../../../../src/infrastructure/adapters/wesley/WesleyLeBinaryRuntime.ts';

describe('WesleyLeBinaryRuntime', () => {
  it('rejects lists that exceed the decode item limit during encode', () => {
    const writer = new Writer();
    const oversized = new Array<number>(1_000_001).fill(0);

    expect(() => writer.writeList(oversized, (runtimeWriter, value) => {
      runtimeWriter.writeI32Le(value);
    })).toThrow(CodecError);
  });

  it('normalizes malformed UTF-8 strings to CodecError', () => {
    const oneInvalidByte = new Uint8Array([1, 0, 0, 0, 0xff]);
    const reader = new Reader(oneInvalidByte);

    expect(() => reader.readString()).toThrow(CodecError);
  });
});
