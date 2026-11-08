import RoaringShardRejectedError from '../../domain/errors/RoaringShardRejectedError.ts';
import type { RoaringBitmap32Constructor, RoaringBitmapSubset } from '../../domain/utils/roaring.ts';
import inspectPortableRoaringShard from './PortableRoaringShardInspector.ts';
import type RoaringShardBounds from './RoaringShardBounds.ts';

/**
 * Returns a constructor that validates every serialized shard before
 * `library` deserializes it. Construction and every other bitmap
 * operation stay with the library.
 */
export default function boundRoaringConstructor(
  library: RoaringBitmap32Constructor,
  bounds: RoaringShardBounds,
): RoaringBitmap32Constructor {
  return class BoundedRoaringBitmap32 extends library {
    static override deserialize(data: Uint8Array, portable: boolean): RoaringBitmapSubset {
      if (!portable) {
        throw RoaringShardRejectedError.unsupportedFormat();
      }
      const inspection = inspectPortableRoaringShard(data, bounds);
      if (inspection instanceof RoaringShardRejectedError) {
        throw inspection;
      }
      return library.deserialize(data, true);
    }
  };
}
