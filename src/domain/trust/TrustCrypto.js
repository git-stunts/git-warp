/**
 * Re-export from infrastructure adapter.
 *
 * TrustCrypto uses `node:crypto` directly, so the implementation lives in
 * `src/infrastructure/adapters/TrustCryptoAdapter.js`. This re-export
 * preserves existing import paths.
 *
 * @module domain/trust/TrustCrypto
 */

export {
  SUPPORTED_ALGORITHMS,
  verifySignature,
  computeKeyFingerprint,
} from '../../infrastructure/adapters/TrustCryptoAdapter.js';
