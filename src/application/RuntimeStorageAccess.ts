import WarpError from '../domain/errors/WarpError.ts';
import type { WarpStorageBinding } from './WarpStorageRegistry.ts';

const RUNTIME_STORAGE = new WeakMap<object, WarpStorageBinding>();

export function bindRuntimeStorage(
  runtime: object,
  storage: WarpStorageBinding,
): void {
  RUNTIME_STORAGE.set(runtime, storage);
}

export function resolveRuntimeStorage(runtime: object): WarpStorageBinding {
  const storage = RUNTIME_STORAGE.get(runtime);
  if (storage === undefined) {
    throw new WarpError(
      'Runtime storage is unavailable',
      'E_RUNTIME_STORAGE_UNAVAILABLE',
    );
  }
  return storage;
}
