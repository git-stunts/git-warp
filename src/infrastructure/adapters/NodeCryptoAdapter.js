import CryptoPort from '../../ports/CryptoPort.js';
import {
  createHash,
  createHmac,
  timingSafeEqual as nodeTimingSafeEqual,
} from 'node:crypto';

/**
 * Node.js crypto adapter implementing CryptoPort.
 *
 * This is the only file that imports node:crypto.
 *
 * @extends CryptoPort
 */
export default class NodeCryptoAdapter extends CryptoPort {
  /**
   * Computes a hex-encoded digest of the given data using Node's crypto module.
   * @param {string} algorithm
   * @param {string|Uint8Array} data
   * @returns {Promise<string>}
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async ensures sync throws become rejected promises
  async hash(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Computes an HMAC signature for the given data using Node's crypto module.
   * @param {string} algorithm
   * @param {string|Uint8Array} key
   * @param {string|Uint8Array} data
   * @returns {Promise<Uint8Array>}
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async ensures sync throws become rejected promises
  async hmac(algorithm, key, data) {
    const result = createHmac(algorithm, key).update(data).digest();
    return new Uint8Array(result);
  }

  /**
   * Performs constant-time comparison of two byte arrays using Node's native implementation.
   * @param {Uint8Array} a
   * @param {Uint8Array} b
   * @returns {boolean}
   */
  timingSafeEqual(a, b) {
    return nodeTimingSafeEqual(a, b);
  }
}
