import WarpError from '../domain/errors/WarpError.ts';
import { validateGraphName } from '../domain/utils/RefLayout.ts';
import GitStorage from './GitStorage.ts';

/** Where a Warp lives: a storage and a graph name. It names no writer or observer. */
export default class WarpAddress {
  readonly storage: GitStorage;
  readonly name: string;

  private constructor(storage: GitStorage, name: string) {
    this.storage = storage;
    this.name = name;
    Object.freeze(this);
  }

  static of(storage: GitStorage, name: string): WarpAddress {
    if (!(storage instanceof GitStorage)) {
      throw new WarpError('WarpAddress requires a GitStorage', 'E_WARP_ADDRESS_STORAGE');
    }
    validateGraphName(name);
    return new WarpAddress(storage, name);
  }
}
