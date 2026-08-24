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
    const generationBeforeBatch = harness.cas.readWorkspaceGenerationCount();
    const pages = await workspace.stagePages!(
      [new Uint8Array([4]), new Uint8Array([5])],
      { maxBytes: 1, maxBatchBytes: 2, maxBatchPages: 2 },
    );
    const generationAfterBatch = harness.cas.readWorkspaceGenerationCount();
    const bundle = await workspace.stageOrderedBundle([['value', page]], { maxMembers: 1 });

    expect(pages).toHaveLength(2);
    expect(generationAfterBatch - generationBeforeBatch).toBe(1);
    expect(harness.cas.readActiveWorkspaceCount()).toBe(1);
    expect(harness.cas.readWorkspaceRoots()).toEqual([[
      page,
      ...pages,
      bundle.toString(),
    ]]);
    expect(harness.cas.readBundleMembers(bundle.toString())).toEqual([['value', page]]);

    await workspace.release();
    expect(harness.cas.readActiveWorkspaceCount()).toBe(0);
  });

  it('stages an ordered bundle batch under one git-cas workspace generation', async () => {
    const harness = await createHarness();
    const workspace = await harness.adapter.openWorkspace(workspaceCoordinate());
    const left = await workspace.stagePage(new Uint8Array([1]), { maxBytes: 1 });
    const right = await workspace.stagePage(new Uint8Array([2]), { maxBytes: 1 });
    const generationBefore = harness.cas.readWorkspaceGenerationCount();

    const bundles = await workspace.stageOrderedBundles!([
      { members: [['left', left]], options: { maxMembers: 1 } },
      { members: [['right', right]], options: { maxMembers: 1 } },
    ], {
      maxBatchBundles: 2,
      maxBatchMembers: 2,
      maxBatchObjects: 4,
      maxBatchBytes: 1024,
    });

    expect(harness.cas.readWorkspaceGenerationCount() - generationBefore).toBe(1);
    expect(bundles.map((bundle) => bundle.toString())).toHaveLength(2);
    expect(harness.cas.readBundleMembers(bundles[0]!.toString())).toEqual([['left', left]]);
    expect(harness.cas.readBundleMembers(bundles[1]!.toString())).toEqual([['right', right]]);
    await workspace.release();
  });

  it('keeps empty bundle batches side-effect free', async () => {
    const harness = await createHarness();
    const workspace = await harness.adapter.openWorkspace(workspaceCoordinate());
    const generationBefore = harness.cas.readWorkspaceGenerationCount();

    await expect(workspace.stageOrderedBundles!([], {
      maxBatchBundles: 1,
      maxBatchMembers: 1,
      maxBatchObjects: 1,
      maxBatchBytes: 1,
    })).resolves.toEqual([]);

    expect(harness.cas.readWorkspaceGenerationCount()).toBe(generationBefore);
    await workspace.release();
  });

  it('fails closed when git-cas returns the wrong bundle-batch count', async () => {
    const harness = await createHarness();
    const raw = await harness.cas.workspaces.open({ namespace: 'malformed-bundle-batch' });
    const workspace = new GitCasMaterializationWorkspace({
      workspace: {
        ...raw,
        bundles: { ...raw.bundles, putOrderedBatch: async () => Object.freeze([]) },
      },
      promote: rejectPromotion,
    });

    await expect(workspace.stageOrderedBundles!([{
      members: [],
    }], {
      maxBatchBundles: 1,
      maxBatchMembers: 1,
      maxBatchObjects: 1,
      maxBatchBytes: 1,
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('wrong staged bundle count'),
    });
    await workspace.release();
  });

  it('keeps empty page batches side-effect free', async () => {
    const harness = await createHarness();
    const workspace = await harness.adapter.openWorkspace(workspaceCoordinate());
    const generationBefore = harness.cas.readWorkspaceGenerationCount();

    await expect(workspace.stagePages!([], {
      maxBytes: 1,
      maxBatchBytes: 1,
      maxBatchPages: 1,
    })).resolves.toEqual([]);

    expect(harness.cas.readWorkspaceGenerationCount()).toBe(generationBefore);
    expect(harness.cas.readWorkspaceRoots()).toEqual([]);
  });

  it('fails closed when git-cas returns the wrong page-batch count', async () => {
    const harness = await createHarness();
    const raw = await harness.cas.workspaces.open({ namespace: 'malformed-batch' });
    const workspace = new GitCasMaterializationWorkspace({
      workspace: {
        ...raw,
        pages: {
          ...raw.pages,
          putBatch: async () => Object.freeze([]),
        },
      },
      promote: rejectPromotion,
    });

    await expect(workspace.stagePages!([new Uint8Array([1])], {
      maxBytes: 1,
      maxBatchBytes: 1,
      maxBatchPages: 1,
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('wrong staged page count'),
    });
    await workspace.release();
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

  it('requires the git-cas workspace page-batch capability', async () => {
    const harness = await createHarness();
    const raw = await harness.cas.workspaces.open({ namespace: 'missing-batch' });

    expect(() => Reflect.construct(GitCasMaterializationWorkspace, [{
      workspace: {
        ...raw,
        pages: { put: raw.pages.put },
      },
      promote: rejectPromotion,
    }])).toThrowError(/pages must provide putBatch/u);

    await raw.release();
  });

  it('requires the git-cas workspace bundle-batch capability', async () => {
    const harness = await createHarness();
    const raw = await harness.cas.workspaces.open({ namespace: 'missing-bundle-batch' });

    expect(() => Reflect.construct(GitCasMaterializationWorkspace, [{
      workspace: {
        ...raw,
        bundles: {
          put: raw.bundles.put,
          putOrdered: raw.bundles.putOrdered,
        },
      },
      promote: rejectPromotion,
    }])).toThrowError(/bundles must provide putOrderedBatch/u);

    await raw.release();
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
