import {
  AssetHandle as GitCasAssetHandle,
  BundleHandle,
  PageHandle,
  RetentionWitness,
  StagedAsset,
  StagedBundle,
  type ApplicationHandle,
  type ApplicationHandleInput,
  type AssetHandleInput,
  type AssetCapability,
  type BundleHandleInput,
  type BundleCapability,
  type PageHandleInput,
  type PublicationCapability,
} from '@git-stunts/git-cas';
import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import type { GitTreeCommitOptions } from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import InMemoryBlobStorageAdapter from './InMemoryBlobStorageAdapter.ts';

type PublicationHistory = {
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  commitNodeWithTree(options: GitTreeCommitOptions): Promise<string>;
  writeBlob(content: Uint8Array | string): Promise<string>;
  writeTree(entries: string[]): Promise<string>;
  readObjectType(oid: string): Promise<string>;
};

const BUNDLE_LIMITS = Object.freeze({
  maxMembers: 100_000,
  maxMemberPathBytes: 4_096,
  maxDescriptorBytes: 16_777_216,
  maxFanoutEntries: 1_024,
  maxFanoutDepth: 16,
});

/** Minimal high-level git-cas facade used to exercise production adapters in memory. */
export default class InMemoryGitCasFacade {
  readonly assets: Pick<AssetCapability, 'put' | 'adopt' | 'open'>;
  readonly bundles: Pick<BundleCapability, 'putOrdered'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;

  readonly #history: PublicationHistory;
  readonly #storage: InMemoryBlobStorageAdapter;
  readonly #stagedAssetsByOid = new Map<string, StagedAsset>();
  readonly #bundleMembers = new Map<string, readonly [string, string][]>();
  readonly #publicationRoots = new Map<string, string>();

  constructor(options: {
    history: PublicationHistory;
    storage: InMemoryBlobStorageAdapter;
  }) {
    this.#history = options.history;
    this.#storage = options.storage;
    this.assets = Object.freeze({
      put: async (request) => await this.#putAsset(request),
      adopt: async ({ treeOid }) => await this.#adoptAsset(treeOid),
      open: (request) => this.#openAsset(request.handle),
    });
    this.bundles = Object.freeze({
      putOrdered: async (request) => await this.#putBundle(request.members),
    });
    this.publications = Object.freeze({
      commit: async (request) => await this.#publish(request),
    });
  }

  readBundleMembers(handle: string): readonly [string, string][] {
    return this.#bundleMembers.get(handle) ?? Object.freeze([]);
  }

  readPublicationRoot(commitId: string): string | null {
    return this.#publicationRoots.get(commitId) ?? null;
  }

  async #putAsset(
    request: Parameters<AssetCapability['put']>[0],
  ): Promise<StagedAsset> {
    const staged = await this.#storage.stage(request.source, {
      slug: request.slug,
      filename: request.filename ?? 'content',
    });
    const asset = new StagedAsset({
      handle: GitCasAssetHandle.parse(staged.handle.toString()),
      slug: request.slug,
      filename: request.filename ?? 'content',
      size: staged.size,
      observedAt: staged.observedAt,
    });
    this.#stagedAssetsByOid.set(asset.handle.oid, asset);
    return asset;
  }

  async #adoptAsset(treeOid: string): Promise<StagedAsset> {
    const existing = this.#stagedAssetsByOid.get(treeOid);
    if (existing !== undefined) {
      return existing;
    }
    if (await this.#history.readObjectType(treeOid) !== 'tree') {
      throw Object.assign(
        new Error(`Cannot adopt non-tree object as asset: ${treeOid}`),
        { code: 'GIT_ERROR' },
      );
    }
    const handle = new GitCasAssetHandle({
      codec: 'raw',
      hashAlgorithm: treeOid.length === 64 ? 'sha256' : 'sha1',
      oid: treeOid,
    });
    return new StagedAsset({
      handle,
      slug: 'adopted',
      filename: 'content',
      size: 0,
      observedAt: new Date(0).toISOString(),
    });
  }

  async *#openAsset(handleInput: Parameters<AssetCapability['open']>[0]['handle']): AsyncIterable<Uint8Array> {
    const handle = GitCasAssetHandle.from(handleInput);
    const bytes = await this.#storage.retrieve(handle.toString()).catch(
      async () => await this.#storage.retrieve(handle.oid),
    );
    yield bytes;
  }

  async #putBundle(
    members: Parameters<BundleCapability['putOrdered']>[0]['members'],
  ): Promise<StagedBundle> {
    const lines: string[] = [];
    const recordedMembers: Array<[string, string]> = [];
    for await (const [path, member] of members) {
      const token = String(member);
      lines.push(`${path}\0${token}`);
      recordedMembers.push([path, token]);
    }
    const descriptorOid = await this.#history.writeBlob(lines.join('\n'));
    const oid = await this.#history.writeTree([
      `100644 blob ${descriptorOid}\tbundle.members`,
    ]);
    const handle = new BundleHandle({
      codec: 'ordered-test-bundle',
      hashAlgorithm: oid.length === 64 ? 'sha256' : 'sha1',
      oid,
    });
    this.#bundleMembers.set(handle.toString(), Object.freeze(recordedMembers));
    return new StagedBundle({
      handle,
      memberCount: lines.length,
      indexDepth: 1,
      descriptorBytes: lines.join('\n').length,
      limits: BUNDLE_LIMITS,
      observedAt: new Date(0).toISOString(),
    });
  }

  async #publish(
    request: Parameters<PublicationCapability['commit']>[0],
  ): Promise<Awaited<ReturnType<PublicationCapability['commit']>>> {
    const root = parseApplicationHandle(request.root);
    const current = await this.#history.readRef(request.ref.name);
    if (current !== request.ref.expected) {
      await this.#history.compareAndSwapRef(
        request.ref.name,
        current ?? root.oid,
        request.ref.expected,
      );
    }
    const commitId = await this.#history.commitNodeWithTree({
      treeOid: root.oid,
      parents: request.commit.parents ?? [],
      message: request.commit.message,
    });
    await this.#history.compareAndSwapRef(request.ref.name, commitId, request.ref.expected);
    const witness = new RetentionWitness({
      handle: root,
      policy: 'pinned',
      reachability: 'anchored',
      root: {
        kind: 'publication',
        namespace: request.ref.name,
        ref: request.ref.name,
        generation: commitId,
        path: '/',
      },
      observedAt: new Date(0).toISOString(),
    });
    this.#publicationRoots.set(commitId, root.toString());
    return Object.freeze({
      operation: 'publication',
      commitId,
      ref: request.ref.name,
      root,
      witness,
    });
  }
}

function parseApplicationHandle(input: ApplicationHandleInput): ApplicationHandle {
  if (input instanceof GitCasAssetHandle || input instanceof BundleHandle || input instanceof PageHandle) {
    return input;
  }
  if (typeof input === 'string') {
    try {
      return GitCasAssetHandle.parse(input);
    } catch {
      try {
        return BundleHandle.parse(input);
      } catch {
        return PageHandle.parse(input);
      }
    }
  }
  if (input.kind === 'asset' || input.format === 'manifest-tree') {
    return GitCasAssetHandle.from(input as AssetHandleInput);
  }
  if (input.kind === 'bundle' || input.format === 'fanout-tree') {
    return BundleHandle.from(input as BundleHandleInput);
  }
  return PageHandle.from(input as PageHandleInput);
}

/** Converts a git-cas asset handle for assertions against WARP ports. */
export function warpAssetHandle(handle: GitCasAssetHandle): AssetHandle {
  return new AssetHandle(handle.toString());
}
