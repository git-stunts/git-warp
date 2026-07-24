import { describe, expect, it, vi } from 'vitest';
import AdjacencyMap from '../../../../../src/domain/capabilities/AdjacencyMap.ts';
import MaterializationCoordinate from '../../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../../src/domain/materialization/MaterializationRoots.ts';
import {
  resolveMaterializationRetention,
} from '../../../../../src/domain/services/controllers/MaterializationRetention.ts';
import RetainedMaterializationResumeStrategy from '../../../../../src/domain/services/controllers/RetainedMaterializationResumeStrategy.ts';
import type { MaterializeDeps } from '../../../../../src/domain/services/controllers/MaterializeDeps.ts';
import type {
  MaterializeResult,
} from '../../../../../src/domain/services/controllers/MaterializeController.ts';
import { MaterializePatchSummary } from '../../../../../src/domain/services/controllers/MaterializePatchSummary.ts';
import type {
  MaterializeStrategyRuntime,
} from '../../../../../src/domain/services/controllers/MaterializeStrategyRuntime.ts';
import type MaterializationWorkspacePort from '../../../../../src/ports/MaterializationWorkspacePort.ts';
import { createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import { ProvenanceIndex } from '../../../../../src/domain/services/provenance/ProvenanceIndex.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import type {
  MaterializationAcquisition,
} from '../../../../../src/ports/MaterializationStorePort.ts';
import type {
  WarpStateCoordinate,
} from '../../../../../src/ports/WarpStateCachePort.ts';
import InMemoryMaterializationStore from '../../../../helpers/InMemoryMaterializationStore.ts';

const TARGET_TIP = 'b'.repeat(40);
const PREDECESSOR_TIP = 'a'.repeat(40);

