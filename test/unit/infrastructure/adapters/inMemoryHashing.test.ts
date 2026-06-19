import { describe, expect, it } from 'vitest';

import {
  defaultHash,
  initCryptoReady,
} from '../../../../src/infrastructure/adapters/inMemoryHashing.ts';

describe('inMemoryHashing', () => {
  it('treats node crypto probing as an explicit readiness boundary', async () => {
    await expect(initCryptoReady(undefined)).resolves.toBeUndefined();

    expect(defaultHash(new Uint8Array([1, 2, 3])))
      .toMatch(/^[0-9a-f]{40}$/);
  });

  it('does not probe node crypto when a hash function is injected', async () => {
    const injectedHash = () => '0'.repeat(40);

    await expect(initCryptoReady(injectedHash)).resolves.toBeUndefined();
  });
});
