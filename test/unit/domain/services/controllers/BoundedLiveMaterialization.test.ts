import { afterEach, describe, expect, it, vi } from 'vitest';

import PatchCollector, {
  type CheckpointData,
  type PatchWithSha,
} from '../../../../../src/domain/capabilities/PatchCollector.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import MaterializationCoordinate from '../../../../../src/domain/materialization/MaterializationCoordinate.ts';
import StateSession from '../../../../../src/domain/orset/session/StateSession.ts';
import TrieGeometry from '../../../../../src/domain/orset/trie/TrieGeometry.ts';
import {
  resolveBoundedLiveMaterialization,
  retainBoundedLiveMaterialization,
} from '../../../../../src/domain/services/controllers/BoundedLiveMaterialization.ts';
import type {
  MaterializeDeps,
} from '../../../../../src/domain/services/controllers/MaterializeController.ts';
import MaterializeController from '../../../../../src/domain/services/controllers/MaterializeController.ts';
import { createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import cborCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import InMemoryMaterializationStore from '../../../../helpers/InMemoryMaterializationStore.ts';
import { InMemoryTrieStore } from '../../../../helpers/trieHelpers.ts';
import type MaterializationWorkspacePort from '../../../../../src/ports/MaterializationWorkspacePort.ts';
import WarpStateCachePort, {
  type WarpStateCoordinate,
  type WarpStateSnapshotRecord,
} from '../../../../../src/ports/WarpStateCachePort.ts';

const coordinate = new MaterializationCoordinate({
  frontier: new Map([['writer', 'tip']]),
  ceiling: null,
});

describe('BoundedLiveMaterialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails closed when a newly retained handle cannot be acquired', async () => {
    const materializations = new InMemoryMaterializationStore();
    vi.spyOn(materializations, 'acquireExact').mockResolvedValue(null);

    await expect(resolveBoundedLiveMaterialization({
      deps: createDeps(materializations),
      coordinate,
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_RESUME',
      message: expect.stringContaining('could not be acquired'),
    });
  });

  it('releases the staging workspace when session opening fails', async () => {
    const materializations = new InMemoryMaterializationStore();
    const failure = new Error('session open failed');

    await expect(retainBoundedLiveMaterialization({
      deps: createDeps(
        materializations,
        vi.fn().mockRejectedValue(failure),
      ),
      coordinate,
    })).rejects.toBe(failure);

    expect(materializations.workspaces[0]?.released).toBe(true);
  });

  it('aborts the session and releases its workspace when liveness replay fails', async () => {
    const materializations = new InMemoryMaterializationStore();
    const failure = new Error('patch replay failed');
    const abort = vi.spyOn(StateSession.prototype, 'abort');
    const deps = createDeps(materializations);
    vi.spyOn(deps.patches, 'loadPatchChain').mockRejectedValue(failure);

    await expect(retainBoundedLiveMaterialization({ deps, coordinate }))
      .rejects.toBe(failure);

    expect(abort).toHaveBeenCalledOnce();
    expect(materializations.workspaces[0]?.released).toBe(true);
  });

  it('aborts the session and preserves a workspace promotion failure', async () => {
    const materializations = new InMemoryMaterializationStore();
    const failure = new Error('workspace promotion failed');
    const openWorkspace = materializations.openWorkspace.bind(materializations);
    vi.spyOn(materializations, 'openWorkspace').mockImplementation(async (requested) => {
      const workspace = await openWorkspace(requested);
      vi.spyOn(workspace, 'promote').mockRejectedValue(failure);
      return workspace;
    });
    const abort = vi.spyOn(StateSession.prototype, 'abort');
    const deps = createDeps(materializations);

    await expect(retainBoundedLiveMaterialization({ deps, coordinate }))
      .rejects.toBe(failure);

    expect(abort).toHaveBeenCalledOnce();
    expect(materializations.workspaces[0]?.released).toBe(true);
  });

  it('releases a partial acquisition before using an exact whole-state snapshot', async () => {
    const materializations = new InMemoryMaterializationStore();
    const deps = createDeps(materializations);
    const bounded = await resolveBoundedLiveMaterialization({ deps, coordinate });
    await bounded?.release();
    deps.getStateCache = () => new ExactSnapshotCache();

    const result = await new MaterializeController(deps).materialize();

    expect(result.state.nodeAlive.contains('snapshot-node')).toBe(true);
    expect(materializations.acquisitions.at(-1)?.released).toBe(true);
  });
});

