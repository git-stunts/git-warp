import { describe, it, expect } from 'vitest';
import { buildSeekCacheKey } from '../../../../../src/domain/utils/seekCacheKey.ts';
import LegacyWarpStateSnapshotImporter from '../../../../../src/domain/services/state/LegacyWarpStateSnapshotImporter.ts';

describe('LegacyWarpStateSnapshotImporter', () => {
  it('rejects legacy seek-cache import when frontier is unavailable', async () => {
    const key = await buildSeekCacheKey(42, new Map([['writer-1', 'tip-42']]));

    await expect(
      LegacyWarpStateSnapshotImporter.fromSeekCacheEntry({
        key,
        buffer: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow('frontier must be supplied when importing a legacy seek-cache entry');
  });

  it('imports a legacy seek-cache entry as an evictable degraded snapshot when frontier is supplied', async () => {
    const frontier = new Map([['writer-1', 'tip-42']]);
    const key = await buildSeekCacheKey(42, frontier);

    const imported = await LegacyWarpStateSnapshotImporter.fromSeekCacheEntry({
      key,
      frontier,
      buffer: new Uint8Array([1, 2, 3]),
      indexTreeOid: 'index-tree-1',
    });

    expect(imported.retention).toBe('evictable');
    expect(imported.provenancePosture).toBe('degraded');
    expect(imported.coordinate.ceiling).toBe(42);
    expect(imported.coordinate.frontier).toEqual(frontier);
    expect(imported.indexTreeOid).toBe('index-tree-1');
  });

  it('imports a legacy checkpoint record as a pinned full-provenance snapshot', async () => {
    const imported = await LegacyWarpStateSnapshotImporter.fromCheckpointRecord({
      checkpointSha: '0123456789abcdef0123456789abcdef01234567',
      frontier: new Map([['writer-1', 'tip-8']]),
      ceiling: 8,
      stateHash: 'state-hash-8',
      payloadRef: 'tree:checkpoint-8',
      indexTreeOid: 'index-tree-8',
    });

    expect(imported.retention).toBe('pinned');
    expect(imported.provenancePosture).toBe('full');
    expect(imported.coordinate.ceiling).toBe(8);
    expect(imported.stateHash).toBe('state-hash-8');
  });
});
