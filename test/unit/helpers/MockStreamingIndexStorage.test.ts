import { describe, expect, it } from 'vitest';

import MockStreamingIndexStorage from '../../helpers/MockStreamingIndexStorage.ts';

describe('MockStreamingIndexStorage', () => {
  it('serves the canonical empty tree', async () => {
    const storage = new MockStreamingIndexStorage();

    await expect(storage.readTreeOids(storage.emptyTree)).resolves.toEqual({});
    await expect(storage.readTree(storage.emptyTree)).resolves.toEqual({});
  });
});
