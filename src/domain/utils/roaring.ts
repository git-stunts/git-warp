import WarpError from '../errors/WarpError.ts';

export type RoaringBitmapSubset = {
  readonly size: number;
  add(value: number): void;
  clear(): void;
  remove(value: number): void;
  has(value: number): boolean;
  orInPlace(other: Iterable<number>): void;
  serialize(portable: boolean): Uint8Array;
  toArray(): number[];
  [Symbol.iterator](): Iterator<number>;
};

export type RoaringBitmap32Constructor = {
  new(values?: Iterable<number>): RoaringBitmapSubset;
  deserialize(data: Uint8Array | ArrayLike<number>, portable: boolean): RoaringBitmapSubset;
  isNativelyInstalled?: () => boolean;
};

type RoaringModuleOverride = {
  readonly RoaringBitmap32: RoaringBitmap32Constructor;
  readonly default?: { readonly RoaringBitmap32?: RoaringBitmap32Constructor };
  readonly isNativelyInstalled?: boolean;
};

export type RoaringModuleInput = RoaringModuleOverride | object;

type RoaringLoaderModule = {
  readonly initRoaring: (mod?: RoaringModuleInput) => Promise<void>;
  readonly getRoaringBitmap32: () => RoaringBitmap32Constructor;
  readonly getNativeRoaringAvailable: () => boolean | null;
};

let roaringLoader: RoaringLoaderModule | null = null;
let loaderError: Error | null = null;

try {
  const mod = await import('../../infrastructure/adapters/RoaringLoaderAdapter.ts');
  roaringLoader = {
    initRoaring: mod.initRoaring,
    getRoaringBitmap32: mod.getRoaringBitmap32,
    getNativeRoaringAvailable: mod.getNativeRoaringAvailable,
  };
} catch (err) {
  loaderError = err instanceof Error ? err : new WarpError(String(err), 'E_ROARING_LOAD');
}

function requireLoader(): RoaringLoaderModule {
  if (roaringLoader !== null) {
    return roaringLoader;
  }
  const cause = loaderError === null ? '' : ` Caused by: ${loaderError.message}`;
  throw new WarpError(
    `Roaring loader adapter not available.${cause}`,
    'E_ROARING_NOT_LOADED',
  );
}

export async function initRoaring(mod?: RoaringModuleInput): Promise<void> {
  await requireLoader().initRoaring(mod);
}

export function getRoaringBitmap32(): RoaringBitmap32Constructor {
  return requireLoader().getRoaringBitmap32();
}

export function getNativeRoaringAvailable(): boolean | null {
  if (roaringLoader === null) {
    return false;
  }
  return roaringLoader.getNativeRoaringAvailable();
}