describe('RetainedMaterializationResumeStrategy', () => {
  it('reuses an exact retained basis without replaying patches', async () => {
    const coordinate = warpCoordinate(TARGET_TIP, null);
    const basis = createEmptyState();
    const store = new InMemoryMaterializationStore();
    const handle = await store.retain({
      coordinate: new MaterializationCoordinate(coordinate),
      roots: emptyRoots(),
      stateHash: 'state-hash',
      replayBasis: basis,
    });
    const harness = strategyHarness(store);

    const result = await harness.strategy.tryResume(
      coordinate,
      { receipts: false, wantDiff: true },
    );

    expect(result).toBe(harness.result);
    expect(harness.reducePatchStream).toHaveBeenCalledWith(
      expect.anything(),
      basis,
      { receipts: false, wantDiff: true },
      coordinate,
      undefined,
      handle,
    );
    const source = harness.reducePatchStream.mock.calls[0]?.[0];
    expect(source).toBeDefined();
    expect(await collect(source ?? emptyStream())).toEqual([]);
    expect(harness.buildResult).toHaveBeenCalledWith(expect.objectContaining({
      degraded: true,
      materialization: handle,
      publishSnapshot: false,
    }));
    expect(store.acquisitions[0]?.released).toBe(true);
  });

  it('falls through when an exact handle has no replay basis', async () => {
    const coordinate = warpCoordinate(TARGET_TIP, null);
    const store = new InMemoryMaterializationStore();
    await store.retain({
      coordinate: new MaterializationCoordinate(coordinate),
      roots: emptyRoots(),
      stateHash: 'state-hash',
    });
    const harness = strategyHarness(store);

    await expect(harness.strategy.tryResume(
      coordinate,
      { receipts: false, wantDiff: false },
    )).resolves.toBeNull();

    expect(harness.reducePatchStream).not.toHaveBeenCalled();
    expect(store.acquisitions[0]?.released).toBe(true);
  });

  it('resumes a causally compatible predecessor and replays only its suffix', async () => {
    const target = warpCoordinate(TARGET_TIP, 8);
    const predecessor = new MaterializationCoordinate(warpCoordinate(PREDECESSOR_TIP, 4));
    const basis = createEmptyState();
    const store = new InMemoryMaterializationStore();
    const handle = await store.retain({
      coordinate: predecessor,
      roots: emptyRoots(),
      stateHash: 'state-hash',
      replayBasis: basis,
    });
    const acquisition = await requireAcquisition(store, predecessor);
    const compatible = vi.spyOn(store, 'acquireBestCompatiblePredecessor')
      .mockImplementation(async (_coordinate, isCompatible) =>
        await isCompatible(predecessor) ? acquisition : null);
    const harness = strategyHarness(store, { isAncestor: true });

    const result = await harness.strategy.tryResume(
      target,
      { receipts: false, wantDiff: false, publishSnapshot: false },
    );

    expect(result).toBe(harness.result);
    expect(compatible).toHaveBeenCalledOnce();
    expect(harness.isAncestor).toHaveBeenCalledWith(PREDECESSOR_TIP, TARGET_TIP);
    expect(harness.streamForFrontierSinceCoordinate).toHaveBeenCalledWith(
      target.frontier,
      target.ceiling,
      { frontier: predecessor.frontier(), ceiling: predecessor.ceiling },
    );
    expect(harness.reducePatchStream).toHaveBeenCalledWith(
      expect.anything(),
      basis,
      { receipts: false, wantDiff: false },
      target,
      undefined,
      handle,
    );
    expect(harness.buildResult).toHaveBeenCalledWith(expect.objectContaining({
      degraded: true,
      publishSnapshot: false,
    }));
    expect(store.acquisitions[0]?.released).toBe(true);
  });

  it.each([
    {
      name: 'a ceiling beyond the target',
      candidate: warpCoordinate(PREDECESSOR_TIP, 9),
      target: warpCoordinate(TARGET_TIP, 8),
      ancestor: true,
    },
    {
      name: 'a writer absent from the target',
      candidate: warpCoordinate(PREDECESSOR_TIP, null, 'other-writer'),
      target: warpCoordinate(TARGET_TIP, null),
      ancestor: true,
    },
    {
      name: 'a non-ancestor writer tip',
      candidate: warpCoordinate(PREDECESSOR_TIP, null),
      target: warpCoordinate(TARGET_TIP, null),
      ancestor: false,
    },
  ])('rejects $name', async ({ candidate, target, ancestor }) => {
    const store = new InMemoryMaterializationStore();
    const candidateCoordinate = new MaterializationCoordinate(candidate);
    await store.retain({
      coordinate: candidateCoordinate,
      roots: emptyRoots(),
      stateHash: 'state-hash',
      replayBasis: createEmptyState(),
    });
    const acquisition = await requireAcquisition(store, candidateCoordinate);
    vi.spyOn(store, 'acquireBestCompatiblePredecessor')
      .mockImplementation(async (_coordinate, isCompatible) =>
        await isCompatible(candidateCoordinate) ? acquisition : null);
    const harness = strategyHarness(store, { isAncestor: ancestor });

    await expect(harness.strategy.tryResume(
      target,
      { receipts: false, wantDiff: false },
    )).resolves.toBeNull();

    expect(harness.reducePatchStream).not.toHaveBeenCalled();
  });

  it('releases an acquisition when retained resume fails', async () => {
    const coordinate = warpCoordinate(TARGET_TIP, null);
    const store = new InMemoryMaterializationStore();
    await store.retain({
      coordinate: new MaterializationCoordinate(coordinate),
      roots: emptyRoots(),
      stateHash: 'state-hash',
      replayBasis: createEmptyState(),
    });
    const harness = strategyHarness(store);
    harness.reducePatchStream.mockRejectedValueOnce(new Error('resume failed'));

    await expect(harness.strategy.tryResume(
      coordinate,
      { receipts: false, wantDiff: false },
    )).rejects.toThrow('resume failed');

    expect(store.acquisitions[0]?.released).toBe(true);
  });
});

describe('resolveMaterializationRetention', () => {
  it('rejects a prepared session without roots and workspace retention', async () => {
    await expect(resolveMaterializationRetention({
      deps: {} as MaterializeDeps, // nosemgrep: ts-no-unsafe-type-assertion -- validation fails before dependencies are read
      params: {
        reduced: { state: createEmptyState(), acceptMaterialization: vi.fn() },
        summary: MaterializePatchSummary.empty(),
        degraded: false,
        ceiling: null,
        frontier: null,
      },
      stateHash: 'state-hash',
    })).rejects.toMatchObject({ code: 'E_MATERIALIZATION_RESUME' });
  });

  it('rejects a prepared session whose roots cannot be reopened', async () => {
    await expect(resolveMaterializationRetention({
      deps: {} as MaterializeDeps, // nosemgrep: ts-no-unsafe-type-assertion -- validation fails before dependencies are read
      params: {
        reduced: {
          state: createEmptyState(),
          roots: unavailableSessionRoots(),
          workspace: {} as MaterializationWorkspacePort, // nosemgrep: ts-no-unsafe-type-assertion -- invalid roots fail before workspace use
          acceptMaterialization: vi.fn(),
        },
        summary: MaterializePatchSummary.empty(),
        degraded: false,
        ceiling: null,
        frontier: null,
      },
      stateHash: 'state-hash',
    })).rejects.toMatchObject({ code: 'E_MATERIALIZATION_RESUME' });
  });
});

