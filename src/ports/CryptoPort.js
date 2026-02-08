/**
 * Port for cryptographic operations.
 *
 * Abstracts platform-specific crypto APIs to keep domain services pure.
 * Implementations can use Node.js crypto, Web Crypto API, or test doubles.
 */
export default class CryptoPort {
  /**
   * Computes a hash digest of the given data.
   * @param {string} algorithm - Hash algorithm (e.g. 'sha1', 'sha256')
   * @param {string|Buffer|Uint8Array} data - Data to hash
   * @returns {Promise<string>} Hex-encoded digest
   */
  async hash(_algorithm, _data) {
    throw new Error('CryptoPort.hash() not implemented');
  }

  /**
   * Computes an HMAC of the given data.
   * @param {string} algorithm - Hash algorithm (e.g. 'sha256')
   * @param {string|Buffer|Uint8Array} key - HMAC key
   * @param {string|Buffer|Uint8Array} data - Data to authenticate
   * @returns {Promise<Buffer|Uint8Array>} Raw HMAC digest
   */
  async hmac(_algorithm, _key, _data) {
    throw new Error('CryptoPort.hmac() not implemented');
  }

  /**
   * Constant-time comparison of two buffers.
   * @param {Buffer|Uint8Array} a - First buffer
   * @param {Buffer|Uint8Array} b - Second buffer
   * @returns {boolean} True if buffers are equal
   */
  timingSafeEqual(_a, _b) {
    throw new Error('CryptoPort.timingSafeEqual() not implemented');
  }
}
