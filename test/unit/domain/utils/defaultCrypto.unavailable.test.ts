import { afterEach, describe, it, expect, vi } from 'vitest';

async function importWithoutNodeCrypto() {
  vi.resetModules();
  vi.doMock('node:crypto', () => {
    throw new Error('node:crypto unavailable');
  });
  return await import('../../../../src/domain/utils/defaultCrypto.ts');
}

afterEach(() => {
  vi.doUnmock('node:crypto');
  vi.resetModules();
});

describe('defaultCrypto without node:crypto', () => {
  it('throws from hash when no crypto implementation is available', async () => {
    const { default: defaultCrypto } = await importWithoutNodeCrypto();

    await expect(defaultCrypto.hash('sha256', 'hello')).rejects.toThrow(
      'No crypto available. Inject a CryptoPort explicitly.',
    );
  });

  it('throws from hmac when no crypto implementation is available', async () => {
    const { default: defaultCrypto } = await importWithoutNodeCrypto();

    await expect(defaultCrypto.hmac('sha256', 'key', 'hello')).rejects.toThrow(
      'No crypto available. Inject a CryptoPort explicitly.',
    );
  });

  it('throws from timingSafeEqual when no crypto implementation is available', async () => {
    const { default: defaultCrypto } = await importWithoutNodeCrypto();

    expect(() => defaultCrypto.timingSafeEqual(
      new Uint8Array([1]),
      new Uint8Array([1]),
    )).toThrow('No crypto available. Inject a CryptoPort explicitly.');
  });
});
