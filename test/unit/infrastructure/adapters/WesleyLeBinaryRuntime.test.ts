import { describe, expect, it } from 'vitest';
import { CodecError, Reader, Writer } from '../../../../src/infrastructure/adapters/wesley/WesleyLeBinaryRuntime.ts';

describe('WesleyLeBinaryRuntime', () => {
  it('roundtrips scalars, options, and lists through little-endian bytes', () => {
    const writer = new Writer();
    writer.writeU32Le(0xffff_ffff);
    writer.writeI32Le(-123);
    writer.writeF32Le(1.5);
    writer.writeBool(true);
    writer.writeBool(false);
    writer.writeString('hello');
    writer.writeOption<number>(null, (runtimeWriter, value) => {
      runtimeWriter.writeI32Le(value);
    });
    writer.writeOption(7, (runtimeWriter, value) => {
      runtimeWriter.writeI32Le(value);
    });
    writer.writeList([1, 2, 3], (runtimeWriter, value) => {
      runtimeWriter.writeI32Le(value);
    });

    const reader = new Reader(writer.finish());

    expect(reader.readU32Le()).toBe(0xffff_ffff);
    expect(reader.readI32Le()).toBe(-123);
    expect(reader.readF32Le()).toBe(1.5);
    expect(reader.readBool()).toBe(true);
    expect(reader.readBool()).toBe(false);
    expect(reader.readString()).toBe('hello');
    expect(reader.readOption((runtimeReader) => runtimeReader.readI32Le())).toBeNull();
    expect(reader.readOption((runtimeReader) => runtimeReader.readI32Le())).toBe(7);
    expect(reader.readList((runtimeReader) => runtimeReader.readI32Le())).toEqual([1, 2, 3]);
    expect(reader.remaining()).toBe(0);
  });

  it('rejects malformed integer writes', () => {
    const writer = new Writer();

    expect(() => writer.writeU32Le(1.5)).toThrow('u32 value must be an integer');
    expect(() => writer.writeU32Le(-1)).toThrow('u32 out of range');
    expect(() => writer.writeI32Le(0x8000_0000)).toThrow('i32 out of range');
    expect(() => writer.writeI32Le(-0x8000_0001)).toThrow('i32 out of range');
  });

  it('rejects invalid tags and truncated input during decode', () => {
    expect(() => new Reader(new Uint8Array([0x02])).readBool())
      .toThrow('invalid boolean tag: 2');
    expect(() => new Reader(new Uint8Array([0x02])).readOption(() => 1))
      .toThrow('invalid option tag: 2');
    expect(() => new Reader(new Uint8Array([0x01, 0x00, 0x00])).readU32Le())
      .toThrow('unexpected end of Wesley LE-binary input');
  });

  it('rejects lists that exceed the decode item limit during encode', () => {
    const writer = new Writer();
    const oversized = new Array<number>(1_000_001).fill(0);

    expect(() => writer.writeList(oversized, (runtimeWriter, value) => {
      runtimeWriter.writeI32Le(value);
    })).toThrow(CodecError);
  });

  it('rejects lists that exceed the decode item limit during decode', () => {
    const oversizedListHeader = new Uint8Array([0x41, 0x42, 0x0f, 0x00]);
    const reader = new Reader(oversizedListHeader);

    expect(() => reader.readList(() => 1)).toThrow(CodecError);
  });

  it('normalizes malformed UTF-8 strings to CodecError', () => {
    const oneInvalidByte = new Uint8Array([1, 0, 0, 0, 0xff]);
    const reader = new Reader(oneInvalidByte);

    expect(() => reader.readString()).toThrow(CodecError);
  });
});
