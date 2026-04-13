import CryptoPort from '../../ports/CryptoPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Map of common algorithm names to Web Crypto API algorithm identifiers.
 */
const ALGO_MAP: Record<string, string> = {
  'sha-1': 'SHA-1',
  'sha1': 'SHA-1',
  'sha-256': 'SHA-256',
  'sha256': 'SHA-256',
  'sha-384': 'SHA-384',
  'sha384': 'SHA-384',
  'sha-512': 'SHA-512',
  'sha512': 'SHA-512',
};

/**
 * Converts a common algorithm name to the Web Crypto API identifier.
 */
function toWebCryptoAlgo(algorithm: string): string {
  const mapped = ALGO_MAP[algorithm.toLowerCase()];
  if (mapped === undefined || mapped === '') {
    throw new WarpError(`WebCryptoAdapter: unsupported algorithm "${algorithm}"`, 'E_UNSUPPORTED_ALGORITHM');
  }
  return mapped;
}

/**
 * Converts input data to a Uint8Array for Web Crypto API consumption.
 */
function toUint8Array(data: string | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) { return data; }
  if (typeof data === 'string') { return new TextEncoder().encode(data); }
  throw new WarpError('WebCryptoAdapter: data must be string or Uint8Array', 'E_INVALID_DATA');
}

/**
 * Converts an ArrayBuffer to a hex string.
 */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Web Crypto API adapter implementing CryptoPort.
 *
 * Uses the standard Web Crypto API (globalThis.crypto.subtle) which is
 * available in browsers, Deno, Bun, and Node.js 22+.
 *
 * All hash and HMAC operations are async because the Web Crypto API
 * is inherently promise-based.
 */
export default class WebCryptoAdapter extends CryptoPort {
  private readonly _subtle: SubtleCrypto;

  constructor(options?: { subtle?: SubtleCrypto }) {
    const { subtle } = options ?? {};
    super();
    this._subtle = subtle ?? globalThis.crypto.subtle;
  }

  /**
   * Computes a hex-encoded digest of the given data using the specified hash algorithm.
   */
  async hash(algorithm: string, data: string | Uint8Array): Promise<string> {
    const digest = await this._subtle.digest(
      toWebCryptoAlgo(algorithm),
      toUint8Array(data) as BufferSource,
    );
    return bufToHex(digest);
  }

  /**
   * Computes an HMAC signature for the given data using the specified algorithm and key.
   */
  async hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
    const keyBytes = toUint8Array(key);
    const cryptoKey = await this._subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'HMAC', hash: toWebCryptoAlgo(algorithm) },
      false,
      ['sign'],
    );
    const signature = await this._subtle.sign('HMAC', cryptoKey, toUint8Array(data) as BufferSource);
    return new Uint8Array(signature);
  }

  /**
   * Constant-time comparison of two buffers.
   *
   * Uses XOR accumulation with no early exit to prevent timing attacks.
   * This is the standard approach when crypto.timingSafeEqual is unavailable.
   */
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) { return false; }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= (a[i] as number) ^ (b[i] as number);
    }
    return result === 0;
  }
}
