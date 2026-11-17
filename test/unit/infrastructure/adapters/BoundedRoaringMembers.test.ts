import { describe, expect, it } from 'vitest';
import RoaringShardRejectedError from '../../../../src/domain/errors/RoaringShardRejectedError.ts';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';
import { encodePortableShard } from '../../../helpers/PortableRoaringShardFixture.ts';

/**
 * #1159 item 3 (decision D5). The loader gives the domain a wrapper class
 * that is deny by default: a bitmap that it creates or loads exposes only
 * the declared bitmap members (`RoaringBitmapSubset`), and the class exposes
 * only the two boundary statics. No library member, such as an instance
 * `deserialize` that loads bytes without the boundary, is reachable.
 *
 * Oracle: PR #1128's RED table. A shard whose container keys are out of
 * order is refused by the shard boundary ('key-order') and admitted by the
 * library itself. The member lists below are the declared surface, written
 * by hand from `src/domain/utils/roaring.ts`.
 */
const KEY_ORDER_VIOLATION = encodePortableShard([
  { kind: 'array', key: 2, values: [1] },
  { kind: 'array', key: 1, values: [1] },
]);

const DECLARED_BITMAP_MEMBERS = [
  'add', 'at', 'clear', 'constructor', 'has', 'orInPlace', 'rank', 'remove', 'serialize', 'size', 'toArray',
  'Symbol(Symbol.iterator)',
].sort();
const DECLARED_CLASS_MEMBERS = ['deserialize', 'deserializeAlive', 'isNativelyInstalled', 'length', 'name', 'prototype'].sort();

type ByteLoader = { deserialize(data: Uint8Array, portable: boolean): object };

function isByteLoader(value: object): value is ByteLoader {
  return 'deserialize' in value && typeof value.deserialize === 'function';
}

/** What a bitmap instance does with the shard: it has no byte loader, refuses it, or loads it. */
function instanceLoadOutcome(bytes: Uint8Array): string {
  const bitmap = new (getRoaringBitmap32())();
  if (!isByteLoader(bitmap)) {
    return 'no byte loader';
  }
  try {
    bitmap.deserialize(bytes, true);
    return 'loaded';
  } catch (error) {
    return error instanceof RoaringShardRejectedError ? 'refused' : 'failed';
  }
}

/** Every property name on `value` and its prototypes, up to `stop`, as sorted text. */
function memberNames(value: object, stop: object): string[] {
  const names = new Set<string>();
  for (let level: object | null = value; level !== null && level !== stop; level = Object.getPrototypeOf(level)) {
    for (const key of Reflect.ownKeys(level)) {
      names.add(String(key));
    }
  }
  return [...names].sort();
}

describe('members of the bounded Roaring bitmap class (#1159 item 3)', () => {
  it('refuses the shard through the static deserialize', () => {
    expect(() => getRoaringBitmap32().deserialize(KEY_ORDER_VIOLATION, true)).toThrow(RoaringShardRejectedError);
  });

  it('lets no bitmap instance load the shard without the boundary', () => {
    expect(['no byte loader', 'refused']).toContain(instanceLoadOutcome(KEY_ORDER_VIOLATION));
  });

  it.each([
    ['a bitmap that it creates', () => new (getRoaringBitmap32())([1, 2])],
    ['a bitmap that it loads', () => getRoaringBitmap32().deserialize(new (getRoaringBitmap32())([1, 2]).serialize(true), true)],
    ['an alive bitmap that it loads', () => getRoaringBitmap32().deserializeAlive(new (getRoaringBitmap32())([1]).serialize(true))],
  ])('exposes only the declared bitmap members on %s', (_name, make) => {
    expect(memberNames(make(), Object.prototype)).toEqual(DECLARED_BITMAP_MEMBERS);
  });

  it('exposes only the boundary statics on the class', () => {
    expect(memberNames(getRoaringBitmap32(), Function.prototype)).toEqual(DECLARED_CLASS_MEMBERS);
  });
});
