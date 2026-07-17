import { describe, expect, it, vi } from 'vitest';

import PatchCollector, {
  type CheckpointData,
  type PatchWithSha,
} from '../../../../../src/domain/capabilities/PatchCollector.ts';
import MaterializationCoordinate from '../../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot, {
  type MaterializationRootStatus,
} from '../../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../../src/domain/materialization/MaterializationRoots.ts';
import MaterializeController, {
  type MaterializeDeps,
} from '../../../../../src/domain/services/controllers/MaterializeController.ts';
import BundleHandle from '../../../../../src/domain/storage/BundleHandle.ts';
import cborCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import InMemoryMaterializationStore, {
  InMemoryMaterializationAcquisition,
} from '../../../../helpers/InMemoryMaterializationStore.ts';

const FRONTIER = new Map([['writer-1', 'tip-1']]);

class RetainedOnlyPatchCollector extends PatchCollector {
  frontier = new Map(FRONTIER);

  override discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  override loadWriterPatches(_writerId: string): Promise<PatchWithSha[]> {
    return Promise.resolve([]);
  }

  override loadCheckpoint(): Promise<CheckpointData | null> {
    return Promise.resolve(null);
  }

  override loadPatchesSince(_checkpoint: CheckpointData): Promise<PatchWithSha[]> {
    return Promise.resolve([]);
  }

  override loadPatchChain(_toSha: string, _fromSha?: string | null): Promise<PatchWithSha[]> {
    return Promise.resolve([]);
  }

  override getFrontier(): Promise<Map<string, string>> {
    return Promise.resolve(new Map(this.frontier));
  }
}

describe('MaterializeController live node reads', () => {
  it.each([true, false])(
    'reads retained node presence %s without projecting whole state',
    async (presence) => {
      const fixture = await createFixture({ presence });

      await expect(fixture.controller.readLiveNodePresence('node:retained')).resolves.toBe(
        presence
      );

      expect(fixture.materializationRead.hasNode).toHaveBeenCalledWith(
        fixture.nodeRoot,
        'node:retained'
      );
      expect(fixture.materializations.exactLookups).toHaveLength(1);
      expect(fixture.materializations.acquisitions).toHaveLength(1);
      expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
      expect(fixture.materializations.acquisitions[0]?.released).toBe(true);
      expect(fixture.deps.crypto.hash).not.toHaveBeenCalled();
      expect(fixture.deps.persistence.readRef).not.toHaveBeenCalled();
    }
  );

  it('returns false for an empty live frontier without opening retained storage', async () => {
    const fixture = await createFixture({ frontier: new Map(), retain: false });

    await expect(fixture.controller.readLiveNodePresence('node:missing')).resolves.toBe(false);

    expect(fixture.materializationRead.hasNode).not.toHaveBeenCalled();
    expect(fixture.materializations.exactLookups).toHaveLength(0);
  });

  it('returns false from an empty retained node root without invoking the trie reader', async () => {
    const fixture = await createFixture({ rootStatus: 'empty' });

    await expect(fixture.controller.readLiveNodePresence('node:missing')).resolves.toBe(false);

    expect(fixture.materializationRead.hasNode).not.toHaveBeenCalled();
    expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
  });

  it('releases retained roots when the bounded node read fails', async () => {
    const readFailure = new Error('node read failed');
    const fixture = await createFixture({ readFailure });

    await expect(fixture.controller.readLiveNodePresence('node:retained')).rejects.toBe(
      readFailure
    );

    expect(fixture.materializations.acquisitions).toHaveLength(1);
    expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
    expect(fixture.materializations.acquisitions[0]?.released).toBe(true);
  });

  it('preserves a node read failure when acquisition cleanup also fails', async () => {
    const readFailure = new Error('node read failed');
    const releaseFailure = new Error('acquisition release failed');
    const fixture = await createFixture({ readFailure });
    const retained = await requireRetained(fixture.materializations);
    const acquisition = new InMemoryMaterializationAcquisition(retained);
    const release = vi.spyOn(acquisition, 'release').mockRejectedValue(releaseFailure);
    vi.spyOn(fixture.materializations, 'acquireExact').mockResolvedValue(acquisition);

    await expect(fixture.controller.readLiveNodePresence('node:retained')).rejects.toBe(
      readFailure
    );

    expect(release).toHaveBeenCalledOnce();
    expect(fixture.deps.logger.warn).toHaveBeenCalledOnce();
  });

  it('surfaces a successful read release failure without retrying it', async () => {
    const fixture = await createFixture({ presence: true });
    const retained = await requireRetained(fixture.materializations);
    const acquisition = new InMemoryMaterializationAcquisition(retained);
    const releaseFailure = new Error('acquisition release failed');
    const release = vi.spyOn(acquisition, 'release').mockRejectedValue(releaseFailure);
    vi.spyOn(fixture.materializations, 'acquireExact').mockResolvedValue(acquisition);

    await expect(fixture.controller.readLiveNodePresence('node:retained')).rejects.toBe(
      releaseFailure
    );

    expect(release).toHaveBeenCalledOnce();
  });

  it('falls back when bounded materialization reads are not configured', async () => {
    const fixture = await createFixture({ materializationRead: false });

    await expect(fixture.controller.readLiveNodePresence('node:retained')).resolves.toBeNull();

    expect(fixture.materializations.exactLookups).toHaveLength(0);
  });

  it('falls back and releases when the retained node root is unavailable', async () => {
    const fixture = await createFixture({ rootStatus: 'unavailable' });

    await expect(fixture.controller.readLiveNodePresence('node:retained')).resolves.toBeNull();

    expect(fixture.materializationRead.hasNode).not.toHaveBeenCalled();
    expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
    expect(fixture.materializations.acquisitions[0]?.released).toBe(true);
  });
});

