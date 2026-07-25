import { describe, expect, it } from 'vitest';

import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import { withFixtureObjectTypeProbe } from '../../helpers/MemoryRuntimeStorageAdapter.ts';

describe('MemoryRuntimeStorageAdapter object type probe', () => {
  it('preserves normalized blob, tree, and commit object kinds', async () => {
    const history = new InMemoryGraphAdapter();
    Object.defineProperty(history, 'readObjectType', {
      configurable: true,
      value: undefined,
    });
    const probed = withFixtureObjectTypeProbe(history);
    const blobOid = await probed.writeBlob('content');
    const treeOid = await probed.writeTree([
      `100644 blob ${blobOid}\tcontent`,
    ]);
    const commitOid = await probed.commitNodeWithTree({
      treeOid,
      message: 'publish content',
    });

    await expect(probed.readObjectType(blobOid)).resolves.toBe('blob');
    await expect(probed.readObjectType(treeOid)).resolves.toBe('tree');
    await expect(probed.readObjectType(probed.emptyTree)).resolves.toBe('tree');
    await expect(probed.readObjectType(commitOid)).resolves.toBe('commit');
  });
});
