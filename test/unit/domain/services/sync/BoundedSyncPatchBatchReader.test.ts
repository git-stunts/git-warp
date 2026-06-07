import { describe, expect, it } from 'vitest';

import MemoryBudgetError from '../../../../../src/domain/errors/MemoryBudgetError.ts';
import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import BoundedSyncPatchBatch, {
  type BoundedSyncPatchDescriptor,
} from '../../../../../src/domain/services/sync/BoundedSyncPatchBatch.ts';
import BoundedSyncPatchBatchReader from '../../../../../src/domain/services/sync/BoundedSyncPatchBatchReader.ts';
import type { BoundedSyncPatchSourceRequest } from '../../../../../src/domain/services/sync/BoundedSyncPatchBatchReader.ts';

describe('BoundedSyncPatchBatchReader', () => {
  it('reads sync patch descriptors in deterministic bounded batches', async () => {
    const patches = syncPatchDescriptors();
    const requests: BoundedSyncPatchSourceRequest[] = [];
    const pool = new WarpMemoryPool({
      name: 'sync-patch-batch',
      budget: MemoryBudget.patches(1),
    });
    const reader = new BoundedSyncPatchBatchReader({
      openSource: (request) => {
        requests.push(request);
        return patchSource(patches, request);
      },
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
    expect(requests).toEqual([
      { cursor: null, limit: 3 },
      { cursor: '2', limit: 3 },
      { cursor: '4', limit: 3 },
    ]);
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });

  it('rejects malformed patch descriptors before field access', () => {
    expect(() => new BoundedSyncPatchBatch({
      // @ts-expect-error deliberate malformed descriptor fixture
      patches: [null],
      cursor: null,
    })).toThrow(MemoryBudgetError);
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
  request: BoundedSyncPatchSourceRequest,
): AsyncIterable<BoundedSyncPatchDescriptor> {
  const start = request.cursor === null ? 0 : Number.parseInt(request.cursor, 10);
  const end = start + request.limit;
  for (const patch of patches.slice(start, end)) {
    yield patch;
  }
}
