import { describe, it, expect, vi } from 'vitest';
import MaterializeController from '../../../../../src/domain/services/controllers/MaterializeController.ts';
import { createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';

type Coordinate = {
  frontier: Map<string, string>;
  ceiling: number | null;
};

type SnapshotRecord = {
  snapshotId: string;
  coordinate: Coordinate;
  state: ReturnType<typeof createEmptyState>;
  retention: 'evictable' | 'pinned';
  provenancePosture: 'full' | 'degraded';
  stateHash: string;
  payloadRef: string;
  createdAt: string;
};

type PatchRecord = {
  patch: {
    schema: number;
    writer: string;
    lamport: number;
    context: Record<string, never>;
    ops: [];
    reads: string[];
    writes: string[];
  };
  sha: string;
};

function patchRecord(lamport: number, sha: string): PatchRecord {
  return {
    patch: {
      schema: 2,
      writer: 'writer-1',
      lamport,
      context: {},
      ops: [],
      reads: [],
      writes: [],
    },
    sha,
  };
}

function snapshotRecord(
  snapshotId: string,
  coordinate: Coordinate,
  provenancePosture: 'full' | 'degraded',
): SnapshotRecord {
  return {
    snapshotId,
    coordinate,
    state: createEmptyState(),
    retention: 'evictable',
    provenancePosture,
    stateHash: `${snapshotId}-hash`,
    payloadRef: `${snapshotId}-payload`,
    createdAt: `${snapshotId}-created-at`,
  };
}

function createControllerFixtures() {
  const stateCache = {
    getExact: vi.fn<(_coordinate: Coordinate) => Promise<SnapshotRecord | null>>(),
    getBestCompatiblePredecessor: vi.fn<(_coordinate: Coordinate) => Promise<SnapshotRecord | null>>(),
    put: vi.fn(),
    pin: vi.fn(),
    publishCheckpointHead: vi.fn(),
    resolveCheckpointHead: vi.fn(),
    pruneEvictable: vi.fn(),
  };

  const patches = {
    discoverWriters: vi.fn().mockResolvedValue([]),
    loadWriterPatches: vi.fn().mockResolvedValue([]),
    collectForFrontier: vi.fn().mockResolvedValue([]),
    collectForFrontierSinceCoordinate: vi.fn().mockResolvedValue([]),
    loadCheckpoint: vi.fn().mockResolvedValue(null),
    loadPatchesSince: vi.fn().mockResolvedValue([]),
    loadPatchChain: vi.fn().mockResolvedValue([]),
    getFrontier: vi.fn().mockResolvedValue(new Map([['writer-1', 'tip-7']])),
  };

  const deps = {
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    },
    codec: {
      encode: vi.fn().mockReturnValue(new Uint8Array([1])),
      decode: vi.fn().mockReturnValue({}),
    },
    crypto: {
      hash: vi.fn().mockResolvedValue('state-hash-1'),
      hmac: vi.fn().mockResolvedValue(new Uint8Array([1])),
      timingSafeEqual: vi.fn().mockReturnValue(false),
    },
    persistence: {
      readRef: vi.fn().mockResolvedValue(null),
      readTreeOids: vi.fn().mockResolvedValue({}),
      showNode: vi.fn().mockResolvedValue(''),
      readBlob: vi.fn().mockResolvedValue(new Uint8Array([1])),
    },
    getStateCache: () => stateCache,
    patches,
    graphCloner: { openReadOnly: vi.fn() },
    graphName: 'test-graph',
  };

  return {
    controller: new MaterializeController(deps),
    stateCache,
    patches,
  };
}

describe('MaterializeController — unified snapshot cache', () => {
  it('materializes live state with default options when called without arguments', async () => {
    const { controller, patches } = createControllerFixtures();

    await expect(controller.materialize()).resolves.toBeDefined();

    expect(patches.loadCheckpoint).toHaveBeenCalled();
  });

  it('uses an exact snapshot hit for coordinate materialization before replay', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const coordinate: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: 7,
    };

    stateCache.getExact.mockResolvedValue(
      snapshotRecord('snapshot-exact', coordinate, 'full'),
    );

    const result = await controller.materializeCoordinate(coordinate);

    expect(stateCache.getExact).toHaveBeenCalledWith(coordinate);
    expect(patches.collectForFrontier).not.toHaveBeenCalled();
    expect(result.patchCount).toBe(0);
    expect(result.provenanceDegraded).toBe(false);
  });

  it('replays only the suffix after the best compatible predecessor snapshot', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: 7,
    };
    const predecessor = snapshotRecord(
      'snapshot-predecessor',
      {
        frontier: new Map([['writer-1', 'tip-7']]),
        ceiling: 5,
      },
      'full',
    );

    stateCache.getExact.mockResolvedValue(null);
    stateCache.getBestCompatiblePredecessor.mockResolvedValue(predecessor);
    patches.collectForFrontierSinceCoordinate.mockResolvedValue([
      patchRecord(6, 'sha-6'),
    ]);

    const result = await controller.materializeCoordinate(target);

    expect(stateCache.getBestCompatiblePredecessor).toHaveBeenCalledWith(target);
    expect(patches.collectForFrontierSinceCoordinate).toHaveBeenCalledWith(
      target.frontier,
      target.ceiling,
      predecessor.coordinate,
    );
    expect(patches.collectForFrontier).not.toHaveBeenCalled();
    expect(result.patchCount).toBe(1);
  });

  it('refuses a degraded predecessor snapshot for provenance-rich materialization', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: 7,
    };

    stateCache.getExact.mockResolvedValue(null);
    stateCache.getBestCompatiblePredecessor.mockResolvedValue(
      snapshotRecord('snapshot-degraded', {
        frontier: new Map([['writer-1', 'tip-7']]),
        ceiling: 5,
      }, 'degraded'),
    );
    patches.collectForFrontier.mockResolvedValue([
      patchRecord(6, 'sha-6'),
      patchRecord(7, 'sha-7'),
    ]);

    const result = await controller.materializeCoordinate({
      frontier: target.frontier,
      ceiling: target.ceiling,
      receipts: true,
    });

    expect(stateCache.getBestCompatiblePredecessor).toHaveBeenCalledWith(target);
    expect(patches.collectForFrontierSinceCoordinate).not.toHaveBeenCalled();
    expect(patches.collectForFrontier).toHaveBeenCalledWith(
      target.frontier,
      target.ceiling,
    );
    expect(result.provenanceDegraded).toBe(false);
  });
});
