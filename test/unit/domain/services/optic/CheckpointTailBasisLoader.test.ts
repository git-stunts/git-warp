import { describe, expect, it, vi } from 'vitest';

import AssetHandle from '../../../../../src/domain/storage/AssetHandle.ts';
import CheckpointTailBasisLoader from '../../../../../src/domain/services/optic/CheckpointTailBasisLoader.ts';
import type CheckpointTailOpticSource from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';

describe('CheckpointTailBasisLoader', () => {
  it('reuses an immutable captured basis but reloads a live basis', async () => {
    const checkpointSha = 'a'.repeat(40);
    const loadBasis = vi.fn(async () =>
      Object.freeze({
        checkpointSha,
        frontier: new Map([['writer', 'b'.repeat(40)]]),
        indexRoot: null,
        indexShardHandles: Object.freeze({
          'meta_00.cbor': new AssetHandle('asset:meta'),
        }),
        propertyRoot: null,
        schema: 5,
        stateHash: 'state',
      }),
    );
    const readCheckpointSha = vi.fn(async () => checkpointSha);
    const source = {
      _checkpointStore: { loadBasis },
      _indexStore: {
        readShardReferences: vi.fn(),
      },
      _readCheckpointSha: readCheckpointSha,
      graphName: 'captured-basis-cache',
    } as unknown as CheckpointTailOpticSource;
    const captured = new CheckpointTailBasisLoader({
      cache: true,
      source,
    });

    const [first, second] = await Promise.all([captured.load(), captured.load()]);

    expect(second).toBe(first);
    expect(readCheckpointSha).toHaveBeenCalledTimes(1);
    expect(loadBasis).toHaveBeenCalledTimes(1);

    const live = new CheckpointTailBasisLoader({ source });
    await live.load();
    await live.load();

    expect(readCheckpointSha).toHaveBeenCalledTimes(3);
    expect(loadBasis).toHaveBeenCalledTimes(3);
  });
});
