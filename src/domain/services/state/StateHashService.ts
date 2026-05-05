import { projectState } from './StateSerializer.ts';
import WarpError from '../../errors/WarpError.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type { WarpState } from '../JoinReducer.ts';

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
  private readonly _codec: CodecPort;
  private readonly _crypto: CryptoPort;

  /**
   * Creates a StateHashService.
   */
  constructor({ codec, crypto }: { codec: CodecPort; crypto: CryptoPort }) {
    if (codec === undefined || codec === null) {
      throw new WarpError('StateHashService requires a codec', 'E_MISSING_DEPENDENCY');
    }
    if (crypto === undefined || crypto === null) {
      throw new WarpError('StateHashService requires a crypto adapter', 'E_MISSING_DEPENDENCY');
    }
    this._codec = codec;
    this._crypto = crypto;
  }

  /**
   * Computes the SHA-256 hash of the canonical visible state projection.
   */
  async compute(state: WarpState): Promise<string> {
    const projection = projectState(state);
    const bytes = this._codec.encode(projection);
    return await this._crypto.hash('sha256', bytes);
  }
}
