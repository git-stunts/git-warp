import WarpError from '../../domain/errors/WarpError.ts';
import type {
  RoaringBitmap32Constructor,
  RoaringModuleInput,
} from '../../domain/utils/roaring.ts';

type RoaringModule = {
  readonly RoaringBitmap32: RoaringBitmap32Constructor;
  readonly isNativelyInstalled?: boolean;
};

const NOT_CHECKED: unique symbol = Symbol('NOT_CHECKED');

let roaringModule: RoaringModule | null = null;
let initError: Error | null = null;
let nativeAvailability: boolean | typeof NOT_CHECKED | null = NOT_CHECKED;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRoaringBitmap32Constructor(value: unknown): value is RoaringBitmap32Constructor {
  return typeof value === 'function';
}

function normalizeIsNativelyInstalled(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeRoaringModule(value: unknown): RoaringModule | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const directCtor = value['RoaringBitmap32'];
  if (isRoaringBitmap32Constructor(directCtor)) {
    const directIsNativelyInstalled = normalizeIsNativelyInstalled(value['isNativelyInstalled']);
    return directIsNativelyInstalled === undefined
      ? { RoaringBitmap32: directCtor }
      : { RoaringBitmap32: directCtor, isNativelyInstalled: directIsNativelyInstalled };
  }
  const defaultValue = value['default'];
  if (!isObjectRecord(defaultValue)) {
    return null;
  }
  const wrappedCtor = defaultValue['RoaringBitmap32'];
  if (!isRoaringBitmap32Constructor(wrappedCtor)) {
    return null;
  }
  const wrappedIsNativelyInstalled = normalizeIsNativelyInstalled(value['isNativelyInstalled']);
  return wrappedIsNativelyInstalled === undefined
    ? { RoaringBitmap32: wrappedCtor }
    : { RoaringBitmap32: wrappedCtor, isNativelyInstalled: wrappedIsNativelyInstalled };
}

function requireRoaringModule(): RoaringModule {
  if (roaringModule !== null) {
    return roaringModule;
  }
  const cause = initError === null ? '' : ` Caused by: ${initError.message}`;
  throw new WarpError(
    `Roaring module not loaded. Call initRoaring() first or ensure top-level await import completed.${cause}`,
    'E_ROARING_NOT_LOADED',
  );
}

function hasRoaringLibraryInitialize(
  value: unknown,
): value is { readonly roaringLibraryInitialize: () => Promise<void> } {
  return isObjectRecord(value) && typeof value['roaringLibraryInitialize'] === 'function';
}

async function tryNativeImport(errors: Error[]): Promise<RoaringModule | null> {
  try {
    return normalizeRoaringModule(await import('roaring'));
  } catch (err) {
    errors.push(err instanceof Error ? err : new WarpError(String(err), 'E_ROARING_LOAD'));
    return null;
  }
}

async function tryCjsRequire(errors: Error[]): Promise<RoaringModule | null> {
  try {
    const nodeModule = await import('node:module');
    const req = nodeModule.createRequire(import.meta.url);
    return normalizeRoaringModule(req('roaring'));
  } catch (err) {
    errors.push(err instanceof Error ? err : new WarpError(String(err), 'E_ROARING_LOAD'));
    return null;
  }
}

async function tryWasmFallback(errors: Error[]): Promise<RoaringModule | null> {
  try {
    const wasmModule = await import('roaring-wasm');
    if (hasRoaringLibraryInitialize(wasmModule)) {
      await wasmModule.roaringLibraryInitialize();
    }
    const normalized = normalizeRoaringModule(wasmModule);
    if (normalized === null) {
      errors.push(new WarpError('roaring-wasm did not expose RoaringBitmap32', 'E_ROARING_LOAD'));
      return null;
    }
    normalized.RoaringBitmap32.isNativelyInstalled = (): boolean => false;
    return normalized;
  } catch (err) {
    errors.push(err instanceof Error ? err : new WarpError(String(err), 'E_ROARING_LOAD'));
    return null;
  }
}

async function loadFallbackChain(): Promise<void> {
  const loadErrors: Error[] = [];
  roaringModule =
    (await tryNativeImport(loadErrors)) ??
    (await tryCjsRequire(loadErrors)) ??
    (await tryWasmFallback(loadErrors));
  if (roaringModule === null) {
    throw new AggregateError(
      loadErrors,
      'Failed to load roaring via import(), require(), and roaring-wasm',
    );
  }
  nativeAvailability = NOT_CHECKED;
  initError = null;
}

export async function initRoaring(mod?: RoaringModuleInput): Promise<void> {
  if (mod !== undefined) {
    roaringModule = normalizeRoaringModule(mod);
    initError = roaringModule === null
      ? new WarpError('Injected roaring module does not expose RoaringBitmap32', 'E_ROARING_INVALID_MODULE')
      : null;
    nativeAvailability = NOT_CHECKED;
    return;
  }
  if (roaringModule !== null) {
    return;
  }
  await loadFallbackChain();
}

try {
  await initRoaring();
} catch (err) {
  initError = err instanceof Error ? err : new WarpError(String(err), 'E_ROARING_LOAD');
}

export function getRoaringBitmap32(): RoaringBitmap32Constructor {
  return requireRoaringModule().RoaringBitmap32;
}

export function getNativeRoaringAvailable(): boolean | null {
  if (nativeAvailability !== NOT_CHECKED) {
    return nativeAvailability;
  }

  try {
    const roaring = requireRoaringModule();
    if (typeof roaring.RoaringBitmap32.isNativelyInstalled === 'function') {
      nativeAvailability = roaring.RoaringBitmap32.isNativelyInstalled();
      return roaring.RoaringBitmap32.isNativelyInstalled();
    }
    if (roaring.isNativelyInstalled !== undefined) {
      nativeAvailability = roaring.isNativelyInstalled;
      return roaring.isNativelyInstalled;
    }
    nativeAvailability = null;
    return null;
  } catch {
    nativeAvailability = false;
    return false;
  }
}
