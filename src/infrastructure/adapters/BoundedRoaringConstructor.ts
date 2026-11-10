import RoaringShardRejectedError from '../../domain/errors/RoaringShardRejectedError.ts';
import type {
  RoaringBitmap32Constructor,
  RoaringBitmapSubset,
  RoaringLibraryConstructor,
} from '../../domain/utils/roaring.ts';
import inspectPortableRoaringShard from './PortableRoaringShardInspector.ts';
import type RoaringShardBounds from './RoaringShardBounds.ts';

/**
 * Returns a constructor that validates every serialized shard before
 * `library` deserializes it. `deserialize` applies the `edge` bounds and
 * `deserializeAlive` applies the `alive` bounds. Construction,
 * serialization and every other bitmap operation stay with the library, so
 * no write is refused. The boundary checks a shard only when it is
 * deserialized: an index update stores the bitmaps that it does not change
 * as the bytes that it read, without a check.
 */
export default function boundRoaringConstructor(
  library: RoaringLibraryConstructor,
  bounds: { readonly edge: RoaringShardBounds; readonly alive: RoaringShardBounds },
): RoaringBitmap32Constructor {
  function admit(data: Uint8Array, kindBounds: RoaringShardBounds): RoaringBitmapSubset {
    const inspection = inspectPortableRoaringShard(data, kindBounds);
    if (inspection instanceof RoaringShardRejectedError) {
      throw inspection;
    }
    return library.deserialize(data, true);
  }

  return class BoundedRoaringBitmap32 extends library {
    static override deserialize(data: Uint8Array, portable: boolean): RoaringBitmapSubset {
      if (!portable) {
        throw RoaringShardRejectedError.unsupportedFormat();
      }
      return admit(data, bounds.edge);
    }

    static deserializeAlive(data: Uint8Array): RoaringBitmapSubset {
      return admit(data, bounds.alive);
    }
  };
}
