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

  it('reads retained node properties without projecting whole state', async () => {
    const fixture = await createFixture({
      propertyRootStatus: 'retained',
      properties: { status: 'ready' },
    });

    await expect(fixture.controller.readLiveNodeProperties('node:retained'))
      .resolves.toEqual({ status: 'ready' });

    expect(fixture.materializationRead.hasNode).toHaveBeenCalledWith(
      fixture.nodeRoot,
      'node:retained',
    );
    expect(fixture.materializationRead.getNodeProperties).toHaveBeenCalledWith(
      fixture.propertyRoot,
      'node:retained',
    );
    expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
    expect(fixture.deps.crypto.hash).not.toHaveBeenCalled();
  });

  it('returns null properties for a missing retained node', async () => {
    const fixture = await createFixture({
      presence: false,
      propertyRootStatus: 'retained',
    });

    await expect(fixture.controller.readLiveNodeProperties('node:missing'))
      .resolves.toBeNull();

    expect(fixture.materializationRead.getNodeProperties).not.toHaveBeenCalled();
    expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
  });

  it('returns an empty bag from an empty retained properties root', async () => {
    const fixture = await createFixture({ propertyRootStatus: 'empty' });

    await expect(fixture.controller.readLiveNodeProperties('node:retained'))
      .resolves.toEqual({});

    expect(fixture.materializationRead.getNodeProperties).not.toHaveBeenCalled();
  });

  it('falls back after releasing an unavailable retained properties root', async () => {
    const fixture = await createFixture({ propertyRootStatus: 'unavailable' });

    await expect(fixture.controller.readLiveNodeProperties('node:retained'))
      .resolves.toBeUndefined();

    expect(fixture.materializationRead.getNodeProperties).not.toHaveBeenCalled();
    expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
  });

  it('falls back when the configured reader does not support property roots', async () => {
    const fixture = await createFixture({
      propertyRootStatus: 'retained',
      propertyReadUnsupported: true,
    });

    await expect(fixture.controller.readLiveNodeProperties('node:retained'))
      .resolves.toBeUndefined();

    expect(fixture.materializationRead.getNodeProperties).toHaveBeenCalledOnce();
    expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
  });

  it('releases retained roots when the bounded property read fails', async () => {
    const propertyReadFailure = new Error('property read failed');
    const fixture = await createFixture({
      propertyRootStatus: 'retained',
      propertyReadFailure,
    });

    await expect(fixture.controller.readLiveNodeProperties('node:retained'))
      .rejects.toBe(propertyReadFailure);

    expect(fixture.materializations.acquisitions[0]?.releaseCalls).toBe(1);
    expect(fixture.materializations.acquisitions[0]?.released).toBe(true);
  });
});

async function createFixture(
  options: {
    readonly frontier?: Map<string, string>;
    readonly materializationRead?: boolean;
    readonly presence?: boolean;
    readonly properties?: Readonly<Record<string, string>>;
    readonly propertyReadFailure?: Error;
    readonly propertyReadUnsupported?: boolean;
    readonly propertyRootStatus?: MaterializationRootStatus;
    readonly readFailure?: Error;
    readonly retain?: boolean;
    readonly rootStatus?: MaterializationRootStatus;
  } = {}
) {
  const patches = new RetainedOnlyPatchCollector();
  patches.frontier = new Map(options.frontier ?? FRONTIER);
  const materializations = new InMemoryMaterializationStore();
  const nodeRoot = new BundleHandle('test:node-root');
  const propertyRoot = new BundleHandle('test:property-root');
  if (options.retain !== false && patches.frontier.size > 0) {
    await materializations.retain({
      coordinate: new MaterializationCoordinate({ frontier: patches.frontier, ceiling: null }),
      roots: rootsWithStatus({
        nodeStatus: options.rootStatus ?? 'retained',
        nodeRoot,
        propertyStatus: options.propertyRootStatus ?? 'unavailable',
        propertyRoot,
      }),
      stateHash: 'state-hash',
    });
  }
  const hasNode = vi.fn<(nodeAliveRoot: BundleHandle, nodeId: string) => Promise<boolean>>();
  if (options.readFailure === undefined) {
    hasNode.mockResolvedValue(options.presence ?? true);
  } else {
    hasNode.mockRejectedValue(options.readFailure);
  }
  const getNodeProperties = vi.fn();
  if (options.propertyReadUnsupported === true) {
    getNodeProperties.mockResolvedValue(undefined);
  } else if (options.propertyReadFailure === undefined) {
    getNodeProperties.mockResolvedValue(options.properties ?? null);
  } else {
    getNodeProperties.mockRejectedValue(options.propertyReadFailure);
  }
  const materializationRead = {
    hasNode,
    getNodeProperties,
  };
  const deps = createDeps({ materializations, patches, materializationRead });
  const controller =
    options.materializationRead === false
      ? new MaterializeController(withoutMaterializationRead(deps))
      : new MaterializeController(deps);
  return {
    controller,
    deps,
    materializationRead,
    materializations,
    nodeRoot,
    propertyRoot,
  };
}

function createDeps(options: {
  readonly materializations: InMemoryMaterializationStore;
  readonly patches: PatchCollector;
  readonly materializationRead: {
    hasNode(nodeAliveRoot: BundleHandle, nodeId: string): Promise<boolean>;
    getNodeProperties(
      propertiesRoot: BundleHandle,
      nodeId: string,
    ): Promise<Readonly<Record<string, string>> | null | undefined>;
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

function rootsWithStatus(options: {
  nodeStatus: MaterializationRootStatus;
  nodeRoot: BundleHandle;
  propertyStatus: MaterializationRootStatus;
  propertyRoot: BundleHandle;
}): MaterializationRoots {
  const unavailable = MaterializationRoot.unavailable();
  return new MaterializationRoots({
    adjacency: unavailable,
    edgeAlive: MaterializationRoot.empty(),
    edgeBirths: unavailable,
    frontier: unavailable,
    nodeAlive:
      options.nodeStatus === 'retained'
        ? MaterializationRoot.retained(options.nodeRoot)
        : options.nodeStatus === 'empty'
          ? MaterializationRoot.empty()
          : unavailable,
    properties:
      options.propertyStatus === 'retained'
        ? MaterializationRoot.retained(options.propertyRoot)
        : options.propertyStatus === 'empty'
          ? MaterializationRoot.empty()
          : unavailable,
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
