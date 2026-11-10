import RoaringShardRejectedError from '../../domain/errors/RoaringShardRejectedError.ts';
import type { RoaringBitmap32Constructor, RoaringBitmapSubset } from '../../domain/utils/roaring.ts';
import inspectPortableRoaringShard from './PortableRoaringShardInspector.ts';
import type RoaringShardBounds from './RoaringShardBounds.ts';

/**
 * Returns a constructor that validates every serialized shard before
 * `library` deserializes it, and that refuses to serialize a bitmap above
 * the cardinality bound. A writer therefore cannot store a bitmap that
 * every reader refuses. Construction and every other bitmap operation stay
 * with the library.
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
      const bitmap = library.deserialize(data, true);
      // The library builds an instance of its own class. The instance takes
      // the bounded prototype, so a loaded bitmap that grows meets the same
      // write bound as a new one.
      Object.setPrototypeOf(bitmap, BoundedRoaringBitmap32.prototype);
      return bitmap;
    }

    override serialize(portable: boolean): Uint8Array {
      if (this.size > bounds.maxCardinality) {
        throw RoaringShardRejectedError.cardinalityUnwritable(this.size, bounds.maxCardinality);
      }
      return super.serialize(portable);
    }
  };
}