function strategyHarness(
  materializations: InMemoryMaterializationStore,
  options: { readonly isAncestor?: boolean } = {},
) {
  const state = createEmptyState();
  const result = materializeResult(state);
  const streamForFrontierSinceCoordinate = vi.fn(() => emptyStream());
  const isAncestor = vi.fn().mockResolvedValue(options.isAncestor ?? false);
  const reducePatchStream = vi.fn(async (
    source: AsyncIterable<never>,
    basis: WarpState | undefined,
  ) => {
    await collect(source);
    return {
      reduced: { state: basis ?? createEmptyState() },
      summary: MaterializePatchSummary.empty(),
    };
  });
  const buildResult = vi.fn().mockResolvedValue(result);
  const deps = {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    materializations,
    patches: { isAncestor, streamForFrontierSinceCoordinate },
  } as unknown as MaterializeDeps; // nosemgrep: ts-no-unsafe-type-assertion -- focused strategy test supplies every dependency the strategy reads
  const unavailable = async (): Promise<never> => {
    throw new Error('unused retained resume dependency');
  };
  const runtime: MaterializeStrategyRuntime = {
    deps,
    emptyResult: unavailable,
    wrapState: unavailable,
    reducePatches: unavailable,
    reducePatchStream,
    buildResult,
    resumeExactMaterialization: unavailable,
    buildProvenance: () => new ProvenanceIndex(),
  };
  return {
    buildResult,
    isAncestor,
    reducePatchStream,
    result,
    strategy: new RetainedMaterializationResumeStrategy(runtime),
    streamForFrontierSinceCoordinate,
  };
}

async function requireAcquisition(
  store: InMemoryMaterializationStore,
  coordinate: MaterializationCoordinate,
): Promise<MaterializationAcquisition> {
  const acquisition = await store.acquireExact(coordinate);
  if (acquisition === null) {
    throw new Error('Expected retained materialization acquisition');
  }
  return acquisition;
}

function materializeResult(state: WarpState): MaterializeResult {
  return {
    state,
    stateHash: 'state-hash',
    adjacency: new AdjacencyMap({ incoming: new Map(), outgoing: new Map() }),
    patchCount: 0,
    maxObservedLamport: 0,
    provenanceIndex: new ProvenanceIndex(),
    provenanceDegraded: true,
    frontier: null,
    ceiling: null,
  };
}

function warpCoordinate(
  tip: string,
  ceiling: number | null,
  writer = 'writer-1',
): WarpStateCoordinate {
  return { frontier: new Map([[writer, tip]]), ceiling };
}

function emptyRoots(): MaterializationRoots {
  const empty = () => MaterializationRoot.empty();
  return new MaterializationRoots({
    adjacency: empty(),
    edgeAlive: empty(),
    edgeBirths: empty(),
    frontier: empty(),
    nodeAlive: empty(),
    properties: empty(),
    provenanceSupport: empty(),
    replayBasis: empty(),
    roaringIndexes: empty(),
  });
}

function unavailableSessionRoots(): MaterializationRoots {
  const roots = emptyRoots();
  return new MaterializationRoots({
    adjacency: roots.adjacency,
    edgeAlive: MaterializationRoot.unavailable(),
    edgeBirths: roots.edgeBirths,
    frontier: roots.frontier,
    nodeAlive: MaterializationRoot.unavailable(),
    properties: roots.properties,
    provenanceSupport: roots.provenanceSupport,
    replayBasis: roots.replayBasis,
    roaringIndexes: roots.roaringIndexes,
  });
}

async function* emptyStream(): AsyncGenerator<never> {}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of source) {
    values.push(value);
  }
  return values;
}
