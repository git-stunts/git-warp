import { describe, expect, it, vi } from 'vitest';
import {
  CborIndexPageBatchStager,
} from '../../../../src/infrastructure/adapters/CborIndexPageBatchStager.ts';
import type ArtifactStagingPort from '../../../../src/ports/ArtifactStagingPort.ts';

describe('CborIndexPageBatchStager', () => {
  it('retains 257 ordered shards in bounded 256-page batches', async () => {
    let batchNumber = 0;
    const stagePages = vi.fn(async (sources: readonly Uint8Array[]) => {
      const currentBatch = batchNumber;
      batchNumber += 1;
      return sources.map((_source, index) => (
        `test:batch-${String(currentBatch)}-page-${String(index)}`
      ));
    });
    const stager = new CborIndexPageBatchStager(
      stagingWith(stagePages),
      1024,
    );
    const members: Array<[string, string]> = [];

    for (let index = 0; index < 257; index += 1) {
      await stager.append(
        `shard-${String(index).padStart(3, '0')}.cbor`,
        Uint8Array.of(index % 256),
        members,
      );
    }
    await stager.flush(members);

    expect(stagePages.mock.calls.map(([sources]) => sources.length)).toEqual([256, 1]);
    expect(stagePages).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      { maxBytes: 1024, maxBatchBytes: 32 * 1024 * 1024, maxBatchPages: 256 },
    );
    expect(members).toHaveLength(257);
    expect(members[0]).toEqual(['shard-000.cbor', 'test:batch-0-page-0']);
    expect(members[256]).toEqual(['shard-256.cbor', 'test:batch-1-page-0']);
  });

  it('rejects a batch that omits an ordered handle', async () => {
    const stager = new CborIndexPageBatchStager(
      stagingWith(vi.fn(async () => [])),
      1024,
    );
    await stager.append('shard.cbor', Uint8Array.of(1), []);

    await expect(stager.flush([])).rejects.toMatchObject({
      code: 'E_INDEX_INVALID_STORAGE',
    });
  });
});

function stagingWith(
  stagePages: NonNullable<ArtifactStagingPort['stagePages']>,
): ArtifactStagingPort & Required<Pick<ArtifactStagingPort, 'stagePages'>> {
  return {
    stagePages,
    stagePage: () => Promise.reject(new Error('single-page staging is not expected')),
    stageOrderedBundle: () => Promise.reject(new Error('bundle staging is not expected')),
  };
}
