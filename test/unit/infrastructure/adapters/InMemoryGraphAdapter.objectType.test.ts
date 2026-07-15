import { describe, expect, it } from 'vitest';

import InMemoryGraphAdapter from '../../../../test/helpers/InMemoryGraphAdapter.ts';

describe('InMemoryGraphAdapter object types', () => {
  it('reports blob, tree, empty-tree, and commit objects', async () => {
    const adapter = new InMemoryGraphAdapter();
    const blobOid = await adapter.writeBlob('content');
    const treeOid = await adapter.writeTree([
      `100644 blob ${blobOid}\tcontent`,
    ]);
    const commitOid = await adapter.commitNodeWithTree({
      treeOid,
      message: 'publish content',
    });

    await expect(adapter.readObjectType(blobOid)).resolves.toBe('blob');
    await expect(adapter.readObjectType(treeOid)).resolves.toBe('tree');
    await expect(adapter.readObjectType(adapter.emptyTree)).resolves.toBe('tree');
    await expect(adapter.readObjectType(commitOid)).resolves.toBe('commit');
  });

  it('rejects an object that is absent from the repository', async () => {
    const adapter = new InMemoryGraphAdapter();

    await expect(adapter.readObjectType('abcd' + '0'.repeat(36)))
      .rejects.toThrow(/Object not found/);
  });
});
