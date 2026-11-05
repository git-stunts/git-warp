import type CryptoPort from '../../../ports/CryptoPort.ts';
import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import type ObservationDependency from './ObservationDependency.ts';
import ObservationDigest from './ObservationDigest.ts';

const CLAIM_DOMAIN = 'git-warp/observation-dependencies';
const HASH_ALGORITHM = 'sha256';

/**
 * What an attempt declares it depends on, bound into its preparation before any
 * support is built: how many objects, and a digest of exactly which, in order.
 * Retained support must match this, so a stream that differs from the claim cannot
 * pass. The producer computes both, so whether the claim is complete is its obligation.
 */
export default class ObservationDependencyClaim {
  static readonly NONE = new ObservationDependencyClaim(0, new ObservationDigest('0'.repeat(64)));

  readonly count: number;
  readonly digest: ObservationDigest;

  constructor(count: number, digest: ObservationDigest) {
    if (!Number.isSafeInteger(count) || count < 0 || !(digest instanceof ObservationDigest)) {
      throw new ObservationCustodyError('Dependency claim needs a count and a digest');
    }
    this.count = count;
    this.digest = digest;
    Object.freeze(this);
  }

  /** The claim for `dependencies`, in their order. */
  static async of(
    crypto: CryptoPort,
    dependencies: Iterable<ObservationDependency> | AsyncIterable<ObservationDependency>,
  ): Promise<ObservationDependencyClaim> {
    let claim = ObservationDependencyClaim.NONE;
    for await (const dependency of dependencies) {
      claim = await claim.extended(crypto, dependency);
    }
    return claim;
  }

  /** This claim with one more dependency after it. */
  async extended(crypto: CryptoPort, dependency: ObservationDependency): Promise<ObservationDependencyClaim> {
    const line = [CLAIM_DOMAIN, this.digest.hex, dependency.type, dependency.oid, ''].join('\n');
    return new ObservationDependencyClaim(this.count + 1, new ObservationDigest(await crypto.hash(HASH_ALGORITHM, line)));
  }

  equals(other: ObservationDependencyClaim): boolean {
    return other.count === this.count && other.digest.equals(this.digest);
  }
}
