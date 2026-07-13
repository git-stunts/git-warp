import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RoaringBitmap32Constructor,
  RoaringBitmapSubset,
} from '../../../../src/domain/utils/roaring.ts';

async function importFreshAdapter(): Promise<
  typeof import('../../../../src/infrastructure/adapters/RoaringLoaderAdapter.ts')
> {
  return import('../../../../src/infrastructure/adapters/RoaringLoaderAdapter.ts');
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
    return [...this._values].sort((left, right) => left - right);
  }

  rank(value: number): number {
    return this.toArray().filter((candidate) => candidate <= value).length;
  }

  at(index: number): number | undefined {
    return this.toArray().at(index);
  }

  [Symbol.iterator](): Iterator<number> {
    return this._values[Symbol.iterator]();
  }
}

function createBitmapConstructor(options: {
  readonly label: string;
  readonly nativeAvailability?: boolean;
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

describe('RoaringLoaderAdapter', () => {
  it('reports constructor-based native availability', async () => {
    const adapter = await importFreshAdapter();
    const bitmap = createBitmapConstructor({
      label: 'NativeBitmap',
      nativeAvailability: true,
    });

    await adapter.initRoaring({
      RoaringBitmap32: bitmap,
    });

    expect(adapter.getNativeRoaringAvailable()).toBe(true);
  });

  it('reports property-based native availability', async () => {
    const adapter = await importFreshAdapter();
    const bitmap = createBitmapConstructor({ label: 'PropertyBitmap' });

    await adapter.initRoaring({
      RoaringBitmap32: bitmap,
      isNativelyInstalled: true,
    });

    expect(adapter.getNativeRoaringAvailable()).toBe(true);
  });

  it('reports null when native availability cannot be determined', async () => {
    const adapter = await importFreshAdapter();
    const bitmap = createBitmapConstructor({ label: 'UnknownBitmap' });

    await adapter.initRoaring({
      RoaringBitmap32: bitmap,
    });

    expect(adapter.getNativeRoaringAvailable()).toBeNull();
  });

  it('captures malformed injected modules as unavailable', async () => {
    const adapter = await importFreshAdapter();

    await adapter.initRoaring({});

    expect(adapter.getNativeRoaringAvailable()).toBe(false);
  });

  it('surfaces aggregate load failure when no loader path succeeds', async () => {
    vi.doMock('roaring', () => {
      throw new Error('native import failed');
    });
    vi.doMock('node:module', () => ({
      createRequire: () => () => {
        throw new Error('cjs require failed');
      },
    }));
    vi.doMock('roaring-wasm', () => {
      throw new Error('wasm import failed');
    });

    const adapter = await importFreshAdapter();

    await expect(adapter.initRoaring()).rejects.toThrow(AggregateError);
    expect(adapter.getNativeRoaringAvailable()).toBe(false);
  });
});
