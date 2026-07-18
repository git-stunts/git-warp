import { describe, expect, it } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../../../src/domain/materialization/MaterializationHandle.ts';
import GitCasMaterializationStoreAdapter, {
  type GitCasMaterializationFacade,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import GitCasMaterializationWorkspace from '../../../../src/infrastructure/adapters/GitCasMaterializationWorkspace.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

describe('GitCasMaterializationWorkspace', () => {
  it('stages pages and bundles under one git-cas workspace root', async () => {
    const harness = await createHarness();
    const workspace = await harness.adapter.openWorkspace(workspaceCoordinate());

    const page = await workspace.stagePage(new Uint8Array([1, 2, 3]), { maxBytes: 3 });
    const bundle = await workspace.stageOrderedBundle([['value', page]], { maxMembers: 1 });

    expect(harness.cas.readActiveWorkspaceCount()).toBe(1);
    expect(harness.cas.readWorkspaceRoots()).toEqual([[page, bundle.toString()]]);
    expect(harness.cas.readBundleMembers(bundle.toString())).toEqual([['value', page]]);

    await workspace.release();
    expect(harness.cas.readActiveWorkspaceCount()).toBe(0);
  });

  it('checkpoints a transitive aggregate and returns RootSet evidence', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const workspace = await harness.adapter.openWorkspace(workspaceCoordinate());

    const witness = await workspace.checkpoint(roots);

    expect(witness).toMatchObject({
      policy: 'evictable',
      reachability: 'anchored',
      root: {
        kind: 'root-set',
        namespace: 'git-warp/materializations',
      },
    });
    const retainedRoots = harness.cas.readWorkspaceRoots();
    expect(retainedRoots).toHaveLength(1);
    expect(retainedRoots[0]).toHaveLength(1);
    const aggregate = retainedRoots[0]?.[0];
    if (aggregate === undefined) {
      throw new Error('Expected one retained checkpoint aggregate');
    }
    expect(harness.cas.readBundleMembers(aggregate)).toEqual([
      ['roots/edge-alive', roots.edgeAliveRoot],
      ['roots/node-alive', roots.nodeAliveRoot],
      ['roots/properties', roots.propertiesRoot],
    ]);
  });

  it('keeps empty checkpoints side-effect free and release idempotent', async () => {
    const harness = await createHarness();
    const workspace = await harness.adapter.openWorkspace(workspaceCoordinate());

    await expect(workspace.checkpoint({
      nodeAliveRoot: null,
      edgeAliveRoot: null,
    })).resolves.toBeNull();
    await workspace.release();
    await workspace.release();

    expect(harness.cas.readActiveWorkspaceCount()).toBe(0);
    expect(() => workspace.stagePage(new Uint8Array([1]), { maxBytes: 1 }))
      .toThrowError(/closed workspace/u);
  });

  it('fails closed when checkpoint evidence omits the aggregate handle', async () => {
    const harness = await createHarness();
    const raw = await harness.cas.workspaces.open({ namespace: 'malformed-workspace' });
    const workspace = new GitCasMaterializationWorkspace({
      workspace: {
        ...raw,
        checkpoint: async (options) => {
          const checkpoint = await raw.checkpoint(options);
          return Object.freeze({ ...checkpoint, handles: Object.freeze([]) });
        },
      },
      promote: rejectPromotion,
    });
    const roots = await createRoots(harness.cas);

    await expect(workspace.checkpoint(roots)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('exact workspace root'),
    });
    await workspace.release();
  });

  it('validates the git-cas workspace dependency at construction', () => {
    expect(() => Reflect.construct(GitCasMaterializationWorkspace, [{
      workspace: {},
      promote: rejectPromotion,
    }])).toThrowError(/workspace dependency/u);
  });
});

type WorkspaceRoots = Readonly<{
  nodeAliveRoot: string;
  edgeAliveRoot: string;
  propertiesRoot: string;
}>;

type Harness = Readonly<{
  adapter: GitCasMaterializationStoreAdapter;
  cas: InMemoryGitCasFacade;
}>;

async function createHarness(): Promise<Harness> {
  const cas = new InMemoryGitCasFacade({
    history: new InMemoryGraphAdapter(),
    storage: new InMemoryBlobStorageAdapter(),
  });
  return Object.freeze({ cas, adapter: adapterFor(cas) });
}

async function createRoots(cas: InMemoryGitCasFacade): Promise<WorkspaceRoots> {
  const nodePage = await cas.pages.put({ source: new Uint8Array([1]) });
  const edgePage = await cas.pages.put({ source: new Uint8Array([2]) });
  const propertiesPage = await cas.pages.put({ source: new Uint8Array([3]) });
  const nodeBundle = await cas.bundles.putOrdered({ members: [['root', nodePage.handle]] });
  const edgeBundle = await cas.bundles.putOrdered({ members: [['root', edgePage.handle]] });
  const propertiesBundle = await cas.bundles.putOrdered({
    members: [['root', propertiesPage.handle]],
  });
  return Object.freeze({
    nodeAliveRoot: nodeBundle.handle.toString(),
    edgeAliveRoot: edgeBundle.handle.toString(),
    propertiesRoot: propertiesBundle.handle.toString(),
  });
}

function adapterFor(cas: GitCasMaterializationFacade): GitCasMaterializationStoreAdapter {
  return new GitCasMaterializationStoreAdapter({
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName: 'events',
  });
}

function workspaceCoordinate(): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([['writer-a', 'patch-a']]),
    ceiling: null,
  });
}

function rejectPromotion(
  _workspace: unknown,
  _request: unknown,
): Promise<MaterializationHandle> {
  return Promise.reject(new Error('Promotion is not used by this lifecycle test'));
}
