/**
 * Canonical bytes that may be used as BTR HMAC material.
 *
 * Construction is intentionally guarded. The public class constructor
 * cannot be called from TypeScript, and runtime construction without the
 * module token fails. The only exported factory names the canonical BTR
 * signing encoder path.
 */

import WarpError from '../../errors/WarpError.ts';

const BTR_SIGNING_BYTES_CONSTRUCTION_TOKEN = Symbol('canonical-btr-signing-bytes');

export default class BtrSigningBytes {
  readonly #bytes: Uint8Array;

  private constructor(bytes: Uint8Array, token: symbol) {
    if (token !== BTR_SIGNING_BYTES_CONSTRUCTION_TOKEN) {
      throw new WarpError(
        'BtrSigningBytes must be created by the canonical BTR signing encoder',
        'E_BTR_SIGNING_BYTES_CONSTRUCTION',
      );
    }

    this.#bytes = new Uint8Array(bytes);
    Object.freeze(this);
  }

  static fromCanonicalBtrSigningEncoder(bytes: Uint8Array): BtrSigningBytes {
    return new BtrSigningBytes(bytes, BTR_SIGNING_BYTES_CONSTRUCTION_TOKEN);
  }

  copyBytes(): Uint8Array {
    return new Uint8Array(this.#bytes);
  }
}

export { BtrSigningBytes };
