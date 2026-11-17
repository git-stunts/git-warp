import { describe, expect, it } from 'vitest';
import RoaringShardRejectedError from '../../../../src/domain/errors/RoaringShardRejectedError.ts';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';
import { encodePortableShard } from '../../../helpers/PortableRoaringShardFixture.ts';

/**
 * #1159 item 3. The loader returns a subclass of the library's bitmap class
 * that inspects bytes in its static `deserialize` and `deserializeAlive`.
 * Every other member is the library's own.
 *
 * Oracle: PR #1128's RED table. A shard whose container keys are out of
 * order is refused by the shard boundary ('key-order') and admitted by the
 * library itself.
 */
const KEY_ORDER_VIOLATION = encodePortableShard([
  { kind: 'array', key: 2, values: [1] },
  { kind: 'array', key: 1, values: [1] },
]);

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

describe('members of the bounded Roaring bitmap class (#1159 item 3)', () => {
  it('refuses the shard through the static deserialize', () => {
    expect(() => getRoaringBitmap32().deserialize(KEY_ORDER_VIOLATION, true)).toThrow(RoaringShardRejectedError);
  });

  // Reproduced, not fixed: every bitmap that the loader creates or returns
  // is an instance of the library class, whose instance deserialize loads
  // the bytes without the boundary.
  it.fails('lets no bitmap instance load the shard without the boundary (#1159)', () => {
    expect(['no byte loader', 'refused']).toContain(instanceLoadOutcome(KEY_ORDER_VIOLATION));
  });
});
