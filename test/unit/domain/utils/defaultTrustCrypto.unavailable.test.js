import { afterEach, describe, it, expect, vi } from 'vitest';

async function importWithoutNodeCrypto() {
  vi.resetModules();
  vi.doMock('node:crypto', () => {
    throw new Error('node:crypto unavailable');
  });
  return await import('../../../../src/domain/utils/defaultTrustCrypto.js');
}

afterEach(() => {
  vi.doUnmock('node:crypto');
  vi.resetModules();
});

describe('defaultTrustCrypto without node:crypto', () => {
  it('throws from verifySignature when trust crypto is unavailable', async () => {
    const { default: defaultTrustCrypto } = await importWithoutNodeCrypto();

    expect(() => defaultTrustCrypto.verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64: Buffer.alloc(32, 1).toString('base64'),
      signatureBase64: Buffer.alloc(64, 2).toString('base64'),
      payload: new Uint8Array([1, 2, 3]),
    })).toThrow('No trust crypto available. Inject trust crypto explicitly.');
  });

  it('throws from computeKeyFingerprint when trust crypto is unavailable', async () => {
    const { default: defaultTrustCrypto } = await importWithoutNodeCrypto();

    expect(() => defaultTrustCrypto.computeKeyFingerprint(
      Buffer.alloc(32, 1).toString('base64'),
    )).toThrow('No trust crypto available. Inject trust crypto explicitly.');
  });
});
