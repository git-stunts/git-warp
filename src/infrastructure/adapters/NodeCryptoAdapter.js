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
  /** @inheritdoc */
  hash(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
  }

  /** @inheritdoc */
  hmac(algorithm, key, data) {
    return createHmac(algorithm, key).update(data).digest();
  }

  /** @inheritdoc */
  timingSafeEqual(a, b) {
    return nodeTimingSafeEqual(a, b);
  }
}
