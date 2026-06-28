/**
 * Ed25519 cryptographic operations for trust records.
 *
 * Uses `node:crypto` directly — Ed25519 is trust-specific and does not
 * belong on the general CryptoPort hash/hmac interface.
 *
 * This module lives in infrastructure because it depends on `node:crypto`
 * and `Buffer`. Import directly from this file. The former domain re-export
 * (`src/domain/trust/TrustCrypto.js`) was removed in v14.
 *
 * @module infrastructure/adapters/TrustCryptoAdapter
 * @see docs/specs/TRUST_CRYPTO_ALGORITHM.md
 */

import { createHash, createPublicKey, verify } from 'node:crypto';
import TrustError from '../../domain/errors/TrustError.ts';
import TrustCryptoPort, { type TrustSignatureVerification } from '../../ports/TrustCryptoPort.ts';

/** Algorithms supported by this module. */
export const SUPPORTED_ALGORITHMS = new Set(['ed25519']);

const ED25519_PUBLIC_KEY_LENGTH = 32;

/**
 * DER-encoded SPKI prefix for Ed25519 public keys (RFC 8410, Section 4).
 * Prepend to a 32-byte raw key to form a valid SPKI structure for `createPublicKey()`.
 * @see https://www.rfc-editor.org/rfc/rfc8410#section-4
 */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Decodes a base64-encoded Ed25519 public key and validates its length.
 */
function decodePublicKey(base64: string): Buffer {
  let raw: Buffer;
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
 */
export function verifySignature({
  algorithm,
  publicKeyBase64,
  signatureBase64,
  payload,
}: TrustSignatureVerification): boolean {
  if (!SUPPORTED_ALGORITHMS.has(algorithm)) {
    throw new TrustError(`Unsupported algorithm: ${algorithm}`, {
      code: 'E_TRUST_UNSUPPORTED_ALGORITHM',
      context: { algorithm },
    });
  }

  const raw = decodePublicKey(publicKeyBase64);

  const keyObject = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
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
 */
export function computeKeyFingerprint(publicKeyBase64: string): string {
  const raw = decodePublicKey(publicKeyBase64);
  const hash = createHash('sha256').update(raw).digest('hex');
  return `ed25519:${hash}`;
}

export default class TrustCryptoAdapter extends TrustCryptoPort {
  override verifySignature(params: TrustSignatureVerification): boolean {
    return verifySignature(params);
  }

  override computeKeyFingerprint(publicKeyBase64: string): string {
    return computeKeyFingerprint(publicKeyBase64);
  }
}
