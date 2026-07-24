import { describe, expect, it, vi } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasMaterializationStoreAdapter, {
  type GitCasMaterializationFacade,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import type {
  GitCasStagingWorkspace,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationWorkspace.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const ROOT_COUNT = 9;

describe('GitCasMaterializationStoreAdapter lifecycle', () => {
  it('rejects new materialization operations as soon as closure starts', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const roots = await createRoots(harness.cas);

    const closing = harness.adapter.close();

    await expect(harness.adapter.openWorkspace(coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('adapter is closed'),
    });
    await expect(harness.adapter.retain({ coordinate, roots, stateHash: 'closed' }))
      .rejects.toMatchObject({
        code: 'E_MATERIALIZATION_STORAGE',
        message: expect.stringContaining('adapter is closed'),
      });
    await expect(harness.adapter.acquireExact(coordinate)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('adapter is closed'),
    });
    await closing;

    expect(harness.cas.readActiveWorkspaceCount()).toBe(0);
    expect(harness.cas.readActiveCacheAcquisitionCount()).toBe(0);
  });

  it('releases active workspaces when the adapter closes', async () => {
    const harness = await createHarness();
    const workspace = await harness.adapter.openWorkspace(exactCoordinate());
    const release = vi.spyOn(workspace, 'release');

    await harness.adapter.close();

    expect(release).toHaveBeenCalledTimes(1);
    expect(() => workspace.stagePage(new Uint8Array([1]), { maxBytes: 1 }))
      .toThrow('closed workspace');
  });

  it('waits for and releases a workspace whose open races with closure', async () => {
    const harness = await createHarness();
    const staging = await harness.cas.workspaces.open({ namespace: 'pending-close' });
    const release = vi.fn(async () => await staging.release());
    const controlled: GitCasStagingWorkspace = {
      assets: staging.assets,
      pages: staging.pages,
      bundles: staging.bundles,
      checkpoint: async (options) => await staging.checkpoint(options),
      promoteToCache: async (options) => await staging.promoteToCache(options),
      release,
    };
    const deferred = Promise.withResolvers<GitCasStagingWorkspace>();
    const adapter = adapterFor({
      assets: harness.cas.assets,
      bundles: harness.cas.bundles,
      caches: harness.cas.caches,
      pages: harness.cas.pages,
      workspaces: { open: async () => await deferred.promise },
    });

    const opening = adapter.openWorkspace(exactCoordinate());
    const opened = expect(opening).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('adapter is closed'),
    });
    const closing = adapter.close();
    deferred.resolve(controlled);

    await opened;
    await closing;
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('preserves promotion and workspace release failures', async () => {
    const harness = await createHarness();
    const promotionFailure = new Error('promotion failed');
    const releaseFailure = new Error('release failed');
    const staging = await harness.cas.workspaces.open({ namespace: 'failed-retain' });
    const controlled: GitCasStagingWorkspace = {
      assets: staging.assets,
      pages: {
        put: async () => {
          throw promotionFailure;
        },
      },
      bundles: staging.bundles,
      checkpoint: async (options) => await staging.checkpoint(options),
      promoteToCache: async (options) => await staging.promoteToCache(options),
      release: async () => {
        await staging.release();
        throw releaseFailure;
      },
    };
    const adapter = adapterFor({
      assets: harness.cas.assets,
      bundles: harness.cas.bundles,
      caches: harness.cas.caches,
      pages: harness.cas.pages,
      workspaces: { open: async () => controlled },
    });
    const roots = await createRoots(harness.cas);

    await expect(adapter.retain({
      coordinate: exactCoordinate(),
      roots,
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      errors: [promotionFailure, releaseFailure],
    });
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
  return Object.freeze({ cas, adapter: adapterFor(cas) });
}

function adapterFor(cas: GitCasMaterializationFacade): GitCasMaterializationStoreAdapter {
  return new GitCasMaterializationStoreAdapter({
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName: 'events',
  });
}

async function createRoots(cas: InMemoryGitCasFacade): Promise<MaterializationRoots> {
  const handles: BundleHandle[] = [];
  for (let index = 0; index < ROOT_COUNT; index += 1) {
    const page = await cas.pages.put({ source: new Uint8Array([index]) });
    const bundle = await cas.bundles.putOrdered({ members: [['root', page.handle]] });
    handles.push(new BundleHandle(bundle.handle.toString()));
  }
  return rootsFromHandles(handles);
}

function rootsFromHandles(handles: readonly BundleHandle[]): MaterializationRoots {
  const root = (index: number): MaterializationRoot => {
    const handle = handles[index];
    if (handle === undefined) {
      throw new Error('Root fixture did not create every materialization root');
    }
    return MaterializationRoot.retained(handle);
  };
  return new MaterializationRoots({
    adjacency: root(0),
    edgeAlive: root(1),
    edgeBirths: root(2),
    frontier: root(3),
    nodeAlive: root(4),
    properties: root(5),
    provenanceSupport: root(6),
    replayBasis: root(7),
    roaringIndexes: root(8),
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
