import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceCompoundScope } from '@git-stunts/git-cas';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import { ProvenanceIndex } from '../../../../src/domain/services/provenance/ProvenanceIndex.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
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
      batch: (options) => staging.batch(options),
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
        putBatch: async () => {
          throw promotionFailure;
        },
      },
      bundles: staging.bundles,
      batch: async () => {
        throw promotionFailure;
      },
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

  it('compounds support roots with the terminal materialization bundle', async () => {
    const harness = await createHarness();
    const coordinate = exactCoordinate();
    const workspace = await harness.adapter.openWorkspace(coordinate);
    const generationsBefore = harness.cas.readWorkspaceGenerationCount();

    await workspace.promote({
      coordinate,
      roots: await createRoots(harness.cas),
      stateHash: 'support-state-hash',
      replayBasis: WarpState.empty(),
      provenanceSupport: ProvenanceIndex.empty(),
    });
    await workspace.release();

    expect(harness.cas.readWorkspaceGenerationCount() - generationsBefore).toBe(2);
  });

  it('fails closed when compound admission omits its descriptor page', async () => {
    const harness = await createHarness();
    const adapter = adapterFor(malformedWorkspaceFacade(harness.cas, 'omit-descriptor-page'));

    await expect(adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('omitted the descriptor page'),
    });
  });

  it('fails closed when compound admission returns extra descriptor pages', async () => {
    const harness = await createHarness();
    const adapter = adapterFor(malformedWorkspaceFacade(harness.cas, 'extra-descriptor-page'));

    await expect(adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('wrong descriptor page count'),
    });
  });

  it('fails closed when compound admission returns the wrong support count', async () => {
    const harness = await createHarness();
    const adapter = adapterFor(malformedWorkspaceFacade(harness.cas, 'omit-support-assets'));

    await expect(adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
      provenanceSupport: ProvenanceIndex.empty(),
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('wrong support asset count'),
    });
  });

  it('fails closed when retention omits the terminal materialization bundle', async () => {
    const harness = await createHarness();
    const adapter = adapterFor(malformedWorkspaceFacade(harness.cas, 'omit-terminal-retention'));

    await expect(adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('omitted the materialization bundle'),
    });
  });

  it('fails closed when compound admission returns extra terminal bundles', async () => {
    const harness = await createHarness();
    const adapter = adapterFor(malformedWorkspaceFacade(harness.cas, 'extra-terminal-bundle'));

    await expect(adapter.retain({
      coordinate: exactCoordinate(),
      roots: await createRoots(harness.cas),
      stateHash: 'state-hash',
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('wrong materialization bundle count'),
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

type WorkspaceMalformation =
  | 'omit-descriptor-page'
  | 'extra-descriptor-page'
  | 'omit-support-assets'
  | 'extra-terminal-bundle'
  | 'omit-terminal-retention';

function malformedWorkspaceFacade(
  cas: InMemoryGitCasFacade,
  malformation: WorkspaceMalformation,
): GitCasMaterializationFacade {
  return {
    assets: cas.assets,
    bundles: cas.bundles,
    caches: cas.caches,
    pages: cas.pages,
    workspaces: {
      open: async (options) => {
        const workspace = await cas.workspaces.open(options);
        const batch: GitCasStagingWorkspace['batch'] = async (request) => {
          let replacementRetainedHandle: string | null = null;
          const retain = malformation === 'omit-terminal-retention'
            ? () => replacementRetainedHandle === null ? [] : [replacementRetainedHandle]
            : request.retain;
          return await workspace.batch({
            ...request,
            ...(retain === undefined ? {} : { retain }),
            operation: async (scope) => {
              const effectiveScope = malformation === 'omit-terminal-retention'
                ? retainingDescriptorScope(scope, (handle) => {
                  replacementRetainedHandle = handle;
                })
                : malformedScope(scope, malformation);
              return await request.operation(effectiveScope);
            },
          });
        };
        return {
          assets: workspace.assets,
          pages: workspace.pages,
          bundles: workspace.bundles,
          batch,
          checkpoint: async (request) => await workspace.checkpoint(request),
          promoteToCache: async (request) => await workspace.promoteToCache(request),
          release: async () => await workspace.release(),
        };
      },
    },
  };
}

function malformedScope(
  scope: WorkspaceCompoundScope,
  malformation: WorkspaceMalformation,
): WorkspaceCompoundScope {
  if (malformation === 'omit-descriptor-page') {
    return Object.freeze({
      ...scope,
      pages: Object.freeze({ putBatch: async () => Object.freeze([]) }),
    });
  }
  if (malformation === 'extra-descriptor-page') {
    return Object.freeze({
      ...scope,
      pages: Object.freeze({
        putBatch: async (request) => duplicateFirst(await scope.pages.putBatch(request)),
      }),
    });
  }
  if (malformation === 'omit-support-assets') {
    return Object.freeze({
      ...scope,
      assets: Object.freeze({ putBatch: async () => Object.freeze([]) }),
    });
  }
  if (malformation === 'extra-terminal-bundle') {
    return Object.freeze({
      ...scope,
      bundles: Object.freeze({
        putOrderedBatch: async (request) =>
          duplicateFirst(await scope.bundles.putOrderedBatch(request)),
      }),
    });
  }
  return scope;
}

function duplicateFirst<T>(values: readonly T[]): readonly T[] {
  const first = values[0];
  return first === undefined ? values : Object.freeze([...values, first]);
}

function retainingDescriptorScope(
  scope: WorkspaceCompoundScope,
  retain: (handle: string) => void,
): WorkspaceCompoundScope {
  return Object.freeze({
    ...scope,
    pages: Object.freeze({
      putBatch: async (request) => {
        const handles = await scope.pages.putBatch(request);
        const descriptor = handles[0];
        if (descriptor !== undefined) {
          retain(descriptor.toString());
        }
        return handles;
      },
    }),
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
