import { afterEach, describe, expect, it, vi } from 'vitest';
import RoaringShardRejectedError from '../../../../src/domain/errors/RoaringShardRejectedError.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalBitmapShard, { LIVENESS_INDEX } from '../../../../src/domain/retained/OrdinalBitmapShard.ts';
import OrdinalChunk from '../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionDirectoryPage from '../../../../src/domain/retained/SelectionDirectoryPage.ts';
import SelectionGeometry from '../../../../src/domain/retained/SelectionGeometry.ts';
import ConeRecordCborCodec from '../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { getRoaringBitmap32 } from '../../../../src/infrastructure/adapters/RoaringLoaderAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

const V1 = SelectionGeometry.chunks();
const cbor = new CborCodec();
const codec = new ConeRecordCborCodec(cbor);
const chunkOf = (counter: number, geometry = V1): OrdinalChunk =>
  OrdinalChunk.of(new GraphOrdinal({ kind: 'edge', writerId: 'w1', counter }), geometry);
const shardOf = (counter: number, offsets: readonly number[]): OrdinalBitmapShard =>
  new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(counter), offsets });
const range = (from: number, count: number): number[] => Array.from({ length: count }, (_unused, index) => from + index);
/** Portable Roaring bytes of segment-local ordinals, as another writer would have stored them. */
const portable = (values: readonly number[]): Uint8Array => {
  const bitmap = new (getRoaringBitmap32())(values);
  try {
    return bitmap.serialize(true);
  } finally {
    bitmap.dispose();
  }
};
const stored = (chunk: number, members: Uint8Array): Uint8Array =>
  cbor.encode({ kind: 'selection', index: 'live', set: 'edge', writer: 'w1', segment: 0, chunk, members });
const isDisposer = (value: unknown): value is { dispose(): boolean } =>
  typeof value === 'object' && value !== null && 'dispose' in value && typeof value.dispose === 'function';
/** The prototype that owns `dispose`: the library's, which loaded and constructed bitmaps share. */
function bitmapPrototype(): { dispose(): boolean } {
  const probe = new (getRoaringBitmap32())();
  probe.dispose();
  let prototype: unknown = Object.getPrototypeOf(probe);
  while (isDisposer(prototype) && !Object.hasOwn(prototype, 'dispose')) {
    prototype = Object.getPrototypeOf(prototype);
  }
  if (!isDisposer(prototype)) {
    throw new TypeError('Roaring bitmaps have no dispose method');
  }
  return prototype;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConeRecordCborCodec selection shards (#816)', () => {
  it.each([
    { name: 'empty', counter: 1, offsets: [] },
    { name: 'sparse (array container)', counter: 1, offsets: [1, 7, 65_535] },
    { name: 'dense (bitmap container)', counter: 65_536, offsets: range(0, 70_000).filter((value) => value % 3 === 0 && value < 65_536) },
    { name: 'consecutive (run container)', counter: 2 ** 32, offsets: range(0, 65_536) },
  ])('round-trips a $name shard with its chunk', ({ counter, offsets }) => {
    const shard = shardOf(counter, offsets);
    const decoded = codec.decode(codec.encode(shard));
    expect(decoded instanceof OrdinalBitmapShard && decoded.equals(shard)).toBe(true);
    expect(decoded.key().equals(shard.key())).toBe(true);
  });

  it('stores run-optimized bytes, so one set of members always gives the same, smallest bytes', () => {
    const consecutive = shardOf(1, range(1, 60_000));
    // Oracle: a run container of one run is 2 + 4 bytes; without run optimization it is an 8192-byte bitmap.
    expect(codec.encode(consecutive).byteLength).toBeLessThan(128);
    const rebuilt = new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(1), offsets: [...consecutive.offsets()] });
    expect(codec.encode(rebuilt)).toEqual(codec.encode(consecutive));
  });

  it('disposes every bitmap it creates', () => {
    const dispose = vi.spyOn(bitmapPrototype(), 'dispose');
    codec.decode(codec.encode(shardOf(1, [1, 2, 3])));
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: 'too many bytes', code: 'E_ROARING_SHARD_TOO_LARGE', bytes: () => new Uint8Array(8209) },
    { name: 'not portable Roaring', code: 'E_ROARING_SHARD_MALFORMED', bytes: () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) },
    { name: 'two containers', code: 'E_ROARING_SHARD_MALFORMED', bytes: () => portable([1, 65_536]) },
    { name: 'the container of another chunk', code: 'E_ROARING_SHARD_MALFORMED', bytes: () => portable([65_537]) },
  ])('refuses members with $name before the Roaring library reads them', ({ code, bytes }) => {
    const members = bytes();
    const deserialize = vi.spyOn(getRoaringBitmap32(), 'deserialize');
    expect(() => codec.decode(stored(0, members))).toThrow(RoaringShardRejectedError);
    expect(() => codec.decode(stored(0, members))).toThrow(expect.objectContaining({ code }));
    expect(deserialize).not.toHaveBeenCalled();
  });

  it('refuses members that are not bytes, and a chunk outside its segment', () => {
    expect(() => codec.decode(cbor.encode({ kind: 'selection', index: 'live', set: 'edge', writer: 'w1', segment: 0, chunk: 0, members: [1] })))
      .toThrow('does not decode as a cone record');
    expect(() => codec.decode(stored(65_536, portable([])))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
  });

  it('refuses to encode a shard of a geometry the record layout does not store', () => {
    const small = SelectionGeometry.of({ version: 2, chunkSpan: 256 });
    const shard = new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(300, small), offsets: [44] });
    expect(() => codec.encode(shard)).toThrow(expect.objectContaining({ code: 'E_RETAINED_GEOMETRY_UNSUPPORTED' }));
  });

  it('round-trips a directory page with its chunks in order', () => {
    const page = new SelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'edge', pageIndex: 2, chunks: [chunkOf(1), chunkOf(65_536), chunkOf(2 ** 32)] });
    const decoded = codec.decode(codec.encode(page));
    expect(decoded instanceof SelectionDirectoryPage && decoded.equals(page)).toBe(true);
    expect(cbor.decode(codec.encode(page))).toEqual({
      kind: 'selection-directory', index: 'live', set: 'edge', page: 2, chunks: [['w1', 0, 0], ['w1', 0, 1], ['w1', 1, 0]],
    });
  });

  it('refuses a stored directory page whose chunks are out of order, and a page of another geometry to encode', () => {
    const unordered = cbor.encode({ kind: 'selection-directory', index: 'live', set: 'edge', page: 0, chunks: [['w2', 0, 0], ['w1', 0, 0]] });
    expect(() => codec.decode(unordered)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    const small = SelectionGeometry.of({ version: 2, chunkSpan: 256 });
    const page = new SelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'edge', pageIndex: 0, chunks: [chunkOf(300, small)] });
    expect(() => codec.encode(page)).toThrow(expect.objectContaining({ code: 'E_RETAINED_GEOMETRY_UNSUPPORTED' }));
  });
});
