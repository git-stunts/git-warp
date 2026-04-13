import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * @returns {Promise<typeof import('../../../../src/domain/utils/roaring.ts')>}
 */
async function importFreshRoaring() {
  return import('../../../../src/domain/utils/roaring.ts');
}

/**
 * @param {boolean} value
 * @returns {Function & { isNativelyInstalled: () => boolean }}
 */
function createMethodBitmap(value) {
  return Object.assign(function FakeBitmap() {}, {
    isNativelyInstalled: () => value,
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('roaring');
  vi.doUnmock('roaring-wasm');
  vi.doUnmock('node:module');
});

describe('initRoaring', () => {
  it('resets nativeAvailability when called with a new module', async () => {
    const roaringMod = await importFreshRoaring();
    const { initRoaring, getNativeRoaringAvailable } = roaringMod;

    const first = getNativeRoaringAvailable();
    expect([true, false, null]).toContain(first);

    await initRoaring({
      RoaringBitmap32: createMethodBitmap(false),
    });

    expect(getNativeRoaringAvailable()).toBe(false);
  });

  it('resets nativeAvailability on fresh load path', async () => {
    const roaringMod = await importFreshRoaring();
    const { initRoaring, getNativeRoaringAvailable } = roaringMod;

    getNativeRoaringAvailable();

    await initRoaring({
      RoaringBitmap32: createMethodBitmap(true),
    });
    expect(getNativeRoaringAvailable()).toBe(true);

    await initRoaring({
      RoaringBitmap32: createMethodBitmap(false),
    });
    expect(getNativeRoaringAvailable()).toBe(false);
  });

  it('unwraps default exports when called with a module', async () => {
    const roaringMod = await importFreshRoaring();
    const { initRoaring, getRoaringBitmap32 } = roaringMod;

    const innerBitmap = createMethodBitmap(false);
    const wrappedMod = (({
        default: { RoaringBitmap32: innerBitmap },
        RoaringBitmap32: undefined,
      }) as any);
    await initRoaring(wrappedMod);

    expect(getRoaringBitmap32()).toBe(innerBitmap);
  });

  it('falls through require failure into the WASM fallback', async () => {
    vi.doMock('roaring', () => {
      throw new Error('esm import failed');
    });
    vi.doMock('node:module', () => ({
      createRequire: () => () => {
        throw new Error('cjs require failed');
      },
    }));
    vi.doMock('roaring-wasm', () => ({
      RoaringBitmap32: (function WasmBitmap() {} as Function),
      roaringLibraryInitialize: vi.fn(async () => {}),
    }));

    const roaringMod = await importFreshRoaring();

    expect(typeof roaringMod.getRoaringBitmap32()).toBe('function');
    expect(roaringMod.getNativeRoaringAvailable()).toBe(false);
  });

  it('clears a prior init error when reinitialized with an injected module', async () => {
    vi.doMock('roaring', () => {
      throw new Error('esm import failed');
    });
    vi.doMock('node:module', () => ({
      createRequire: () => () => {
        throw new Error('cjs require failed');
      },
    }));
    vi.doMock('roaring-wasm', () => {
      throw new Error('wasm import failed');
    });

    const roaringMod = await importFreshRoaring();
    const injectedBitmap = createMethodBitmap(false);

    expect(roaringMod.getNativeRoaringAvailable()).toBe(false);
    await roaringMod.initRoaring({ RoaringBitmap32: injectedBitmap });

    expect(roaringMod.getRoaringBitmap32()).toBe(injectedBitmap);
    expect(roaringMod.getNativeRoaringAvailable()).toBe(false);
  });

  it('returns early when initRoaring is called after a module is already loaded', async () => {
    const roaringMod = await importFreshRoaring();
    const bitmap = createMethodBitmap(true);

    await roaringMod.initRoaring({ RoaringBitmap32: bitmap });
    await expect(roaringMod.initRoaring()).resolves.toBeUndefined();

    expect(roaringMod.getRoaringBitmap32()).toBe(bitmap);
  });

});

describe('getNativeRoaringAvailable', () => {
  it('uses the property-based API when no method is available', async () => {
    const roaringMod = await importFreshRoaring();
    await roaringMod.initRoaring({
      RoaringBitmap32: (function PropertyBitmap() {} as Function),
      isNativelyInstalled: true,
    });

    expect(roaringMod.getNativeRoaringAvailable()).toBe(true);
  });

  it('returns null when installation type is indeterminate', async () => {
    const roaringMod = await importFreshRoaring();
    await roaringMod.initRoaring({
      RoaringBitmap32: (function UnknownBitmap() {} as Function),
    });

    expect(roaringMod.getNativeRoaringAvailable()).toBeNull();
  });

  it('returns false when the loaded module is malformed', async () => {
    const roaringMod = await importFreshRoaring();
    await roaringMod.initRoaring(({} as any));

    expect(roaringMod.getNativeRoaringAvailable()).toBe(false);
  });
});
