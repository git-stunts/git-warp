import WarpError from '../../errors/WarpError.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';

export function requireCrypto(
  crypto: CryptoPort | null | undefined,
  context: string,
): CryptoPort {
  if (crypto === null || crypto === undefined) {
    throw new WarpError(`${context} requires an injected CryptoPort`, 'E_CRYPTO_REQUIRED');
  }
  return crypto;
}
