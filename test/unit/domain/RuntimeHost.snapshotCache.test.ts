import { describe, expect, it } from 'vitest';

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

    await runtime.patch((patch) => {
      patch.addNode('node:one');
    });

    const first = await runtime.materialize();
    expect(runtime._cachedViewHash).not.toBeNull();
    expect(Reflect.get(runtime, '_cachedIndexTree')).not.toBeNull();
    expect(stateCache.publications).toHaveLength(1);

    const second = await runtime.materialize();

    expect(stateCache.exactLookups).toHaveLength(2);
    expect(stateCache.publications).toHaveLength(1);
    expect(second).toEqual(first);
  });
});
