import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let roaringModule = null;
let nativeAvailability = null;

function loadRoaring() {
  if (!roaringModule) {
    roaringModule = require('roaring');
  }
  return roaringModule;
}

export function getRoaringBitmap32() {
  return loadRoaring().RoaringBitmap32;
}

export function getNativeRoaringAvailable() {
  if (nativeAvailability !== null) {
    return nativeAvailability;
  }

  try {
    const roaring = loadRoaring();
    const { RoaringBitmap32 } = roaring;

    if (typeof RoaringBitmap32.isNativelyInstalled === 'function') {
      nativeAvailability = RoaringBitmap32.isNativelyInstalled();
      return nativeAvailability;
    }

    if (roaring.isNativelyInstalled !== undefined) {
      nativeAvailability = roaring.isNativelyInstalled;
      return nativeAvailability;
    }

    nativeAvailability = null;
    return nativeAvailability;
  } catch {
    nativeAvailability = false;
    return nativeAvailability;
  }
}
