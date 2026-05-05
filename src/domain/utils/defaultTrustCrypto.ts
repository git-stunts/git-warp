/**
 * Default trust-crypto helpers for signed trust record verification.
 *
 * This module lazily loads the infrastructure trust-crypto adapter so core
 * trust services can use a default implementation without importing `node:*`
 * directly.
 *
 * @module domain/utils/defaultTrustCrypto
 */

import TrustError from '../errors/TrustError.ts';

type VerifySignatureParams = {
  readonly algorithm: string;
  readonly publicKeyBase64: string;
  readonly signatureBase64: string;
  readonly payload: Uint8Array;
};

type TrustCryptoAdapterModule = {
  readonly verifySignature: (params: VerifySignatureParams) => boolean;
  readonly computeKeyFingerprint: (publicKeyBase64: string) => string;
};

const UNAVAILABLE_MESSAGE = 'No trust crypto available. Inject trust crypto explicitly.';

let _impl: TrustCryptoAdapterModule | null = null;

try {
  const mod = await import('../../infrastructure/adapters/TrustCryptoAdapter.ts');
  _impl = {
    verifySignature: mod.verifySignature,
    computeKeyFingerprint: mod.computeKeyFingerprint,
  };
} catch {
  // Unsupported runtime or bundler stub — caller must inject helpers.
}

function requireImpl(): TrustCryptoAdapterModule {
  if (_impl === null) {
    throw new TrustError(UNAVAILABLE_MESSAGE);
  }
  return _impl;
}

function verifySignature(params: VerifySignatureParams): boolean {
  return requireImpl().verifySignature(params);
}

function computeKeyFingerprint(publicKeyBase64: string): string {
  return requireImpl().computeKeyFingerprint(publicKeyBase64);
}

export default {
  verifySignature,
  computeKeyFingerprint,
};
