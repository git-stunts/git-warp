/**
 * Default trust-crypto helpers for signed trust record verification.
 *
 * Mirrors the lazy-loading pattern used by defaultCrypto.ts so browser
 * bundles do not eagerly require node:crypto. Callers that enable trust
 * verification in unsupported runtimes must inject explicit helpers.
 *
 * @module domain/utils/defaultTrustCrypto
 */

import TrustError from '../errors/TrustError.ts';
import { base64Decode, base64Encode, concatBytes, hexEncode, hexDecode } from './bytes.ts';

let _createHash: typeof import('node:crypto').createHash | null = null;
let _createPublicKey: typeof import('node:crypto').createPublicKey | null = null;
let _verify: typeof import('node:crypto').verify | null = null;

try {
  const nodeCrypto = await import('node:crypto');
  _createHash = nodeCrypto.createHash;
  _createPublicKey = nodeCrypto.createPublicKey;
  _verify = nodeCrypto.verify;
} catch {
  // Unsupported runtime or bundler stub — caller must inject helpers.
}

const ED25519_PUBLIC_KEY_LENGTH = 32;
const ED25519_SPKI_PREFIX_HEX = '302a300506032b6570032100';

interface VerifySignatureParams {
  readonly algorithm: string;
  readonly publicKeyBase64: string;
  readonly signatureBase64: string;
  readonly payload: Uint8Array;
}

/**
 * Decodes and validates a base64-encoded Ed25519 public key.
 */
function decodePublicKey(publicKeyBase64: string): Uint8Array {
  const raw = base64Decode(publicKeyBase64);
  if (base64Encode(raw) !== publicKeyBase64) {
    throw new TrustError('Malformed base64 in public key', { code: 'E_TRUST_INVALID_KEY' });
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
 * Verifies an Ed25519 signature.
 */
function verifySignature({ algorithm, publicKeyBase64, signatureBase64, payload }: VerifySignatureParams): boolean {
  if (!_createPublicKey || !_verify) {
    throw new TrustError('No trust crypto available. Inject trust crypto explicitly.');
  }
  if (algorithm !== 'ed25519') {
    throw new TrustError(`Unsupported algorithm: ${algorithm}`, { code: 'E_TRUST_UNSUPPORTED_ALGORITHM' });
  }

  const raw = decodePublicKey(publicKeyBase64);
  const derKey = concatBytes(hexDecode(ED25519_SPKI_PREFIX_HEX), raw);
  const pemBody = (base64Encode(derKey).match(/.{1,64}/g) || []).join('\n');
  const keyObject = _createPublicKey(`-----BEGIN PUBLIC KEY-----\n${pemBody}\n-----END PUBLIC KEY-----\n`);
  return _verify(null, payload, keyObject, base64Decode(signatureBase64));
}

/**
 * Computes the canonical trust key fingerprint.
 */
function computeKeyFingerprint(publicKeyBase64: string): string {
  if (!_createHash) {
    throw new TrustError('No trust crypto available. Inject trust crypto explicitly.');
  }
  const raw = decodePublicKey(publicKeyBase64);
  return `ed25519:${hexEncode(_createHash('sha256').update(raw).digest())}`;
}

export default {
  verifySignature,
  computeKeyFingerprint,
};
