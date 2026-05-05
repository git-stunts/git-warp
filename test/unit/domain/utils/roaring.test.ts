import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RoaringBitmap32Constructor,
  RoaringBitmapSubset,
} from '../../../../src/domain/utils/roaring.ts';

async function importFreshRoaring(): Promise<typeof import('../../../../src/domain/utils/roaring.ts')> {
  return import('../../../../src/domain/utils/roaring.ts');
}

class FakeBitmap implements RoaringBitmapSubset {
  readonly _values: Set<number>;

  constructor(values?: Iterable<number>) {
    this._values = new Set(values ?? []);
  }

  get size(): number {
    return this._values.size;
  }

  add(value: number): void {
    this._values.add(value);
  }

  clear(): void {
    this._values.clear();
  }

  remove(value: number): void {
    this._values.delete(value);
  }

  has(value: number): boolean {
    return this._values.has(value);
  }

  orInPlace(other: Iterable<number>): void {
    for (const value of other) {
      this._values.add(value);
    }
  }

  serialize(_portable: boolean): Uint8Array {
    return new Uint8Array(this.toArray());
  }

  toArray(): number[] {
    return [...this._values];
  }

  [Symbol.iterator](): Iterator<number> {
    return this._values[Symbol.iterator]();
  }
}

function createBitmapConstructor(options: {
  readonly nativeAvailability?: boolean;
  readonly label: string;
}): RoaringBitmap32Constructor {
  class BitmapCtor extends FakeBitmap {
    static deserialize(data: Uint8Array | ArrayLike<number>): RoaringBitmapSubset {
      return new BitmapCtor(Array.from(data));
    }
  }

  Object.defineProperty(BitmapCtor, 'name', {
    value: options.label,
  });

  if (options.nativeAvailability !== undefined) {
    const nativeAvailability = options.nativeAvailability;
    return Object.assign(BitmapCtor, {
      isNativelyInstalled: (): boolean => nativeAvailability,
    });
  }

  return BitmapCtor;
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
      RoaringBitmap32: createBitmapConstructor({ nativeAvailability: false, label: 'FakeBitmapFalse' }),
    });

    expect(getNativeRoaringAvailable()).toBe(false);
  });

  it('resets nativeAvailability on fresh load path', async () => {
    const roaringMod = await importFreshRoaring();
    const { initRoaring, getNativeRoaringAvailable } = roaringMod;

    getNativeRoaringAvailable();

    await initRoaring({
      RoaringBitmap32: createBitmapConstructor({ nativeAvailability: true, label: 'FakeBitmapTrue' }),
    });
    expect(getNativeRoaringAvailable()).toBe(true);

    await initRoaring({
      RoaringBitmap32: createBitmapConstructor({ nativeAvailability: false, label: 'FakeBitmapFalseAgain' }),
    });
    expect(getNativeRoaringAvailable()).toBe(false);
  });

  it('unwraps default exports when called with a module', async () => {
    const roaringMod = await importFreshRoaring();
    const { initRoaring, getRoaringBitmap32 } = roaringMod;

    const innerBitmap = createBitmapConstructor({ nativeAvailability: false, label: 'WrappedBitmap' });
    await initRoaring({
      default: { RoaringBitmap32: innerBitmap },
    });

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
      RoaringBitmap32: createBitmapConstructor({ label: 'WasmBitmap' }),
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
    const injectedBitmap = createBitmapConstructor({ nativeAvailability: false, label: 'InjectedBitmap' });

    expect(roaringMod.getNativeRoaringAvailable()).toBe(false);
    await roaringMod.initRoaring({ RoaringBitmap32: injectedBitmap });

    expect(roaringMod.getRoaringBitmap32()).toBe(injectedBitmap);
    expect(roaringMod.getNativeRoaringAvailable()).toBe(false);
  });

  it('returns early when initRoaring is called after a module is already loaded', async () => {
    const roaringMod = await importFreshRoaring();
    const bitmap = createBitmapConstructor({ nativeAvailability: true, label: 'EarlyBitmap' });

    await roaringMod.initRoaring({ RoaringBitmap32: bitmap });
    await expect(roaringMod.initRoaring()).resolves.toBeUndefined();

    expect(roaringMod.getRoaringBitmap32()).toBe(bitmap);
  });
});

describe('getNativeRoaringAvailable', () => {
  it('uses the property-based API when no method is available', async () => {
    const roaringMod = await importFreshRoaring();
    await roaringMod.initRoaring({
      RoaringBitmap32: createBitmapConstructor({ label: 'PropertyBitmap' }),
      isNativelyInstalled: true,
    });

    expect(roaringMod.getNativeRoaringAvailable()).toBe(true);
  });

  it('returns null when installation type is indeterminate', async () => {
    const roaringMod = await importFreshRoaring();
    await roaringMod.initRoaring({
      RoaringBitmap32: createBitmapConstructor({ label: 'UnknownBitmap' }),
    });

    expect(roaringMod.getNativeRoaringAvailable()).toBeNull();
  });

  it('returns false when the loaded module is malformed', async () => {
    const roaringMod = await importFreshRoaring();
    await roaringMod.initRoaring({});

    expect(roaringMod.getNativeRoaringAvailable()).toBe(false);
  });
});
