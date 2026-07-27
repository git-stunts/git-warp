import WarpError from '../domain/errors/WarpError.ts';
import type WarpStorage from './WarpStorage.ts';
import {
  resolveWarpStorage,
  type WarpStorageBinding,
} from './WarpStorageRegistry.ts';

const RUNTIME_STORAGE = new WeakMap<object, WarpStorage>();

export function bindRuntimeStorage(
  runtime: object,
  storage: WarpStorage,
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
  return resolveWarpStorage(storage);
}
