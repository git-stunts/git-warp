/**
 * Default crypto implementation for domain services.
 *
 * Provides SHA hashing, HMAC, and timing-safe comparison using
 * node:crypto directly, avoiding concrete adapter imports from
 * the infrastructure layer. This follows the same pattern as
 * defaultCodec.js and defaultClock.js.
 *
 * In Node/Bun/Deno, node:crypto loads normally. In browsers,
 * the import fails silently and callers must inject crypto via
 * WarpGraph.open({ crypto }).
 *
 * @module domain/utils/defaultCrypto
 */

/** @type {Function|null} */
let _createHash = null;
/** @type {Function|null} */
let _createHmac = null;
/** @type {Function|null} */
let _timingSafeEqual = null;

try {
  const nodeCrypto = await import('node:crypto');
  _createHash = nodeCrypto.createHash;
  _createHmac = nodeCrypto.createHmac;
  _timingSafeEqual = nodeCrypto.timingSafeEqual;
} catch {
  // Browser — caller must inject crypto via WarpGraph.open({ crypto })
}

/** @type {import('../../ports/CryptoPort.js').default} */
const defaultCrypto = {
  // eslint-disable-next-line @typescript-eslint/require-await -- async matches CryptoPort contract
  async hash(algorithm, data) {
    if (!_createHash) {
      throw new Error('No crypto available. Inject a CryptoPort explicitly.');
    }
    return _createHash(algorithm).update(data).digest('hex');
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- async matches CryptoPort contract
  async hmac(algorithm, key, data) {
    if (!_createHmac) {
      throw new Error('No crypto available. Inject a CryptoPort explicitly.');
    }
    const result = _createHmac(algorithm, key).update(data).digest();
    return new Uint8Array(result);
  },
  timingSafeEqual(a, b) {
    if (!_timingSafeEqual) {
      throw new Error('No crypto available. Inject a CryptoPort explicitly.');
    }
    return _timingSafeEqual(a, b);
  },
};

export default defaultCrypto;
