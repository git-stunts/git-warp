import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** @type {typeof import('../../../../src/domain/utils/roaring.js')} */
let roaringMod;

beforeEach(async () => {
  vi.resetModules();
  roaringMod = await import('../../../../src/domain/utils/roaring.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initRoaring', () => {
  it('resets nativeAvailability when called with a new module', async () => {
    const { initRoaring, getNativeRoaringAvailable } = roaringMod;

    // Probe native availability to cache a value from the real module
    const first = getNativeRoaringAvailable();
    expect([true, false, null]).toContain(first);

    // Reinit with a fake module where isNativelyInstalled => false
    const fakeMod = {
      RoaringBitmap32: Object.assign(function FakeBitmap() {}, {
        isNativelyInstalled: () => false,
      }),
    };
    await initRoaring(fakeMod);

    // After reinit, availability must reflect the NEW module
    const second = getNativeRoaringAvailable();
    expect(second).toBe(false);
  });

  it('resets nativeAvailability on fresh load path', async () => {
    const { initRoaring, getNativeRoaringAvailable } = roaringMod;

    // First call caches availability
    getNativeRoaringAvailable();

    // Reinit with a native-style module
    const nativeMod = {
      RoaringBitmap32: Object.assign(function NativeBitmap() {}, {
        isNativelyInstalled: () => true,
      }),
    };
    await initRoaring(nativeMod);
    expect(getNativeRoaringAvailable()).toBe(true);

    // Reinit again with WASM-style module
    const wasmMod = {
      RoaringBitmap32: Object.assign(function WasmBitmap() {}, {
        isNativelyInstalled: () => false,
      }),
    };
    await initRoaring(wasmMod);
    expect(getNativeRoaringAvailable()).toBe(false);
  });

  it('unwraps default exports when called with a module', async () => {
    const { initRoaring, getRoaringBitmap32 } = roaringMod;

    const innerBitmap = Object.assign(function WrappedBitmap() {}, {
      isNativelyInstalled: () => false,
    });
    const wrappedMod = /** @type {import('../../../../src/domain/utils/roaring.js').RoaringModule} */ (
      /** @type {unknown} */ ({
        default: { RoaringBitmap32: innerBitmap },
        RoaringBitmap32: undefined,
      })
    );
    await initRoaring(wrappedMod);

    // Should have unwrapped to the inner module
    expect(getRoaringBitmap32()).toBe(innerBitmap);
  });
});
