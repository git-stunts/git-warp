import { describe, it, expect, vi } from 'vitest';
import MaterializeController from '../../../../../src/domain/services/controllers/MaterializeController.ts';
import { createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import type { CheckpointData, PatchWithSha } from '../../../../../src/domain/capabilities/PatchCollector.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

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

type PatchRecord = PatchWithSha;

function patchRecord(lamport: number, sha: string): PatchRecord {
  return {
    patch: new Patch({
      writer: 'writer-1',
      lamport,
      context: {},
      ops: [],
      reads: [],
      writes: [],
    }),
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

async function* streamFromPromise<T>(items: Promise<T[]>): AsyncIterable<T> {
  for (const item of await items) {
    yield item;
  }
}

function createControllerFixtures() {
  const stateCache = {
    getExact: vi.fn<(_coordinate: Coordinate) => Promise<SnapshotRecord | null>>().mockResolvedValue(null),
    getBestCompatiblePredecessor: vi.fn<(_coordinate: Coordinate) => Promise<SnapshotRecord | null>>()
      .mockResolvedValue(null),
    put: vi.fn(),
    pin: vi.fn(),
    publishCheckpointHead: vi.fn(),
    resolveCheckpointHead: vi.fn(),
    pruneEvictable: vi.fn(),
  };

  const patches = {
    discoverWriters: vi.fn().mockResolvedValue([]),
    loadWriterPatches: vi.fn<(_writerId: string) => Promise<PatchWithSha[]>>().mockResolvedValue([]),
    collectForFrontier:
      vi.fn<(_frontier: Map<string, string>, _ceiling: number | null) => Promise<PatchWithSha[]>>().mockResolvedValue([]),
    collectForFrontierSinceCoordinate:
      vi.fn<(_frontier: Map<string, string>, _ceiling: number | null, _coordinate: Coordinate) => Promise<PatchWithSha[]>>()
        .mockResolvedValue([]),
    loadCheckpoint: vi.fn().mockResolvedValue(null),
    loadPatchesSince: vi.fn<(_checkpoint: CheckpointData) => Promise<PatchWithSha[]>>().mockResolvedValue([]),
    loadPatchChain: vi.fn<(_toSha: string, _fromSha?: string | null) => Promise<PatchWithSha[]>>().mockResolvedValue([]),
    getFrontier: vi.fn().mockResolvedValue(new Map([['writer-1', 'tip-7']])),
    isAncestor: vi.fn<(_ancestorSha: string, _descendantSha: string) => Promise<boolean>>().mockResolvedValue(true),
    streamWriterPatches: vi.fn((writerId: string) => streamFromPromise(patches.loadWriterPatches(writerId))),
    streamForFrontier: vi.fn((frontier: Map<string, string>, ceiling: number | null) =>
      streamFromPromise(patches.collectForFrontier(frontier, ceiling))),
    streamForFrontierSinceCoordinate: vi.fn((
      frontier: Map<string, string>,
      ceiling: number | null,
      coordinate: Coordinate,
    ) => streamFromPromise(patches.collectForFrontierSinceCoordinate(frontier, ceiling, coordinate))),
    streamPatchesSince: vi.fn((checkpoint: Parameters<typeof patches.loadPatchesSince>[0]) =>
      streamFromPromise(patches.loadPatchesSince(checkpoint))),
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
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
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

  it('uses an exact snapshot hit for live materialization before replay', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const coordinate: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: null,
    };

    stateCache.getExact.mockResolvedValue(
      snapshotRecord('snapshot-live-exact', coordinate, 'full'),
    );

    const result = await controller.materialize();

    expect(patches.getFrontier).toHaveBeenCalled();
    expect(stateCache.getExact).toHaveBeenCalledWith(coordinate);
    expect(stateCache.getBestCompatiblePredecessor).not.toHaveBeenCalled();
    expect(stateCache.put).not.toHaveBeenCalled();
    expect(patches.loadCheckpoint).not.toHaveBeenCalled();
    expect(patches.loadWriterPatches).not.toHaveBeenCalled();
    expect(result.patchCount).toBe(0);
    expect(result.frontier).toEqual(coordinate.frontier);
    expect(result.ceiling).toBe(null);
  });

  it('replays only the live suffix after the best compatible predecessor snapshot', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: null,
    };
    const predecessor = snapshotRecord(
      'snapshot-live-predecessor',
      {
        frontier: new Map([['writer-1', 'tip-5']]),
        ceiling: null,
      },
      'full',
    );

    stateCache.getExact.mockResolvedValue(null);
    stateCache.getBestCompatiblePredecessor.mockResolvedValue(predecessor);
    patches.collectForFrontierSinceCoordinate.mockResolvedValue([
      patchRecord(6, 'sha-6'),
      patchRecord(7, 'sha-7'),
    ]);

    const result = await controller.materialize();

    expect(patches.getFrontier).toHaveBeenCalled();
    expect(stateCache.getBestCompatiblePredecessor).toHaveBeenCalledWith(target);
    expect(patches.collectForFrontierSinceCoordinate).toHaveBeenCalledWith(
      target.frontier,
      target.ceiling,
      predecessor.coordinate,
    );
    expect(patches.loadCheckpoint).not.toHaveBeenCalled();
    expect(patches.loadWriterPatches).not.toHaveBeenCalled();
    expect(result.patchCount).toBe(2);
    expect(result.frontier).toEqual(target.frontier);
  });

  it('publishes a live snapshot with the current frontier after replay', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: null,
    };

    stateCache.getExact.mockResolvedValue(null);
    stateCache.getBestCompatiblePredecessor.mockResolvedValue(null);
    patches.collectForFrontier.mockResolvedValue([
      patchRecord(1, 'sha-1'),
      patchRecord(2, 'sha-2'),
    ]);

    const result = await controller.materialize();

    expect(patches.getFrontier).toHaveBeenCalled();
    expect(patches.collectForFrontier).toHaveBeenCalledWith(target.frontier, null);
    expect(stateCache.put).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotId: 'snapshot:state-hash-1',
        coordinate: target,
        retention: 'evictable',
        provenancePosture: 'full',
        stateHash: 'state-hash-1',
        state: result.state,
      }),
    );
    expect(result.patchCount).toBe(2);
    expect(result.frontier).toEqual(target.frontier);
  });

  it('bypasses live snapshot hits when diff materialization is requested', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: null,
    };

    stateCache.getExact.mockResolvedValue(
      snapshotRecord('snapshot-live-exact', target, 'full'),
    );
    patches.collectForFrontier.mockResolvedValue([
      patchRecord(7, 'sha-7'),
    ]);

    const result = await controller.materialize({ wantDiff: true });

    expect(stateCache.getExact).not.toHaveBeenCalled();
    expect(stateCache.getBestCompatiblePredecessor).not.toHaveBeenCalled();
    expect(patches.collectForFrontier).toHaveBeenCalledWith(
      target.frontier,
      target.ceiling,
    );
    expect(result.diff).toBeDefined();
    expect(result.frontier).toEqual(target.frontier);
  });

  it('bypasses live snapshot hits when receipts are requested', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: null,
    };

    stateCache.getExact.mockResolvedValue(
      snapshotRecord('snapshot-live-exact', target, 'full'),
    );
    patches.collectForFrontier.mockResolvedValue([
      patchRecord(7, 'sha-7'),
    ]);

    const result = await controller.materialize({ receipts: true });

    expect(stateCache.getExact).not.toHaveBeenCalled();
    expect(stateCache.getBestCompatiblePredecessor).not.toHaveBeenCalled();
    expect(patches.collectForFrontier).toHaveBeenCalledWith(
      target.frontier,
      target.ceiling,
    );
    expect(result.receipts).toBeDefined();
    expect(result.frontier).toEqual(target.frontier);
  });

  it('binds checkpoint fallback replay to the live frontier coordinate', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: null,
    };
    const checkpoint: CheckpointData = {
      state: createEmptyState(),
      frontier: new Map([['writer-1', 'tip-5']]),
      stateHash: 'checkpoint-hash',
      schema: 5,
    };

    stateCache.getExact.mockResolvedValue(null);
    stateCache.getBestCompatiblePredecessor.mockResolvedValue(null);
    patches.loadCheckpoint.mockResolvedValue(checkpoint);
    patches.collectForFrontierSinceCoordinate.mockResolvedValue([
      patchRecord(6, 'sha-6'),
      patchRecord(7, 'sha-7'),
    ]);

    const result = await controller.materialize();

    expect(patches.collectForFrontierSinceCoordinate).toHaveBeenCalledWith(
      target.frontier,
      null,
      {
        frontier: checkpoint.frontier,
        ceiling: null,
      },
    );
    expect(patches.loadPatchesSince).not.toHaveBeenCalled();
    expect(stateCache.put).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinate: target,
        state: result.state,
      }),
    );
    expect(result.patchCount).toBe(2);
    expect(result.frontier).toEqual(target.frontier);
  });

  it('falls back to live frontier replay when the checkpoint is ahead of the captured coordinate', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const target: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: null,
    };
    const checkpoint: CheckpointData = {
      state: createEmptyState(),
      frontier: new Map([['writer-1', 'tip-9']]),
      stateHash: 'checkpoint-hash',
      schema: 5,
    };

    stateCache.getExact.mockResolvedValue(null);
    stateCache.getBestCompatiblePredecessor.mockResolvedValue(null);
    patches.loadCheckpoint.mockResolvedValue(checkpoint);
    patches.isAncestor.mockResolvedValue(false);
    patches.collectForFrontier.mockResolvedValue([
      patchRecord(6, 'sha-6'),
      patchRecord(7, 'sha-7'),
    ]);

    const result = await controller.materialize();

    expect(patches.isAncestor).toHaveBeenCalledWith('tip-9', 'tip-7');
    expect(patches.collectForFrontier).toHaveBeenCalledWith(
      target.frontier,
      target.ceiling,
    );
    expect(patches.collectForFrontierSinceCoordinate).not.toHaveBeenCalled();
    expect(stateCache.put).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinate: target,
        state: result.state,
      }),
    );
    expect(result.patchCount).toBe(2);
    expect(result.frontier).toEqual(target.frontier);
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
    expect(stateCache.put).not.toHaveBeenCalled();
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

  it('bypasses coordinate snapshot hits when receipts are requested', async () => {
    const { controller, stateCache, patches } = createControllerFixtures();
    const coordinate: Coordinate = {
      frontier: new Map([['writer-1', 'tip-7']]),
      ceiling: 7,
    };

    stateCache.getExact.mockResolvedValue(
      snapshotRecord('snapshot-exact', coordinate, 'full'),
    );
    patches.collectForFrontier.mockResolvedValue([
      patchRecord(7, 'sha-7'),
    ]);

    const result = await controller.materializeCoordinate({
      frontier: coordinate.frontier,
      ceiling: coordinate.ceiling,
      receipts: true,
    });

    expect(stateCache.getExact).not.toHaveBeenCalled();
    expect(stateCache.getBestCompatiblePredecessor).not.toHaveBeenCalled();
    expect(patches.collectForFrontier).toHaveBeenCalledWith(
      coordinate.frontier,
      coordinate.ceiling,
    );
    expect(result.receipts).toBeDefined();
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

    expect(stateCache.getExact).not.toHaveBeenCalled();
    expect(stateCache.getBestCompatiblePredecessor).not.toHaveBeenCalled();
    expect(patches.collectForFrontierSinceCoordinate).not.toHaveBeenCalled();
    expect(patches.collectForFrontier).toHaveBeenCalledWith(
      target.frontier,
      target.ceiling,
    );
    expect(result.provenanceDegraded).toBe(false);
  });
});
