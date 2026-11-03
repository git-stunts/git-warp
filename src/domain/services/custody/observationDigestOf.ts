import type CryptoPort from '../../../ports/CryptoPort.ts';
import ObservationDigest from './ObservationDigest.ts';

const DIGEST_ALGORITHM = 'sha256';

/** The SHA-256 digest of canonical bytes, through the injected crypto capability. */
export async function digestOf(crypto: CryptoPort, bytes: Uint8Array): Promise<ObservationDigest> {
  return new ObservationDigest(await crypto.hash(DIGEST_ALGORITHM, bytes));
}
