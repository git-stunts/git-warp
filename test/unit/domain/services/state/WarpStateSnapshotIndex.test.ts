import { describe, it, expect } from 'vitest';
import WarpStateSnapshotIndex from '../../../../../src/domain/services/state/WarpStateSnapshotIndex.ts';

type Coordinate = {
  frontier: Map<string, string>;
  ceiling: number | null;
};

type SnapshotDescriptor = {
  snapshotId: string;
  coordinate: Coordinate;
  retention: 'evictable' | 'pinned';
  provenancePosture: 'full' | 'degraded';
  payloadRef: string;
  stateHash: string;
  createdAt: string;
  lastAccessedAt?: string;
};

function coordinate(
  ceiling: number,
  entries: ReadonlyArray<readonly [string, string]>,
): Coordinate {
  return {
    frontier: new Map(entries),
    ceiling,
  };
}

function snapshotDescriptor(
  snapshotId: string,
  coordinateValue: Coordinate,
  retention: 'evictable' | 'pinned',
  createdAt: string,
): SnapshotDescriptor {
  return {
    snapshotId,
    coordinate: coordinateValue,
    retention,
    provenancePosture: 'full',
    payloadRef: `payload:${snapshotId}`,
    stateHash: `state:${snapshotId}`,
    createdAt,
    lastAccessedAt: createdAt,
  };
}

describe('WarpStateSnapshotIndex', () => {
  it('finds an exact snapshot by full coordinate identity', () => {
    const index = new WarpStateSnapshotIndex({
      isCoordinateCompatible: () => false,
    });

    const exactCoordinate = coordinate(7, [['writer-1', 'tip-7']]);
    const exactSnapshot = snapshotDescriptor(
      'snapshot-exact',
      exactCoordinate,
      'evictable',
      '2026-04-20T10:00:00.000Z',
    );

    index.upsert(exactSnapshot);

    expect(index.findExact(exactCoordinate)).toMatchObject({
      snapshotId: 'snapshot-exact',
    });
  });

  it('chooses the greatest compatible earlier predecessor', () => {
    const compatibility = (candidate: Coordinate, target: Coordinate): boolean =>
      candidate.frontier.get('writer-1') === target.frontier.get('writer-1')
      && candidate.ceiling !== null
      && target.ceiling !== null
      && candidate.ceiling <= target.ceiling;

    const index = new WarpStateSnapshotIndex({
      isCoordinateCompatible: compatibility,
    });

    const target = coordinate(7, [['writer-1', 'shared-tip']]);

    index.upsert(snapshotDescriptor(
      'snapshot-1',
      coordinate(1, [['writer-1', 'shared-tip']]),
      'evictable',
      '2026-04-20T10:00:00.000Z',
    ));
    index.upsert(snapshotDescriptor(
      'snapshot-5',
      coordinate(5, [['writer-1', 'shared-tip']]),
      'evictable',
      '2026-04-20T10:05:00.000Z',
    ));

    expect(index.findBestCompatiblePredecessor(target)).toMatchObject({
      snapshotId: 'snapshot-5',
    });
  });

  it('skips newer and incompatible candidates during predecessor search', () => {
    const compatibility = (candidate: Coordinate, target: Coordinate): boolean =>
      candidate.frontier.get('writer-1') === target.frontier.get('writer-1')
      && candidate.ceiling !== null
      && target.ceiling !== null
      && candidate.ceiling <= target.ceiling;

    const index = new WarpStateSnapshotIndex({
      isCoordinateCompatible: compatibility,
    });

    const target = coordinate(7, [['writer-1', 'shared-tip']]);

    index.upsert(snapshotDescriptor(
      'snapshot-newer',
      coordinate(9, [['writer-1', 'shared-tip']]),
      'evictable',
      '2026-04-20T10:09:00.000Z',
    ));
    index.upsert(snapshotDescriptor(
      'snapshot-incompatible',
      coordinate(6, [['writer-1', 'different-tip']]),
      'evictable',
      '2026-04-20T10:06:00.000Z',
    ));
    index.upsert(snapshotDescriptor(
      'snapshot-compatible',
      coordinate(4, [['writer-1', 'shared-tip']]),
      'evictable',
      '2026-04-20T10:04:00.000Z',
    ));

    expect(index.findBestCompatiblePredecessor(target)).toMatchObject({
      snapshotId: 'snapshot-compatible',
    });
  });

  it('prunes only evictable snapshots and leaves pinned snapshots resident', () => {
    const index = new WarpStateSnapshotIndex({
      isCoordinateCompatible: () => false,
    });

    index.upsert(snapshotDescriptor(
      'snapshot-old-evictable',
      coordinate(1, [['writer-1', 'tip-1']]),
      'evictable',
      '2026-04-20T10:00:00.000Z',
    ));
    index.upsert(snapshotDescriptor(
      'snapshot-pinned',
      coordinate(2, [['writer-1', 'tip-2']]),
      'pinned',
      '2026-04-20T10:01:00.000Z',
    ));
    index.upsert(snapshotDescriptor(
      'snapshot-new-evictable',
      coordinate(3, [['writer-1', 'tip-3']]),
      'evictable',
      '2026-04-20T10:02:00.000Z',
    ));

    index.pruneEvictable({ maxEntries: 1 });

    expect(index.findById('snapshot-pinned')).not.toBeNull();
    expect(index.findById('snapshot-new-evictable')).not.toBeNull();
    expect(index.findById('snapshot-old-evictable')).toBeNull();
  });
});
