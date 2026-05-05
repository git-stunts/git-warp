/**
 * Opaque sync HMAC secret value.
 *
 * Callers construct this at the API boundary. Domain sync code carries
 * the opaque object instead of a plain string, and accidental rendering
 * paths redact the value.
 */

import SyncError from '../../errors/SyncError.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';

const REDACTED_SECRET = '[REDACTED]';
const NODE_INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom');

export default class SyncSecret {
  readonly #value: string;

  private constructor(value: string) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new SyncError('SyncSecret requires a non-empty string', {
        code: 'E_SYNC_SECRET_INVALID',
      });
    }
    this.#value = value;
    Object.freeze(this);
  }

  static fromString(value: string): SyncSecret {
    return new SyncSecret(value);
  }

  async hmac(
    crypto: CryptoPort,
    algorithm: string,
    data: string | Uint8Array,
  ): Promise<Uint8Array> {
    return await crypto.hmac(algorithm, this.#value, data);
  }

  toString(): string {
    return REDACTED_SECRET;
  }

  toJSON(): string {
    return REDACTED_SECRET;
  }

  [NODE_INSPECT_CUSTOM](): string {
    return REDACTED_SECRET;
  }
}
