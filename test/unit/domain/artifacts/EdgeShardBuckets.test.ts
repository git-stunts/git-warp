import { describe, expect, it } from 'vitest';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import requireEdgeShardBuckets from '../../../../src/domain/artifacts/EdgeShardBuckets.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import requireRoaringShardBytes from '../../../../src/domain/artifacts/RoaringShardBytes.ts';
import type CodecValue from '../../../../src/domain/types/codec/CodecValue.ts';

const NOT_BYTES = { code: 'E_ROARING_SHARD_MALFORMED', context: { fault: 'not-bytes' } };
const NOT_BUCKETS = { code: 'E_ROARING_SHARD_MALFORMED', context: { fault: 'not-buckets' } };

/** A value that records every read of the length it declares. */
function declaredLength(): { readonly value: CodecValue; readonly reads: () => number } {
  let reads = 0;
  const value = {
    get length(): number {
      reads += 1;
      return 2 ** 28;
    },
  };
  return { value, reads: () => reads };
}

describe('requireRoaringShardBytes', () => {
  it('returns the same byte array, including an empty one', () => {
    const bytes = new Uint8Array([58, 48, 0, 0, 0, 0, 0, 0]);
    const empty = new Uint8Array(0);

    expect(requireRoaringShardBytes(bytes)).toBe(bytes);
    expect(requireRoaringShardBytes(empty)).toBe(empty);
  });

  it('refuses a value that declares a length without reading the length', () => {
    const declared = declaredLength();

    expect(() => requireRoaringShardBytes(declared.value)).toThrow(expect.objectContaining(NOT_BYTES));
    expect(declared.reads()).toBe(0);
  });

  it.each<[string, CodecValue]>([
    ['null', null],
    ['undefined', undefined],
    ['a plain array of byte values', [58, 48, 0, 0, 0, 0, 0, 0]],
    ['a string', 'OjAAAAAAAAA='],
    ['a number', 8],
    ['an empty map', {}],
  ])('refuses %s', (_name, value) => {
    expect(() => requireRoaringShardBytes(value)).toThrow(expect.objectContaining(NOT_BYTES));
  });
});

describe('requireEdgeShardBuckets', () => {
  it('returns the decoded shard itself when every bucket value is bytes', () => {
    const decoded = { all: { '1': new Uint8Array([1]) }, '0': { '1': new Uint8Array(0) } };

    expect(requireEdgeShardBuckets(decoded)).toBe(decoded);
    expect(requireEdgeShardBuckets({})).toEqual({});
  });

  it('refuses a bucket value that declares a length without reading the length', () => {
    const declared = declaredLength();

    expect(() => requireEdgeShardBuckets({ all: { '1': new Uint8Array([1]), '2': declared.value } }))
      .toThrow(expect.objectContaining(NOT_BYTES));
    expect(declared.reads()).toBe(0);
  });

  it.each<[string, CodecValue]>([
    ['null', null],
    ['a plain array of byte values', [1, 2, 3]],
    ['a string', 'bytes'],
    ['a nested map', { length: 3 }],
  ])('refuses %s as a bucket value', (_name, value) => {
    expect(() => requireEdgeShardBuckets({ all: { '1': value } }))
      .toThrow(expect.objectContaining(NOT_BYTES));
  });

  it.each<[string, CodecValue]>([
    ['null', null],
    ['undefined', undefined],
    ['an array', [{ '1': new Uint8Array([1]) }]],
    ['bytes', new Uint8Array([1])],
    ['a date', new Date(0)],
    ['a string', 'all'],
  ])('refuses %s in place of the shard or of a bucket', (_name, value) => {
    expect(() => requireEdgeShardBuckets(value)).toThrow(expect.objectContaining(NOT_BUCKETS));
    expect(() => requireEdgeShardBuckets({ all: value })).toThrow(expect.objectContaining(NOT_BUCKETS));
  });
});

describe('index shards that carry bitmap bytes', () => {
  it('keeps the bitmap bytes that a writer supplies', () => {
    const alive = new Uint8Array([58, 48, 0, 0, 0, 0, 0, 0]);
    const buckets = { all: { '1': new Uint8Array([1]) } };

    expect(new MetaShard({ shardKey: 'aa', nodeToGlobal: [], nextLocalId: 0, alive }).alive).toBe(alive);
    expect(new EdgeShard({ shardKey: 'aa', direction: 'fwd', buckets }).buckets).toBe(buckets);
  });

  it('cannot be built over a value that is not bytes', () => {
    expect(() => new EdgeShard({
      shardKey: 'aa',
      direction: 'fwd',
      // @ts-expect-error A decoded shard can hold a value that the static type excludes.
      buckets: { all: { '1': { length: 2 ** 28 } } },
    })).toThrow(expect.objectContaining(NOT_BYTES));
    expect(() => new MetaShard({
      shardKey: 'aa',
      nodeToGlobal: [],
      nextLocalId: 0,
      // @ts-expect-error A decoded shard can hold a value that the static type excludes.
      alive: { length: 2 ** 28 },
    })).toThrow(expect.objectContaining(NOT_BYTES));
  });
});
