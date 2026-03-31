/**
 * Default trust-crypto helpers for signed trust record verification.
 *
 * Mirrors the lazy-loading pattern used by defaultCrypto.js so browser
 * bundles do not eagerly require node:crypto. Callers that enable trust
 * verification in unsupported runtimes must inject explicit helpers.
 *
 * @module domain/utils/defaultTrustCrypto
 */

import { base64Decode, base64Encode, concatBytes, hexEncode, hexDecode } from './bytes.js';

/** @type {typeof import('node:crypto').createHash|null} */
let _createHash = null;
/** @type {typeof import('node:crypto').createPublicKey|null} */
let _createPublicKey = null;
/** @type {typeof import('node:crypto').verify|null} */
let _verify = null;

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

/**
 * @param {string} publicKeyBase64
 * @returns {Uint8Array}
 */
function decodePublicKey(publicKeyBase64) {
  const raw = base64Decode(publicKeyBase64);
  if (base64Encode(raw) !== publicKeyBase64) {
    throw new Error('Malformed base64 in public key');
  }
  if (raw.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new Error(
      `Ed25519 public key must be ${ED25519_PUBLIC_KEY_LENGTH} bytes, got ${raw.length}`,
    );
  }
  return raw;
}

/**
 * Verifies an Ed25519 signature.
 *
 * @param {{ algorithm: string, publicKeyBase64: string, signatureBase64: string, payload: Uint8Array }} params
 * @returns {boolean}
 */
function verifySignature({ algorithm, publicKeyBase64, signatureBase64, payload }) {
  if (!_createPublicKey || !_verify) {
    throw new Error('No trust crypto available. Inject trust crypto explicitly.');
  }
  if (algorithm !== 'ed25519') {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  const raw = decodePublicKey(publicKeyBase64);
  const derKey = concatBytes(hexDecode(ED25519_SPKI_PREFIX_HEX), raw);
  const pemBody = (base64Encode(derKey).match(/.{1,64}/g) || []).join('\n');
  const keyObject = _createPublicKey(`-----BEGIN PUBLIC KEY-----\n${pemBody}\n-----END PUBLIC KEY-----\n`);
  return _verify(null, payload, keyObject, base64Decode(signatureBase64));
}

/**
 * Computes the canonical trust key fingerprint.
 *
 * @param {string} publicKeyBase64
 * @returns {string}
 */
function computeKeyFingerprint(publicKeyBase64) {
  if (!_createHash) {
    throw new Error('No trust crypto available. Inject trust crypto explicitly.');
  }
  const raw = decodePublicKey(publicKeyBase64);
  return `ed25519:${hexEncode(_createHash('sha256').update(raw).digest())}`;
}

export default {
  verifySignature,
  computeKeyFingerprint,
};
