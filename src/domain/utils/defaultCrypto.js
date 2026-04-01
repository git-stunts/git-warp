/**
 * Default crypto implementation for domain services.
 *
 * Provides SHA hashing, HMAC, and timing-safe comparison using
 * node:crypto directly, avoiding concrete adapter imports from
 * the infrastructure layer. This follows the same pattern as
 * defaultCodec.js and defaultClock.js.
 *
 * In Node/Bun/Deno, node:crypto loads normally. When the import
 * fails (e.g., Vite stubs `node:crypto` in browser bundles),
 * callers must inject a CryptoPort explicitly.
 *
 * @module domain/utils/defaultCrypto
 */

/**
 * @typedef {import('node:crypto').Hash} Hash
 * @typedef {import('node:crypto').Hmac} Hmac
 */

/** @type {((algorithm: string) => Hash)|null} */
let _createHash = null;
/** @type {((algorithm: string, key: Uint8Array) => Hmac)|null} */
let _createHmac = null;
/** @type {((a: Uint8Array, b: Uint8Array) => boolean)|null} */
let _timingSafeEqual = null;

try {
  const nodeCrypto = await import('node:crypto');
  _createHash = /** @type {(algorithm: string) => Hash} */ (nodeCrypto.createHash);
  _createHmac = /** @type {(algorithm: string, key: Uint8Array) => Hmac} */ (nodeCrypto.createHmac);
  _timingSafeEqual = /** @type {(a: Uint8Array, b: Uint8Array) => boolean} */ (nodeCrypto.timingSafeEqual);
} catch {
  // Import failed (bundler stub, unsupported runtime, etc.) —
  // caller must inject a CryptoPort explicitly.
}

/**
 * Computes a hex-encoded hash of the given data.
 *
 * @param {string} algorithm - Hash algorithm (e.g. 'sha256')
 * @param {Uint8Array|string} data - Data to hash
 * @returns {string} Hex-encoded hash digest
 */
function hashSync(algorithm, data) {
  if (_createHash === null) {
    throw new Error('No crypto available. Inject a CryptoPort explicitly.');
  }
  return _createHash(algorithm).update(data).digest('hex');
}

/**
 * Computes an HMAC and returns the raw bytes.
 *
 * @param {string} algorithm - HMAC algorithm (e.g. 'sha256')
 * @param {Uint8Array} key - HMAC key
 * @param {Uint8Array} data - Data to authenticate
 * @returns {Uint8Array} Raw HMAC bytes
 */
function hmacSync(algorithm, key, data) {
  if (_createHmac === null) {
    throw new Error('No crypto available. Inject a CryptoPort explicitly.');
  }
  const result = _createHmac(algorithm, key).update(data).digest();
  return new Uint8Array(result);
}

/** @type {import('../../ports/CryptoPort.js').default} */
const defaultCrypto = {
  // eslint-disable-next-line @typescript-eslint/require-await -- async matches CryptoPort contract
  async hash(algorithm, data) {
    return hashSync(algorithm, data);
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- async matches CryptoPort contract
  async hmac(algorithm, key, data) {
    return hmacSync(algorithm, key, data);
  },
  /**
   * Compares two byte arrays in constant time.
   *
   * @param {Uint8Array} a
   * @param {Uint8Array} b
   * @returns {boolean}
   */
  timingSafeEqual(a, b) {
    if (_timingSafeEqual === null) {
      throw new Error('No crypto available. Inject a CryptoPort explicitly.');
    }
    return _timingSafeEqual(a, b);
  },
};

export default defaultCrypto;