function createDeps(
  materializations: InMemoryMaterializationStore,
  openStateSession = defaultSessionOpener(),
): MaterializeDeps {
  return {
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    },
    codec: cborCodec,
    crypto: {
      hash: vi.fn().mockResolvedValue('hash'),
      hmac: vi.fn().mockResolvedValue(new Uint8Array([1])),
      timingSafeEqual: vi.fn().mockReturnValue(false),
    },
    persistence: { readRef: vi.fn().mockResolvedValue(null) },
    checkpointStore: new InMemoryCheckpointStore(),
    materializations,
    patches: new SinglePatchCollector(),
    graphCloner: { openReadOnly: vi.fn() },
    graphName: 'test-graph',
    openStateSession,
  };
}

function defaultSessionOpener() {
  const store = new InMemoryTrieStore();
  return async (
    roots: {
      readonly nodeAliveRootOid: string | null;
      readonly edgeAliveRootOid: string | null;
    },
    options: { readonly workspace: MaterializationWorkspacePort },
  ): Promise<StateSession> => await StateSession.open({
    ...roots,
    store,
    codec: cborCodec,
    geometry: TrieGeometry.default16way(),
    maxDirtyPages: 1,
    workspace: options.workspace,
  });
}

class SinglePatchCollector extends PatchCollector {
  readonly #entry: PatchWithSha = {
    patch: new Patch({
      writer: 'writer',
      lamport: 1,
      context: {},
      ops: [new NodeAdd('node', Dot.create('writer', 1))],
      reads: [],
      writes: ['node'],
    }),
    sha: 'tip',
  };

  override discoverWriters(): Promise<string[]> {
    return Promise.resolve(['writer']);
  }

  override loadWriterPatches(_writerId: string): Promise<PatchWithSha[]> {
    return Promise.resolve([this.#entry]);
  }

  override loadCheckpoint(): Promise<CheckpointData | null> {
    return Promise.resolve(null);
  }

  override loadPatchesSince(_checkpoint: CheckpointData): Promise<PatchWithSha[]> {
    return Promise.resolve([]);
  }

  override loadPatchChain(_toSha: string, _fromSha?: string | null): Promise<PatchWithSha[]> {
    return Promise.resolve([this.#entry]);
  }

  override getFrontier(): Promise<Map<string, string>> {
    return Promise.resolve(coordinate.frontier());
  }
}

class ExactSnapshotCache extends WarpStateCachePort {
  override getExact(_coordinate: WarpStateCoordinate): Promise<WarpStateSnapshotRecord> {
    const state = createEmptyState();
    state.nodeAlive.add('snapshot-node', Dot.create('snapshot', 1));
    return Promise.resolve({
      snapshotId: 'snapshot',
      coordinate: { frontier: coordinate.frontier(), ceiling: null },
      retention: 'evictable',
      provenancePosture: 'degraded',
      stateHash: 'snapshot-hash',
      payloadRef: 'snapshot-payload',
      createdAt: '1970-01-01T00:00:00.000Z',
      state,
    });
  }

  override getBestCompatiblePredecessor(): Promise<null> {
    return Promise.resolve(null);
  }

  override put(snapshot: WarpStateSnapshotRecord): Promise<WarpStateSnapshotRecord> {
    return Promise.resolve(snapshot);
  }

  override pin(_snapshotId: string): Promise<WarpStateSnapshotRecord> {
    throw new Error('not used');
  }

  override publishCheckpointHead(): Promise<void> {
    return Promise.resolve();
  }

  override resolveCheckpointHead(): Promise<null> {
    return Promise.resolve(null);
  }

  override pruneEvictable(): Promise<void> {
    return Promise.resolve();
  }
}
