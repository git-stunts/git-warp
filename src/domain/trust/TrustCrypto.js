/**
 * Ed25519 cryptographic operations for trust records.
 *
 * Uses `node:crypto` directly — Ed25519 is trust-specific and does not
 * belong on the general CryptoPort hash/hmac interface.
 *
 * @module domain/trust/TrustCrypto
 * @see docs/specs/TRUST_V1_CRYPTO.md
 */

import { createHash, createPublicKey, verify } from 'node:crypto';
import TrustError from '../errors/TrustError.js';

/** Algorithms supported by this module. */
export const SUPPORTED_ALGORITHMS = new Set(['ed25519']);

const ED25519_PUBLIC_KEY_LENGTH = 32;

/**
 * Decodes a base64-encoded Ed25519 public key and validates its length.
 *
 * @param {string} base64 - Base64-encoded raw public key bytes
 * @returns {Buffer} 32-byte raw key
 * @throws {TrustError} E_TRUST_INVALID_KEY if base64 is malformed or wrong length
 */
function decodePublicKey(base64) {
  /** @type {Buffer} */
  let raw;
  try {
    raw = Buffer.from(base64, 'base64');
  } catch {
    throw new TrustError('Malformed base64 in public key', {
      code: 'E_TRUST_INVALID_KEY',
    });
  }

  // Buffer.from with 'base64' never throws on bad input — it silently
  // produces an empty or truncated buffer. Validate that the round-trip
  // matches to detect garbage input.
  if (raw.toString('base64') !== base64) {
    throw new TrustError('Malformed base64 in public key', {
      code: 'E_TRUST_INVALID_KEY',
    });
  }

  if (raw.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new TrustError(
      `Ed25519 public key must be ${ED25519_PUBLIC_KEY_LENGTH} bytes, got ${raw.length}`,
      { code: 'E_TRUST_INVALID_KEY' },
    );
  }

  return raw;
}

/**
 * Verifies an Ed25519 signature against a payload.
 *
 * @param {Object} params
 * @param {string} params.algorithm - Must be 'ed25519'
 * @param {string} params.publicKeyBase64 - Base64-encoded 32-byte public key
 * @param {string} params.signatureBase64 - Base64-encoded signature
 * @param {Buffer} params.payload - Bytes to verify
 * @returns {boolean} true if signature is valid
 * @throws {TrustError} E_TRUST_UNSUPPORTED_ALGORITHM for non-ed25519
 * @throws {TrustError} E_TRUST_INVALID_KEY for malformed public key
 */
export function verifySignature({
  algorithm,
  publicKeyBase64,
  signatureBase64,
  payload,
}) {
  if (!SUPPORTED_ALGORITHMS.has(algorithm)) {
    throw new TrustError(`Unsupported algorithm: ${algorithm}`, {
      code: 'E_TRUST_UNSUPPORTED_ALGORITHM',
      context: { algorithm },
    });
  }

  const raw = decodePublicKey(publicKeyBase64);

  const keyObject = createPublicKey({
    key: Buffer.concat([
      // DER prefix for Ed25519 public key (RFC 8410)
      Buffer.from('302a300506032b6570032100', 'hex'),
      raw,
    ]),
    format: 'der',
    type: 'spki',
  });

  const sig = Buffer.from(signatureBase64, 'base64');

  return verify(null, payload, keyObject, sig);
}

/**
 * Computes the key fingerprint for an Ed25519 public key.
 *
 * Format: `"ed25519:" + sha256_hex(rawBytes)`
 *
 * @param {string} publicKeyBase64 - Base64-encoded 32-byte public key
 * @returns {string} Fingerprint string, e.g. "ed25519:abcd1234..."
 * @throws {TrustError} E_TRUST_INVALID_KEY for malformed key
 */
export function computeKeyFingerprint(publicKeyBase64) {
  const raw = decodePublicKey(publicKeyBase64);
  const hash = createHash('sha256').update(raw).digest('hex');
  return `ed25519:${hash}`;
}
