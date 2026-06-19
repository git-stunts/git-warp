import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultHash,
  initCryptoReady,
} from '../../../../src/infrastructure/adapters/inMemoryHashing.ts';

describe('inMemoryHashing', () => {
  afterEach(() => {
    vi.doUnmock('node:crypto');
    vi.resetModules();
  });

  it('treats node crypto probing as an explicit readiness boundary', async () => {
    await expect(initCryptoReady(undefined)).resolves.toBe(true);

    expect(defaultHash(new Uint8Array([1, 2, 3])))
      .toMatch(/^[0-9a-f]{40}$/);
  });

  it('does not probe node crypto when a hash function is injected', async () => {
    const injectedHash = () => '0'.repeat(40);

    await expect(initCryptoReady(injectedHash)).resolves.toBe(true);
  });

  it('reports E_NO_HASH at the first hash boundary when node crypto is unavailable', async () => {
    vi.resetModules();
    vi.doMock('node:crypto', () => {
      throw new Error('node crypto unavailable');
    });
    const { default: InMemoryGraphAdapter } = await import(
      '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts'
    );

    const adapter = new InMemoryGraphAdapter();

    await expect(adapter.writeBlob('payload')).rejects.toMatchObject({
      code: 'E_NO_HASH',
    });
  });
});
