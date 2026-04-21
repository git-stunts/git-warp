import { describe, it, expect, vi } from 'vitest';
import CheckpointController from '../../../../../src/domain/services/controllers/CheckpointController.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';

const { createCheckpointCommitMock } = vi.hoisted(() => ({
  createCheckpointCommitMock: vi.fn(),
}));

vi.mock('../../../../../src/domain/services/state/checkpointCreate.ts', () => ({
  create: createCheckpointCommitMock,
}));

type Coordinate = {
  frontier: Map<string, string>;
  ceiling: number | null;
};

type SnapshotRecord = {
  snapshotId: string;
  coordinate: Coordinate;
  state: WarpState;
  retention: 'evictable' | 'pinned';
  provenancePosture: 'full' | 'degraded';
};

function snapshotRecord(snapshotId: string, retention: 'evictable' | 'pinned'): SnapshotRecord {
  return {
    snapshotId,
    coordinate: {
      frontier: new Map([['alice', 'sha-alice']]),
      ceiling: null,
    },
    state: WarpState.empty(),
    retention,
    provenancePosture: 'full',
  };
}

function createHost(snapshotCache: {
  getExact: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  pin: ReturnType<typeof vi.fn>;
}) {
  return {
    _graphName: 'test-graph',
    _persistence: {
      readRef: vi.fn().mockResolvedValue('sha-alice'),
      updateRef: vi.fn().mockResolvedValue(undefined),
    },
    _cachedState: WarpState.empty(),
    _stateDirty: false,
    _checkpointing: false,
    _viewService: null,
    _cachedIndexTree: null,
    _provenanceIndex: null,
    _crypto: {},
    _codec: {},
    _commitMessageCodec: {},
    _checkpointStore: null,
    _stateHashService: null,
    _logger: null,
    _stateCache: snapshotCache,
    discoverWriters: vi.fn().mockResolvedValue(['alice']),
    materialize: vi.fn().mockResolvedValue(WarpState.empty()),
  };
}

describe('CheckpointController — unified snapshot cache', () => {
  it('pins an exact existing snapshot instead of creating a second checkpoint artifact', async () => {
    createCheckpointCommitMock.mockResolvedValue('checkpoint-commit-sha');

    const snapshotCache = {
      getExact: vi.fn().mockResolvedValue(snapshotRecord('snapshot-exact', 'evictable')),
      put: vi.fn(),
      pin: vi.fn().mockResolvedValue(snapshotRecord('snapshot-exact', 'pinned')),
    };
    const host = createHost(snapshotCache);
    const controller = new CheckpointController(host);

    await controller.createCheckpoint();

    expect(snapshotCache.getExact).toHaveBeenCalledTimes(1);
    expect(snapshotCache.pin).toHaveBeenCalledWith('snapshot-exact');
    expect(createCheckpointCommitMock).not.toHaveBeenCalled();
  });

  it('materializes once, stores an evictable snapshot, and then pins it when no exact snapshot exists', async () => {
    createCheckpointCommitMock.mockResolvedValue('checkpoint-commit-sha');

    const snapshotCache = {
      getExact: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(snapshotRecord('snapshot-new', 'evictable')),
      pin: vi.fn().mockResolvedValue(snapshotRecord('snapshot-new', 'pinned')),
    };
    const host = createHost(snapshotCache);
    host._cachedState = null;
    host._stateDirty = true;
    const controller = new CheckpointController(host);

    await controller.createCheckpoint();

    expect(host.materialize).toHaveBeenCalledTimes(1);
    expect(snapshotCache.put).toHaveBeenCalledTimes(1);
    expect(snapshotCache.pin).toHaveBeenCalledWith('snapshot-new');
    expect(createCheckpointCommitMock).not.toHaveBeenCalled();
  });
});
