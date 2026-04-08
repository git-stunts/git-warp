import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for trust operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_TRUST_UNSUPPORTED_ALGORITHM` | Algorithm is not `ed25519` |
 * | `E_TRUST_INVALID_KEY` | Public key is malformed (wrong length or bad base64) |
 * | `E_TRUST_CAS_CONFLICT` | Concurrent append advanced the trust chain; caller must rebuild + re-sign |
 * | `E_TRUST_CAS_EXHAUSTED` | CAS retry budget exhausted (transient failures) |
 * | `TRUST_ERROR` | Generic/default trust error |
 */
export default class TrustError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'TRUST_ERROR', options);
  }
}
