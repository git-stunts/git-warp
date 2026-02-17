import CryptoPort from '../../ports/CryptoPort.js';

/**
 * Map of common algorithm names to Web Crypto API algorithm identifiers.
 * @const {Record<string, string>}
 */
const ALGO_MAP = /** @type {Record<string, string>} */ ({
  'sha-1': 'SHA-1',
  'sha1': 'SHA-1',
  'sha-256': 'SHA-256',
  'sha256': 'SHA-256',
  'sha-384': 'SHA-384',
  'sha384': 'SHA-384',
  'sha-512': 'SHA-512',
  'sha512': 'SHA-512',
});

/**
 * Converts a common algorithm name to the Web Crypto API identifier.
 * @param {string} algorithm - Algorithm name (e.g. 'sha256', 'sha-256')
 * @returns {string} Web Crypto API algorithm identifier (e.g. 'SHA-256')
 * @throws {Error} If the algorithm is not supported
 */
function toWebCryptoAlgo(algorithm) {
  const mapped = ALGO_MAP[algorithm.toLowerCase()];
  if (!mapped) {
    throw new Error(`WebCryptoAdapter: unsupported algorithm "${algorithm}"`);
  }
  return mapped;
}

/**
 * Converts input data to a Uint8Array for Web Crypto API consumption.
 * @param {string|Buffer|Uint8Array} data - Input data
 * @returns {Uint8Array} Data as Uint8Array
 * @throws {Error} If data type is not supported
 */
function toUint8Array(data) {
  if (data instanceof Uint8Array) { return data; }
  if (typeof data === 'string') { return new TextEncoder().encode(data); }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    const buf = /** @type {Buffer} */ (data);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new Error('WebCryptoAdapter: data must be string, Buffer, or Uint8Array');
}

/**
 * Converts an ArrayBuffer to a hex string.
 * @param {ArrayBuffer} buf - ArrayBuffer to convert
 * @returns {string} Hex-encoded string
 */
function bufToHex(buf) {
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
 *
 * @extends CryptoPort
 */
export default class WebCryptoAdapter extends CryptoPort {
  /**
   * Creates a new WebCryptoAdapter.
   * @param {Object} [options] - Configuration options
   * @param {SubtleCrypto} [options.subtle] - SubtleCrypto instance (defaults to globalThis.crypto.subtle)
   */
  constructor({ subtle } = {}) {
    super();
    this._subtle = subtle || globalThis.crypto.subtle;
  }

  /**
   * @param {string} algorithm
   * @param {string|Buffer|Uint8Array} data
   * @returns {Promise<string>}
   */
  async hash(algorithm, data) {
    const digest = await this._subtle.digest(
      toWebCryptoAlgo(algorithm),
      /** @type {BufferSource} */ (toUint8Array(data)),
    );
    return bufToHex(digest);
  }

  /**
   * @param {string} algorithm
   * @param {string|Buffer|Uint8Array} key
   * @param {string|Buffer|Uint8Array} data
   * @returns {Promise<Uint8Array>}
   */
  async hmac(algorithm, key, data) {
    const keyBytes = toUint8Array(key);
    const cryptoKey = await this._subtle.importKey(
      'raw',
      /** @type {BufferSource} */ (keyBytes),
      { name: 'HMAC', hash: toWebCryptoAlgo(algorithm) },
      false,
      ['sign'],
    );
    const signature = await this._subtle.sign('HMAC', cryptoKey, /** @type {BufferSource} */ (toUint8Array(data)));
    return new Uint8Array(signature);
  }

  /**
   * Constant-time comparison of two buffers.
   *
   * Uses XOR accumulation with no early exit to prevent timing attacks.
   * This is the standard approach when crypto.timingSafeEqual is unavailable.
   *
   * @param {Buffer|Uint8Array} a - First buffer
   * @param {Buffer|Uint8Array} b - Second buffer
   * @returns {boolean} True if buffers are equal
   */
  timingSafeEqual(a, b) {
    if (a.length !== b.length) { return false; }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }
}
