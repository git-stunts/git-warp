import { describe, expect, it } from 'vitest';

import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import BoundedSyncPatchBatchReader
  from '../../../../../src/domain/services/sync/BoundedSyncPatchBatchReader.ts';
import type { BoundedSyncPatchDescriptor } from '../../../../../src/domain/services/sync/BoundedSyncPatchBatch.ts';

describe('BoundedSyncPatchBatchReader', () => {
  it('reads sync patch descriptors in deterministic bounded batches', async () => {
    const patches = syncPatchDescriptors();
    const pool = new WarpMemoryPool({
      name: 'sync-patch-batch',
      budget: MemoryBudget.patches(1),
    });
    const reader = new BoundedSyncPatchBatchReader({
      openSource: () => patchSource(patches),
      pool,
    });

    const first = await reader.readBatch({ limit: 2 });
    const second = await reader.readBatch({ limit: 2, cursor: first.cursor });
    const third = await reader.readBatch({ limit: 2, cursor: second.cursor });

    expect(first.patches.map((patch) => patch.sha)).toEqual(['0001', '0002']);
    expect(first.cursor).toBe('2');
    expect(second.patches.map((patch) => patch.sha)).toEqual(['0003', '0004']);
    expect(second.cursor).toBe('4');
    expect(third.patches.map((patch) => patch.sha)).toEqual(['0005']);
    expect(third.cursor).toBeNull();
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });
});

function syncPatchDescriptors(): readonly BoundedSyncPatchDescriptor[] {
  return Object.freeze([
    Object.freeze({ writerId: 'writer-a', sha: '0001' }),
    Object.freeze({ writerId: 'writer-a', sha: '0002' }),
    Object.freeze({ writerId: 'writer-b', sha: '0003' }),
    Object.freeze({ writerId: 'writer-b', sha: '0004' }),
    Object.freeze({ writerId: 'writer-c', sha: '0005' }),
  ]);
}

async function* patchSource(
  patches: readonly BoundedSyncPatchDescriptor[],
): AsyncIterable<BoundedSyncPatchDescriptor> {
  for (const patch of patches) {
    yield patch;
  }
}
