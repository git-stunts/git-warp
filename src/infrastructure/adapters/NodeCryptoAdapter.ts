import CryptoPort from '../../ports/CryptoPort.ts';
import {
  createHash,
  createHmac,
  timingSafeEqual as nodeTimingSafeEqual,
} from 'node:crypto';

/**
 * Node.js crypto adapter implementing CryptoPort.
 *
 * This is the only file that imports node:crypto.
 */
export default class NodeCryptoAdapter extends CryptoPort {
  /**
   * Computes a hex-encoded digest of the given data using Node's crypto module.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async ensures sync throws become rejected promises
  async hash(algorithm: string, data: string | Uint8Array): Promise<string> {
    return createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Computes an HMAC signature for the given data using Node's crypto module.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async ensures sync throws become rejected promises
  async hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
    const result = createHmac(algorithm, key).update(data).digest();
    return new Uint8Array(result);
  }

  /**
   * Performs constant-time comparison of two byte arrays using Node's native implementation.
   */
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    return nodeTimingSafeEqual(a, b);
  }
}
