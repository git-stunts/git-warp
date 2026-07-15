import { describe, expect, it, vi } from 'vitest';

import { openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import WarpStateCachePort, {
  type WarpStateCoordinate,
  type WarpStateSnapshotRecord,
} from '../../../src/ports/WarpStateCachePort.ts';

function coordinatesEqual(
  left: WarpStateCoordinate,
  right: WarpStateCoordinate,
): boolean {
  if (left.ceiling !== right.ceiling || left.frontier.size !== right.frontier.size) {
    return false;
  }
  for (const [writerId, objectId] of right.frontier) {
    if (left.frontier.get(writerId) !== objectId) {
      return false;
    }
  }
  return true;
}

class RecordingStateCache extends WarpStateCachePort {
  readonly exactLookups: WarpStateCoordinate[] = [];
  readonly publications: WarpStateSnapshotRecord[] = [];

  getExact(coordinate: WarpStateCoordinate): Promise<WarpStateSnapshotRecord | null> {
    this.exactLookups.push(coordinate);
    return Promise.resolve(
      this.publications.find((snapshot) => coordinatesEqual(snapshot.coordinate, coordinate)) ?? null,
    );
  }

  getBestCompatiblePredecessor(
    _coordinate: WarpStateCoordinate,
  ): Promise<WarpStateSnapshotRecord | null> {
    return Promise.resolve(null);
  }

  put(snapshot: WarpStateSnapshotRecord): Promise<WarpStateSnapshotRecord> {
    this.publications.push(snapshot);
    return Promise.resolve(snapshot);
  }

  pin(_snapshotId: string): Promise<WarpStateSnapshotRecord> {
    return Promise.reject(new Error('unused'));
  }

  publishCheckpointHead(_graphName: string, _snapshotId: string): Promise<void> {
    return Promise.resolve();
  }

  resolveCheckpointHead(_graphName: string): Promise<WarpStateSnapshotRecord | null> {
    return Promise.resolve(null);
  }

  pruneEvictable(): Promise<void> {
    return Promise.resolve();
  }
}

describe('RuntimeHost snapshot cache', () => {
  it('uses the exact retained snapshot on an unchanged second materialization', async () => {
    const persistence = new InMemoryGraphAdapter();
    const stateCache = new RecordingStateCache();
    const runtime = await openMemoryRuntimeHostProduct({
      persistence,
      graphName: 'runtime-snapshot-warm-hit',
      writerId: 'writer-1',
      stateCache,
    });

    const patchId = await runtime.patch((patch) => {
      patch.addNode('node:one');
    });
    const buildView = vi.spyOn(runtime._viewService, 'build');
    const applyViewDiff = vi.spyOn(runtime._viewService, 'applyDiff');

    const first = await runtime.materialize();
    const viewBuildsAfterFirstRead = buildView.mock.calls.length;
    const viewDiffsAfterFirstRead = applyViewDiff.mock.calls.length;
    expect(runtime._cachedViewHash).not.toBeNull();
    expect(Reflect.get(runtime, '_cachedIndexTree')).not.toBeNull();
    expect(runtime.provenanceIndex?.patchesFor('node:one')).toEqual([patchId]);
    expect(stateCache.publications).toHaveLength(1);

    const second = await runtime.materialize();

    expect(stateCache.exactLookups).toHaveLength(2);
    expect(stateCache.publications).toHaveLength(1);
    expect(runtime.provenanceIndex?.patchesFor('node:one')).toEqual([patchId]);
    expect(Reflect.get(runtime, '_provenanceDegraded')).toBe(false);
    expect(buildView).toHaveBeenCalledTimes(viewBuildsAfterFirstRead);
    expect(applyViewDiff).toHaveBeenCalledTimes(viewDiffsAfterFirstRead);
    expect(second).toEqual(first);
  });

  it('advances the cached causal basis after eager patch application', async () => {
    const persistence = new InMemoryGraphAdapter();
    const stateCache = new RecordingStateCache();
    const runtime = await openMemoryRuntimeHostProduct({
      persistence,
      graphName: 'runtime-snapshot-basis',
      writerId: 'writer-1',
      stateCache,
    });

    await runtime.patch((patch) => {
      patch.addNode('node:one');
    });
    await runtime.materialize();

    const patchId = await runtime.patch((patch) => {
      patch.addNode('node:two');
    });

    expect(Reflect.get(runtime, '_cachedFrontier')).toEqual(new Map([['writer-1', patchId]]));
    expect(Reflect.get(runtime, '_cachedCeiling')).toBe(null);
  });
});
