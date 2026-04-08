/**
 * Default crypto implementation for domain services.
 *
 * Provides SHA hashing, HMAC, and timing-safe comparison using
 * node:crypto directly, avoiding concrete adapter imports from
 * the infrastructure layer. This follows the same pattern as
 * defaultCodec.ts and defaultClock.ts.
 *
 * In Node/Bun/Deno, node:crypto loads normally. When the import
 * fails (e.g., Vite stubs `node:crypto` in browser bundles),
 * callers must inject a CryptoPort explicitly.
 *
 * @module domain/utils/defaultCrypto
 */

import type { Hash, Hmac } from 'node:crypto';
import type CryptoPort from '../../ports/CryptoPort.js';

let _createHash: ((algorithm: string) => Hash) | null = null;
let _createHmac: ((algorithm: string, key: Uint8Array | string) => Hmac) | null = null;
let _timingSafeEqual: ((a: Uint8Array, b: Uint8Array) => boolean) | null = null;

try {
  const nodeCrypto = await import('node:crypto');
  _createHash = nodeCrypto.createHash as (algorithm: string) => Hash;
  _createHmac = nodeCrypto.createHmac as (algorithm: string, key: Uint8Array | string) => Hmac;
  _timingSafeEqual = nodeCrypto.timingSafeEqual as (a: Uint8Array, b: Uint8Array) => boolean;
} catch {
  // Import failed (bundler stub, unsupported runtime, etc.) —
  // caller must inject a CryptoPort explicitly.
}

/**
 * Computes a hex-encoded hash of the given data.
 */
function hashSync(algorithm: string, data: Uint8Array | string): string {
  if (_createHash === null) {
    throw new Error('No crypto available. Inject a CryptoPort explicitly.');
  }
  return _createHash(algorithm).update(data).digest('hex');
}

/**
 * Computes an HMAC and returns the raw bytes.
 */
function hmacSync(algorithm: string, key: Uint8Array | string, data: Uint8Array | string): Uint8Array {
  if (_createHmac === null) {
    throw new Error('No crypto available. Inject a CryptoPort explicitly.');
  }
  const result = _createHmac(algorithm, key).update(data).digest();
  return new Uint8Array(result);
}

const defaultCrypto: CryptoPort = {
  // eslint-disable-next-line @typescript-eslint/require-await -- async matches CryptoPort contract
  async hash(algorithm: string, data: string | Uint8Array): Promise<string> {
    return hashSync(algorithm, data);
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- async matches CryptoPort contract
  async hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
    return hmacSync(algorithm, key, data);
  },
  /**
   * Compares two byte arrays in constant time.
   */
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (_timingSafeEqual === null) {
      throw new Error('No crypto available. Inject a CryptoPort explicitly.');
    }
    return _timingSafeEqual(a, b);
  },
};

export default defaultCrypto;
