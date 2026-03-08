/**
 * Port for cryptographic operations.
 *
 * Abstracts platform-specific crypto APIs to keep domain services pure.
 * Implementations can use Node.js crypto, Web Crypto API, or test doubles.
 */
export default class CryptoPort {
  /**
   * Computes a hash digest of the given data.
   * @param {string} _algorithm - Hash algorithm (e.g. 'sha1', 'sha256')
   * @param {string|Uint8Array} _data - Data to hash
   * @returns {Promise<string>} Hex-encoded digest
   */
  async hash(_algorithm, _data) {
    throw new Error('CryptoPort.hash() not implemented');
  }

  /**
   * Computes an HMAC of the given data.
   * @param {string} _algorithm - Hash algorithm (e.g. 'sha256')
   * @param {string|Uint8Array} _key - HMAC key
   * @param {string|Uint8Array} _data - Data to authenticate
   * @returns {Promise<Uint8Array>} Raw HMAC digest
   */
  async hmac(_algorithm, _key, _data) {
    throw new Error('CryptoPort.hmac() not implemented');
  }

  /**
   * Constant-time comparison of two buffers.
   * @param {Uint8Array} _a - First buffer
   * @param {Uint8Array} _b - Second buffer
   * @returns {boolean} True if buffers are equal
   */
  timingSafeEqual(_a, _b) {
    throw new Error('CryptoPort.timingSafeEqual() not implemented');
  }
}
