import { describe, expect, it } from 'vitest';

import { openWarp } from '../../../index.ts';
import { MemoryStorage } from '../../../storage.ts';
import WarpStorage from '../../../src/application/WarpStorage.ts';
import {
  bindWarpStorage,
  resolveWarpStorage,
} from '../../../src/application/WarpStorageRegistry.ts';

class UnsupportedStorage extends WarpStorage {
  constructor() {
    super();
  }
}

describe('WarpStorageRegistry', () => {
  it('freezes supported storage handles and their internal binding', () => {
    const storage = MemoryStorage.create();
    const binding = resolveWarpStorage(storage);

    expect(Object.isFrozen(storage)).toBe(true);
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it('rejects rebinding an existing storage handle', () => {
    const storage = MemoryStorage.create();
    const binding = resolveWarpStorage(storage);

    expect(() => bindWarpStorage(storage, binding)).toThrowError(
      expect.objectContaining({ code: 'E_WARP_STORAGE_BOUND' })
    );
  });

  it('rejects handles that were not created by a supported constructor', async () => {
    await expect(
      openWarp({ storage: new UnsupportedStorage(), writer: 'agent-1' })
    ).rejects.toMatchObject({ code: 'E_WARP_STORAGE_UNBOUND' });
  });
});
