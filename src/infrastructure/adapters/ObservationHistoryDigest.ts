import ObservationDigest from '../../domain/services/custody/ObservationDigest.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';

const HISTORY_DOMAIN = 'git-warp/observation-history';
const HASH_ALGORITHM = 'sha256';
/** Heads folded into the digest at a time. The batch is part of the digest's definition, so it never changes. */
const DIGEST_BATCH = 63;

/**
 * The digest of the writer heads a basis names, in frontier order, that custody binds into
 * an attempt's support summary and its carrier. It rolls over batches of 63 heads from a
 * fixed seed, so it does not depend on how the heads are retained.
 */
export default class ObservationHistoryDigest {
  readonly #crypto: CryptoPort;

  constructor(crypto: CryptoPort) {
    this.#crypto = crypto;
    Object.freeze(this);
  }

  async of(heads: readonly string[]): Promise<ObservationDigest> {
    let digest = new ObservationDigest(await this.#crypto.hash(HASH_ALGORITHM, `${HISTORY_DOMAIN}\n`));
    for (let index = 0; index < heads.length; index += DIGEST_BATCH) {
      const batch = heads.slice(index, index + DIGEST_BATCH);
      digest = new ObservationDigest(await this.#crypto.hash(HASH_ALGORITHM, [digest.hex, ...batch, ''].join('\n')));
    }
    return digest;
  }
}
