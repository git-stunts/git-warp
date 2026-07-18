import { describe, expect, it } from 'vitest';

import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import { InMemoryMaterializationWorkspace } from '../../helpers/InMemoryMaterializationStore.ts';
import MockIndexStorage from '../../helpers/MockIndexStorage.ts';

describe('storage test doubles', () => {
  it('rejects materialization workspace writes after release', async () => {
    const workspace = new InMemoryMaterializationWorkspace(async () => {
      throw new Error('promotion must not run');
    });

    await workspace.release();

    expect(() => workspace.stagePage()).toThrow(/workspace is released/);
    expect(() => workspace.stageOrderedBundle()).toThrow(/workspace is released/);
    expect(() => workspace.checkpoint({ nodeAliveRoot: null, edgeAliveRoot: null })).toThrow(
      /workspace is released/,
    );
  });

  it('does not resolve inherited object properties as shard paths', async () => {
    const storage = new MockIndexStorage();
    const index = await storage.writeShards(WarpStream.of());

    await expect(storage.readShardHandle(index, 'constructor')).resolves.toBeNull();
    await expect(storage.decodeShardAt(index, 'toString')).resolves.toBeNull();
  });
});
