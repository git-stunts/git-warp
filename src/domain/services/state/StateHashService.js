import { projectStateV5 } from './StateSerializerV5.js';
import WarpError from '../../errors/WarpError.ts';

/**
 * Computes canonical state hashes for verification, comparison,
 * and checkpoint creation.
 *
 * The hash is SHA-256 of the CBOR-encoded visible state projection.
 * This service owns the hash computation — it is NOT buried inside
 * any single adapter or write path.
 *
 * Consumers: checkpoint creation, comparison, detached integrity
 * checks, materialization verification.
 */
export default class StateHashService {
  /**
   * Creates a StateHashService.
   *
   * @param {{
   *   codec: import('../../../ports/CodecPort.ts').default,
   *   crypto: import('../../../ports/CryptoPort.ts').default,
   * }} deps
   */
  constructor({ codec, crypto }) {
    if (codec === undefined || codec === null) {
      throw new WarpError('StateHashService requires a codec', 'E_MISSING_DEPENDENCY');
    }
    if (crypto === undefined || crypto === null) {
      throw new WarpError('StateHashService requires a crypto adapter', 'E_MISSING_DEPENDENCY');
    }
    /** @type {import('../../../ports/CodecPort.ts').default} */
    this._codec = codec;
    /** @type {import('../../../ports/CryptoPort.ts').default} */
    this._crypto = crypto;
  }

  /**
   * Computes the SHA-256 hash of the canonical visible state projection.
   *
   * @param {import('../../services/JoinReducer.js').WarpStateV5} state
   * @returns {Promise<string>} Hex-encoded SHA-256 hash
   */
  async compute(state) {
    const projection = projectStateV5(state);
    const bytes = this._codec.encode(projection);
    return await this._crypto.hash('sha256', bytes);
  }
}
