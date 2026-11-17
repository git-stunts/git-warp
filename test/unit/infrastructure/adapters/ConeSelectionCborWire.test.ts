import { describe, expect, it } from 'vitest';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalBitmapBlock, { LIVENESS_INDEX } from '../../../../src/domain/retained/OrdinalBitmapBlock.ts';
import OrdinalChunk from '../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionDirectoryEntry from '../../../../src/domain/retained/SelectionDirectoryEntry.ts';
import SelectionDirectoryPage from '../../../../src/domain/retained/SelectionDirectoryPage.ts';
import SelectionGeometry from '../../../../src/domain/retained/SelectionGeometry.ts';
import ConeRecordCborCodec from '../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

const V1 = SelectionGeometry.chunks();
const cbor = new CborCodec();
const codec = new ConeRecordCborCodec(cbor);
const chunkOf = (counter: number, geometry = V1): OrdinalChunk =>
  OrdinalChunk.of(new GraphOrdinal({ kind: 'edge', writerId: 'w1', counter }), geometry);
const blockOf = (counter: number, block: number, offsets: readonly number[]): OrdinalBitmapBlock =>
  new OrdinalBitmapBlock({ index: LIVENESS_INDEX, chunk: chunkOf(counter), block, offsets });
const range = (from: number, count: number): number[] => Array.from({ length: count }, (_unused, index) => from + index);
const stored = (fields: { readonly block: number; readonly members: Uint8Array }): Uint8Array =>
  cbor.encode({ kind: 'selection-block', index: 'live', set: 'edge', writer: 'w1', segment: 0, chunk: 0, ...fields });
const wireOf = (record: OrdinalBitmapBlock | SelectionDirectoryPage): unknown => cbor.decode(codec.encode(record));

describe('ConeRecordCborCodec selection blocks (#816, F1 decision)', () => {
  it.each([
    { name: 'empty', block: 0, offsets: [] },
    { name: 'sparse', block: 0, offsets: [1, 7, 1_023] },
    { name: 'every second offset', block: 5, offsets: range(0, 512).map((value) => value * 2) },
    { name: 'full', block: 63, offsets: range(0, 1_024) },
  ])('round-trips a $name block as one 128-byte bitset', ({ block, offsets }) => {
    const original = blockOf(1, block, offsets);
    const decoded = codec.decode(codec.encode(original));
    expect(decoded instanceof OrdinalBitmapBlock && decoded.equals(original)).toBe(true);
    expect(decoded.key().equals(original.key())).toBe(true);
    expect(wireOf(original)).toMatchObject({ kind: 'selection-block', block, members: expect.any(Uint8Array) });
  });

  it('writes the canonical bitset: offset i is bit i % 8 of byte floor(i / 8), and every block has the same size', () => {
    // Oracle: the #816 F1 decision, a canonical 128-byte bitset, least significant bit first.
    const expected = new Uint8Array(128);
    expected[0] = 0b0000_0010;
    expected[1] = 0b1000_0000;
    expected[127] = 0b1000_0000;
    expect(wireOf(blockOf(1, 0, [1, 15, 1_023]))).toMatchObject({ members: expected });
    const sizes = [blockOf(1, 0, []), blockOf(1, 0, [1]), blockOf(1, 9, range(0, 1_024))].map((record) => codec.encode(record).byteLength);
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBeLessThanOrEqual(128 + 96);
  });

  it.each([
    { name: 'one byte short', members: () => new Uint8Array(127) },
    { name: 'one byte long', members: () => new Uint8Array(129) },
    { name: 'empty', members: () => new Uint8Array(0) },
  ])('refuses a stored bitset that is $name', ({ members }) => {
    expect(() => codec.decode(stored({ block: 1, members: members() })))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_CORRUPT', context: expect.objectContaining({ blockSpan: 1_024 }) }));
  });

  it('refuses a stored bit that names counter 0, members that are not bytes, and a block outside its chunk', () => {
    const counterZero = new Uint8Array(128);
    counterZero[0] = 1;
    expect(() => codec.decode(stored({ block: 0, members: counterZero }))).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    expect(() => codec.decode(cbor.encode({ kind: 'selection-block', index: 'live', set: 'edge', writer: 'w1', segment: 0, chunk: 0, block: 0, members: [1] })))
      .toThrow('does not decode as a cone record');
    expect(() => codec.decode(stored({ block: 64, members: new Uint8Array(128) }))).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it('refuses to encode a block of a geometry the record layout does not store', () => {
    const small = SelectionGeometry.of({ version: 2, chunkSpan: 256, blockSpan: 256 });
    const block = new OrdinalBitmapBlock({ index: LIVENESS_INDEX, chunk: chunkOf(300, small), block: 0, offsets: [44] });
    expect(() => codec.encode(block)).toThrow(expect.objectContaining({ code: 'E_RETAINED_GEOMETRY_UNSUPPORTED' }));
  });
});

describe('ConeRecordCborCodec selection directory pages (#816, F1 decision)', () => {
  const entryOf = (counter: number, liveBlocks: bigint, geometry = V1): SelectionDirectoryEntry =>
    new SelectionDirectoryEntry({ chunk: chunkOf(counter, geometry), liveBlocks });

  it('round-trips a directory page with its entries in order and each 64-bit mask as 8 bytes, least significant first', () => {
    const page = new SelectionDirectoryPage({
      index: LIVENESS_INDEX, set: 'edge', pageIndex: 2,
      entries: [entryOf(1, 0n), entryOf(65_536, (1n << 63n) | 0x0102n), entryOf(2 ** 32, 1n)],
    });
    const decoded = codec.decode(codec.encode(page));
    expect(decoded instanceof SelectionDirectoryPage && decoded.equals(page)).toBe(true);
    expect(wireOf(page)).toEqual({
      kind: 'selection-directory', index: 'live', set: 'edge', page: 2, chunks: [
        ['w1', 0, 0, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])],
        ['w1', 0, 1, new Uint8Array([2, 1, 0, 0, 0, 0, 0, 0x80])],
        ['w1', 1, 0, new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])],
      ],
    });
  });

  it('refuses a stored mask that is not 8 bytes, entries out of order, and a page of another geometry to encode', () => {
    const shortMask = cbor.encode({ kind: 'selection-directory', index: 'live', set: 'edge', page: 0, chunks: [['w1', 0, 0, new Uint8Array(7)]] });
    expect(() => codec.decode(shortMask)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_CORRUPT' }));
    const mask = new Uint8Array(8);
    const unordered = cbor.encode({ kind: 'selection-directory', index: 'live', set: 'edge', page: 0, chunks: [['w2', 0, 0, mask], ['w1', 0, 0, mask]] });
    expect(() => codec.decode(unordered)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    const small = SelectionGeometry.of({ version: 2, chunkSpan: 256, blockSpan: 256 });
    const page = new SelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'edge', pageIndex: 0, entries: [entryOf(300, 1n, small)] });
    expect(() => codec.encode(page)).toThrow(expect.objectContaining({ code: 'E_RETAINED_GEOMETRY_UNSUPPORTED' }));
  });
});
