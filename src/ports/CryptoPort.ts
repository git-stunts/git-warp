/**
 * Port for cryptographic operations.
 *
 * Abstracts platform-specific crypto APIs to keep domain services pure.
 * Implementations can use Node.js crypto, Web Crypto API, or test doubles.
 */

/** Port for cryptographic operations. */
export default abstract class CryptoPort {
  /** Computes a hash digest of the given data. */
  abstract hash(_algorithm: string, _data: string | Uint8Array): Promise<string>;

  /** Computes an HMAC of the given data. */
  abstract hmac(
    _algorithm: string,
    _key: string | Uint8Array,
    _data: string | Uint8Array,
  ): Promise<Uint8Array>;

  /** Constant-time comparison of two buffers. */
  abstract timingSafeEqual(_a: Uint8Array, _b: Uint8Array): boolean;
}
