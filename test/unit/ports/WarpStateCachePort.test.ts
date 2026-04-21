import { describe, it, expect } from 'vitest';
import WarpStateCachePort from '../../../src/ports/WarpStateCachePort.ts';

type Coordinate = {
  frontier: Map<string, string>;
  ceiling: number | null;
};

type SnapshotRecord = {
  snapshotId: string;
  coordinate: Coordinate;
  retention: 'evictable' | 'pinned';
  provenancePosture: 'full' | 'degraded';
  stateHash: string;
  payloadRef: string;
  createdAt: string;
};

describe('WarpStateCachePort', () => {
  it('abstract methods are not callable on the base prototype', () => {
    expect(WarpStateCachePort.prototype.getExact).toBeUndefined();
    expect(WarpStateCachePort.prototype.getBestCompatiblePredecessor).toBeUndefined();
    expect(WarpStateCachePort.prototype.put).toBeUndefined();
    expect(WarpStateCachePort.prototype.pin).toBeUndefined();
    expect(WarpStateCachePort.prototype.pruneEvictable).toBeUndefined();
  });

  it('concrete subclass satisfies the unified snapshot contract', async () => {
    class TestCache extends WarpStateCachePort {
      async getExact(_coordinate: Coordinate): Promise<SnapshotRecord | null> {
        return null;
      }

      async getBestCompatiblePredecessor(_coordinate: Coordinate): Promise<SnapshotRecord | null> {
        return null;
      }

      async put(snapshot: SnapshotRecord): Promise<SnapshotRecord> {
        return snapshot;
      }

      async pin(snapshotId: string): Promise<SnapshotRecord> {
        return {
          snapshotId,
          coordinate: {
            frontier: new Map([['writer-1', 'tip-1']]),
            ceiling: 7,
          },
          retention: 'pinned',
          provenancePosture: 'full',
          stateHash: 'state-hash-1',
          payloadRef: 'payload-1',
          createdAt: '2026-04-21T02:00:00.000Z',
        };
      }

      async pruneEvictable(): Promise<void> {
        return;
      }
    }

    const cache = new TestCache();
    const coordinate: Coordinate = {
      frontier: new Map([['writer-1', 'tip-1']]),
      ceiling: 7,
    };

    expect(cache).toBeInstanceOf(WarpStateCachePort);
    expect(await cache.getExact(coordinate)).toBeNull();
    expect(await cache.getBestCompatiblePredecessor(coordinate)).toBeNull();
    expect(
      await cache.put({
        snapshotId: 'snapshot-1',
        coordinate,
        retention: 'evictable',
        provenancePosture: 'degraded',
        stateHash: 'state-hash-1',
        payloadRef: 'payload-1',
        createdAt: '2026-04-21T02:00:00.000Z',
      }),
    ).toMatchObject({ snapshotId: 'snapshot-1' });
    expect(await cache.pin('snapshot-1')).toMatchObject({
      snapshotId: 'snapshot-1',
      retention: 'pinned',
    });
  });
});
