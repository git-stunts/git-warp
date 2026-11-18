import RoaringShardRejectedError from '../../domain/errors/RoaringShardRejectedError.ts';
import type {
  RoaringBitmap32Constructor,
  RoaringBitmapSubset,
  RoaringLibraryConstructor,
} from '../../domain/utils/roaring.ts';
import { AdmittedLibraryBitmap, BoundedRoaringBitmap } from './BoundedRoaringBitmap.ts';
import inspectPortableRoaringShard from './PortableRoaringShardInspector.ts';
import type RoaringShardBounds from './RoaringShardBounds.ts';

/**
 * Returns the bitmap class that the loader gives the domain. It is deny by
 * default (#1159): it does not extend the library class, so no library
 * static (`from`, `fromRange`, ...) is reachable through it, and every
 * bitmap that it creates or admits is a `BoundedRoaringBitmap`, which
 * exposes only the declared bitmap members.
 *
 * `deserialize` inspects bytes with the `edge` bounds and `deserializeAlive`
 * with the `alive` bounds before the library reads them. Construction,
 * serialization and every declared bitmap operation stay with the library,
 * so no write is refused. An index update stores the bitmaps that it does
 * not change as the bytes that it read, without a check.
 */
export default function boundRoaringConstructor(
  library: RoaringLibraryConstructor,
  bounds: { readonly edge: RoaringShardBounds; readonly alive: RoaringShardBounds },
): RoaringBitmap32Constructor {
  function admit(data: Uint8Array, kindBounds: RoaringShardBounds): AdmittedLibraryBitmap {
    const inspection = inspectPortableRoaringShard(data, kindBounds);
    if (inspection instanceof RoaringShardRejectedError) {
      throw inspection;
    }
    return new AdmittedLibraryBitmap(library.deserialize(data, true));
  }

  const BoundedRoaringBitmap32 = class BoundedRoaringBitmap32 extends BoundedRoaringBitmap {
    constructor(values?: Iterable<number> | AdmittedLibraryBitmap) {
      super(library, values);
    }

    static deserialize(data: Uint8Array, portable: boolean): RoaringBitmapSubset {
      if (!portable) {
        throw RoaringShardRejectedError.unsupportedFormat();
      }
      return new BoundedRoaringBitmap32(admit(data, bounds.edge));
    }

    static deserializeAlive(data: Uint8Array): RoaringBitmapSubset {
      return new BoundedRoaringBitmap32(admit(data, bounds.alive));
    }
  };
  return withNativeAvailability(BoundedRoaringBitmap32, library);
}

/** Keeps the one declared library static, `isNativelyInstalled`, when the library has it. */
function withNativeAvailability(
  bounded: RoaringBitmap32Constructor,
  library: RoaringLibraryConstructor,
): RoaringBitmap32Constructor {
  const { isNativelyInstalled } = library;
  if (isNativelyInstalled !== undefined) {
    bounded.isNativelyInstalled = () => isNativelyInstalled.call(library);
  }
  return bounded;
}
