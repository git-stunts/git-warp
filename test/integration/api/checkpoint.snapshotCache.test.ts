import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestRepo } from './helpers/setup.ts';

describe('API: snapshot cache unification', () => {
  let repo: Awaited<ReturnType<typeof createTestRepo>> | null = null;

  beforeEach(async () => {
    repo = await createTestRepo('snapshot-cache');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('consults the unified state cache before replaying a coordinate materialization', async () => {
    const stateCache = {
      getExact: vi.fn().mockResolvedValue(null),
      getBestCompatiblePredecessor: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
      pin: vi.fn(),
      publishCheckpointHead: vi.fn(),
      resolveCheckpointHead: vi.fn().mockResolvedValue(null),
      pruneEvictable: vi.fn(),
    };

    const graph = await repo!.openGraph('test', 'writer-1', { stateCache });
    await (await graph.createPatch()).addNode('n1').commit();

    await graph.materialize({ ceiling: 1 });

    expect(stateCache.getExact).toHaveBeenCalled();
  });

  it('stores and pins through the unified state cache when creating a checkpoint', async () => {
    const stateCache = {
      getExact: vi.fn().mockResolvedValue(null),
      getBestCompatiblePredecessor: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue({
        snapshotId: 'snapshot-1',
        retention: 'evictable',
      }),
      pin: vi.fn().mockResolvedValue({
        snapshotId: 'snapshot-1',
        retention: 'pinned',
      }),
      publishCheckpointHead: vi.fn().mockResolvedValue(undefined),
      resolveCheckpointHead: vi.fn().mockResolvedValue(null),
      pruneEvictable: vi.fn(),
    };

    const graph = await repo!.openGraph('test', 'writer-1', { stateCache });
    await (await graph.createPatch()).addNode('n1').commit();
    await graph.materialize();

    await graph.createCheckpoint();

    expect(stateCache.put).toHaveBeenCalled();
    expect(stateCache.pin).toHaveBeenCalledWith('snapshot-1');
    expect(stateCache.publishCheckpointHead).toHaveBeenCalledWith('test', 'snapshot-1');
  });
});
