import { describe, expect, it } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { computeStateHash } from '../../../../src/domain/services/state/StateSerializer.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasMaterializationStoreAdapter from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

describe('GitCasMaterializationStoreAdapter retained resume', () => {
  it('retains and restores a replay basis through the materialization bundle', async () => {
    const harness = await createHarness();
    const state = createEmptyState();
    const retained = await harness.adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: await hashState(state),
      replayBasis: state,
    });

    expect(retained.roots.replayBasis.status).toBe('retained');
    await expect(harness.adapter.loadReplayBasis(retained)).resolves.toEqual(state);
  });

  it('fails closed when a retained replay basis is corrupt', async () => {
    const harness = await createHarness();
    const retained = await harness.adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: await hashState(createEmptyState()),
      replayBasis: createEmptyState(),
    });
    const replayRoot = retained.roots.replayBasis.handle;
    if (replayRoot === null) {
      throw new Error('Expected a retained replay basis root');
    }
    const asset = requireMember(
      harness.cas.readBundleMembers(replayRoot.toString()),
      'state.cbor',
    );
    harness.cas.replaceStoredAsset(asset, new Uint8Array([0xff]));

    await expect(harness.adapter.loadReplayBasis(retained)).rejects.toBeDefined();
  });

  it('acquires a compatible retained predecessor and excludes the target', async () => {
    const harness = await createHarness();
    const predecessor = exactCoordinate();
    const target = targetCoordinate();
    const retained = await harness.adapter.retain({
      coordinate: predecessor,
      roots: await createRoots(harness.cas),
      stateHash: 'predecessor-state-hash',
      replayBasis: createEmptyState(),
    });
    await harness.adapter.retain({
      coordinate: target,
      roots: await createRoots(harness.cas),
      stateHash: 'target-state-hash',
      replayBasis: createEmptyState(),
    });
    const observed: MaterializationCoordinate[] = [];

    const acquisition = await harness.adapter.acquireBestCompatiblePredecessor(
      target,
      (candidate) => {
        observed.push(candidate);
        return Promise.resolve(candidate.equals(predecessor));
      },
    );

    expect(observed).toHaveLength(1);
    expect(acquisition?.materialization.bundle.equals(retained.bundle)).toBe(true);
    await acquisition?.release();
    await harness.adapter.close();
  });

  it('excludes compatible predecessors without a retained replay basis', async () => {
    const harness = await createHarness();
    await harness.adapter.retain({
      coordinate: exactCoordinate(),
      roots: rootsWithoutReplayBasis(await createRoots(harness.cas)),
      stateHash: 'predecessor-state-hash',
    });

    const acquisition = await harness.adapter.acquireBestCompatiblePredecessor(
      targetCoordinate(),
      () => Promise.resolve(true),
    );

    expect(acquisition).toBeNull();
  });
});

async function createHarness(): Promise<Readonly<{
  adapter: GitCasMaterializationStoreAdapter;
  cas: InMemoryGitCasFacade;
}>> {
  const cas = new InMemoryGitCasFacade({
    history: new InMemoryGraphAdapter(),
    storage: new InMemoryBlobStorageAdapter(),
  });
  return Object.freeze({
    cas,
    adapter: new GitCasMaterializationStoreAdapter({
      cas,
      codec: defaultCodec,
      crypto: new NodeCryptoAdapter(),
      laneName: 'events',
    }),
  });
}

async function createRoots(cas: InMemoryGitCasFacade): Promise<MaterializationRoots> {
  const handles: BundleHandle[] = [];
  for (let index = 0; index < 9; index += 1) {
    const staged = await cas.bundles.putOrdered({ members: [] });
    handles.push(new BundleHandle(staged.handle.toString()));
  }
  return rootsFromHandles(handles);
}

function rootsFromHandles(handles: readonly BundleHandle[]): MaterializationRoots {
  const roots = handles.map((handle) => MaterializationRoot.retained(handle));
  return new MaterializationRoots({
    adjacency: requireRoot(roots, 0),
    edgeAlive: requireRoot(roots, 1),
    edgeBirths: requireRoot(roots, 2),
    frontier: requireRoot(roots, 3),
    nodeAlive: requireRoot(roots, 4),
    properties: requireRoot(roots, 5),
    provenanceSupport: requireRoot(roots, 6),
    replayBasis: requireRoot(roots, 7),
    roaringIndexes: requireRoot(roots, 8),
  });
}

function requireRoot(roots: readonly MaterializationRoot[], index: number): MaterializationRoot {
  const root = roots[index];
  if (root === undefined) {
    throw new Error('Root fixture did not create every materialization root');
  }
  return root;
}

function rootsWithoutReplayBasis(roots: MaterializationRoots): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: roots.adjacency,
    edgeAlive: roots.edgeAlive,
    edgeBirths: roots.edgeBirths,
    frontier: roots.frontier,
    nodeAlive: roots.nodeAlive,
    properties: roots.properties,
    provenanceSupport: roots.provenanceSupport,
    replayBasis: MaterializationRoot.unavailable(),
    roaringIndexes: roots.roaringIndexes,
  });
}

async function hashState(state: ReturnType<typeof createEmptyState>): Promise<string> {
  return await computeStateHash(state, {
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
  });
}

function exactCoordinate(): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([
      ['writer-a', 'patch-a'],
      ['writer-b', 'patch-b'],
    ]),
    ceiling: 12,
  });
}

function targetCoordinate(): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([
      ['writer-a', 'patch-next'],
      ['writer-b', 'patch-b'],
    ]),
    ceiling: 13,
  });
}

function requireMember(
  members: readonly (readonly [string, string])[],
  path: string,
): string {
  const member = members.find(([candidate]) => candidate === path);
  if (member === undefined) {
    throw new Error(`Missing bundle member: ${path}`);
  }
  return member[1];
}
