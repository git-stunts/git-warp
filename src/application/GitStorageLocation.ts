import AdapterValidationError from '../domain/errors/AdapterValidationError.ts';
import type WarpStorage from './WarpStorage.ts';

/** Where a located storage points. It holds no resources until a Warp opens it. */
const LOCATIONS = new WeakMap<WarpStorage, string>();

export function locateGitStorage(storage: WarpStorage, location: string): void {
  LOCATIONS.set(storage, location);
}

/** Where a located storage points; a storage opened some other way has no location. */
export function gitStorageLocation(storage: WarpStorage): string {
  const location = LOCATIONS.get(storage);
  if (location === undefined) {
    throw new AdapterValidationError('This GitStorage was not created by GitStorage.root or GitStorage.at');
  }
  return location;
}
