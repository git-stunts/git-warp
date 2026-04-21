import { describe, it, expect, vi } from 'vitest';
import CheckpointController from '../../../../../src/domain/services/controllers/CheckpointController.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import defaultCodec from '../../../../../src/domain/utils/defaultCodec.ts';
import defaultCrypto from '../../../../../src/domain/utils/defaultCrypto.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/domain/services/codec/WarpMessageCodec.ts';
import GCPolicy from '../../../../../src/domain/services/GCPolicy.ts';

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
  stateHash: string;
  payloadRef: string;
  createdAt: string;
};

type SnapshotCacheFixture = {
  getExact: (_coordinate: Coordinate) => Promise<SnapshotRecord | null>;
  getBestCompatiblePredecessor: (_coordinate: Coordinate) => Promise<SnapshotRecord | null>;
  put: (_record: SnapshotRecord) => Promise<SnapshotRecord>;
  pin: (_snapshotId: string) => Promise<SnapshotRecord>;
  publishCheckpointHead: (_graphName: string, _snapshotId: string) => Promise<void>;
  resolveCheckpointHead: (_graphName: string) => Promise<SnapshotRecord | null>;
  pruneEvictable: () => Promise<void>;
};

type HostFixture = {
  _graphName: string;
  _persistence: {
    readRef: (_ref: string) => Promise<string | null>;
    updateRef: (_ref: string, _oid: string) => Promise<void>;
    commitNode: (_options: { message: string; parents: string[] }) => Promise<string>;
    getNodeInfo: (_sha: string) => Promise<{ message: string }>;
  };
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _checkpointing: boolean;
  _viewService: null;
  _cachedIndexTree: null;
  _provenanceIndex: null;
  _crypto: typeof defaultCrypto;
  _codec: typeof defaultCodec;
  _commitMessageCodec: typeof DEFAULT_COMMIT_MESSAGE_CODEC;
  _checkpointStore: null;
  _stateHashService: null;
  _logger: {
    warn: (_message: string, _context?: object) => void;
    info: (_message: string, _context?: object) => void;
    error: (_message: string, _context?: object) => void;
    debug: (_message: string, _context?: object) => void;
    child: (_context: object) => HostFixture['_logger'];
  };
  _gcPolicy: GCPolicy;
  _patchesSinceGC: number;
  _lastGCLamport: number;
  _maxObservedLamport: number;
  _lastFrontier: null;
  _cachedViewHash: null;
  _stateCache: SnapshotCacheFixture;
  discoverWriters: () => Promise<string[]>;
  materialize: () => Promise<WarpState>;
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
    stateHash: `${snapshotId}-hash`,
    payloadRef: `${snapshotId}-payload`,
    createdAt: `${snapshotId}-created-at`,
  };
}

function createHost(snapshotCache: SnapshotCacheFixture): HostFixture {
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn<(_context: object) => HostFixture['_logger']>(),
  };
  logger.child.mockReturnValue(logger);

  return {
    _graphName: 'test-graph',
    _persistence: {
      readRef: vi.fn().mockResolvedValue('sha-alice'),
      updateRef: vi.fn().mockResolvedValue(undefined),
      commitNode: vi.fn().mockResolvedValue('coverage-anchor'),
      getNodeInfo: vi.fn().mockResolvedValue({ message: '' }),
    },
    _cachedState: WarpState.empty(),
    _stateDirty: false,
    _checkpointing: false,
    _viewService: null,
    _cachedIndexTree: null,
    _provenanceIndex: null,
    _crypto: defaultCrypto,
    _codec: defaultCodec,
    _commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    _checkpointStore: null,
    _stateHashService: null,
    _logger: logger,
    _gcPolicy: new GCPolicy({ ...GCPolicy.DEFAULT }),
    _patchesSinceGC: 0,
    _lastGCLamport: 0,
    _maxObservedLamport: 0,
    _lastFrontier: null,
    _cachedViewHash: null,
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
      getBestCompatiblePredecessor: vi.fn(),
      put: vi.fn(),
      pin: vi.fn().mockResolvedValue(snapshotRecord('snapshot-exact', 'pinned')),
      publishCheckpointHead: vi.fn().mockResolvedValue(undefined),
      resolveCheckpointHead: vi.fn().mockResolvedValue(null),
      pruneEvictable: vi.fn(),
    };
    const host = createHost(snapshotCache);
    const controller = new CheckpointController(host);

    await controller.createCheckpoint();

    expect(snapshotCache.getExact).toHaveBeenCalledTimes(1);
    expect(snapshotCache.pin).toHaveBeenCalledWith('snapshot-exact');
    expect(snapshotCache.publishCheckpointHead).toHaveBeenCalledWith('test-graph', 'snapshot-exact');
    expect(createCheckpointCommitMock).not.toHaveBeenCalled();
  });

  it('materializes once, stores an evictable snapshot, and then pins it when no exact snapshot exists', async () => {
    createCheckpointCommitMock.mockResolvedValue('checkpoint-commit-sha');

    const snapshotCache = {
      getExact: vi.fn().mockResolvedValue(null),
      getBestCompatiblePredecessor: vi.fn(),
      put: vi.fn().mockResolvedValue(snapshotRecord('snapshot-new', 'evictable')),
      pin: vi.fn().mockResolvedValue(snapshotRecord('snapshot-new', 'pinned')),
      publishCheckpointHead: vi.fn().mockResolvedValue(undefined),
      resolveCheckpointHead: vi.fn().mockResolvedValue(null),
      pruneEvictable: vi.fn(),
    };
    const host = createHost(snapshotCache);
    host._cachedState = null;
    host._stateDirty = true;
    const controller = new CheckpointController(host);

    await controller.createCheckpoint();

    expect(host.materialize).toHaveBeenCalledTimes(1);
    expect(snapshotCache.put).toHaveBeenCalledTimes(1);
    expect(snapshotCache.pin).toHaveBeenCalledWith('snapshot-new');
    expect(snapshotCache.publishCheckpointHead).toHaveBeenCalledWith('test-graph', 'snapshot-new');
    expect(createCheckpointCommitMock).not.toHaveBeenCalled();
  });

  it('loads the published checkpoint head from the unified state cache before legacy git checkpoint refs', async () => {
    const snapshotCache = {
      getExact: vi.fn().mockResolvedValue(null),
      getBestCompatiblePredecessor: vi.fn(),
      put: vi.fn(),
      pin: vi.fn(),
      publishCheckpointHead: vi.fn().mockResolvedValue(undefined),
      resolveCheckpointHead: vi.fn().mockResolvedValue({
        ...snapshotRecord('snapshot-head', 'pinned'),
        coordinate: {
          frontier: new Map([['alice', 'sha-alice']]),
          ceiling: null,
        },
      }),
      pruneEvictable: vi.fn(),
    };
    const host = createHost(snapshotCache);
    host._persistence.readRef = vi.fn().mockResolvedValue('legacy-checkpoint-sha');
    const controller = new CheckpointController(host);

    const loaded = await controller._loadLatestCheckpoint();

    expect(snapshotCache.resolveCheckpointHead).toHaveBeenCalledWith('test-graph');
    expect(host._persistence.readRef).not.toHaveBeenCalled();
    expect(loaded?.stateHash).toBe('snapshot-head-hash');
    expect(loaded?.frontier).toEqual(new Map([['alice', 'sha-alice']]));
  });
});
