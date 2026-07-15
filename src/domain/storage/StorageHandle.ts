import WarpError from '../errors/WarpError.ts';

const MAX_HANDLE_LENGTH = 4096;

/** Opaque locator for immutable application storage managed outside the domain. */
export default class StorageHandle {
  readonly #token: string;

  constructor(token: string) {
    requireHandleToken(token);
    this.#token = token;
    Object.freeze(this);
  }

  toString(): string {
    return this.#token;
  }

  equals(other: StorageHandle | null | undefined): boolean {
    return other instanceof StorageHandle && other.#token === this.#token;
  }
}

function requireHandleToken(token: string): void {
  if (typeof token !== 'string' || token.length === 0) {
    throw new WarpError('StorageHandle must contain a non-empty token', 'E_STORAGE_HANDLE');
  }
  requireBoundedToken(token);
  requireSingleLineToken(token);
}

function requireBoundedToken(token: string): void {
  if (token.length > MAX_HANDLE_LENGTH) {
    throw new WarpError('StorageHandle token exceeds the maximum length', 'E_STORAGE_HANDLE');
  }
}

function requireSingleLineToken(token: string): void {
  if (token.includes('\0') || /[\r\n]/u.test(token)) {
    throw new WarpError('StorageHandle token has an invalid shape', 'E_STORAGE_HANDLE');
  }
}