async function createFixture(
  options: {
    readonly frontier?: Map<string, string>;
    readonly materializationRead?: boolean;
    readonly presence?: boolean;
    readonly readFailure?: Error;
    readonly retain?: boolean;
    readonly rootStatus?: MaterializationRootStatus;
  } = {}
) {
  const patches = new RetainedOnlyPatchCollector();
  patches.frontier = new Map(options.frontier ?? FRONTIER);
  const materializations = new InMemoryMaterializationStore();
  const nodeRoot = new BundleHandle('test:node-root');
  if (options.retain !== false && patches.frontier.size > 0) {
    await materializations.retain({
      coordinate: new MaterializationCoordinate({ frontier: patches.frontier, ceiling: null }),
      roots: rootsWithNodeStatus(options.rootStatus ?? 'retained', nodeRoot),
      stateHash: 'state-hash',
    });
  }
  const hasNode = vi.fn<(nodeAliveRoot: BundleHandle, nodeId: string) => Promise<boolean>>();
  if (options.readFailure === undefined) {
    hasNode.mockResolvedValue(options.presence ?? true);
  } else {
    hasNode.mockRejectedValue(options.readFailure);
  }
  const materializationRead = { hasNode };
  const deps = createDeps({ materializations, patches, materializationRead });
  const controller =
    options.materializationRead === false
      ? new MaterializeController(withoutMaterializationRead(deps))
      : new MaterializeController(deps);
  return { controller, deps, materializationRead, materializations, nodeRoot };
}

function createDeps(options: {
  readonly materializations: InMemoryMaterializationStore;
  readonly patches: PatchCollector;
  readonly materializationRead: {
    hasNode(nodeAliveRoot: BundleHandle, nodeId: string): Promise<boolean>;
  };
}): MaterializeDeps {
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
      hash: vi.fn().mockResolvedValue('unused-state-hash'),
      hmac: vi.fn().mockResolvedValue(new Uint8Array([1])),
      timingSafeEqual: vi.fn().mockReturnValue(false),
    },
    persistence: { readRef: vi.fn().mockResolvedValue(null) },
    checkpointStore: new InMemoryCheckpointStore(),
    materializations: options.materializations,
    materializationRead: options.materializationRead,
    patches: options.patches,
    graphCloner: { openReadOnly: vi.fn() },
    graphName: 'test-graph',
  };
}

function withoutMaterializationRead(deps: MaterializeDeps): MaterializeDeps {
  const { materializationRead: _materializationRead, ...withoutReader } = deps;
  return withoutReader;
}

function rootsWithNodeStatus(
  status: MaterializationRootStatus,
  nodeRoot: BundleHandle
): MaterializationRoots {
  const unavailable = MaterializationRoot.unavailable();
  return new MaterializationRoots({
    adjacency: unavailable,
    edgeAlive: MaterializationRoot.empty(),
    edgeBirths: unavailable,
    frontier: unavailable,
    nodeAlive:
      status === 'retained'
        ? MaterializationRoot.retained(nodeRoot)
        : status === 'empty'
          ? MaterializationRoot.empty()
          : unavailable,
    properties: unavailable,
    provenanceSupport: unavailable,
    roaringIndexes: unavailable,
  });
}

async function requireRetained(materializations: InMemoryMaterializationStore) {
  const coordinate = new MaterializationCoordinate({ frontier: FRONTIER, ceiling: null });
  const acquisition = await materializations.acquireExact(coordinate);
  if (acquisition === null) {
    throw new Error('Test materialization was not retained');
  }
  await acquisition.release();
  materializations.acquisitions.splice(0);
  return acquisition.materialization;
}
