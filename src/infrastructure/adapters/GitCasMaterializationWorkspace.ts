import {
  BundleHandle as GitCasBundleHandle,
  type ApplicationHandleInput,
  type CacheSet,
  type RetentionWitness,
  type StagingWorkspace,
  type WorkspaceCheckpointResult,
  type WorkspaceRetainedBundle,
  type WorkspaceRetainedPage,
} from '@git-stunts/git-cas';
import type MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import type StorageRetentionWitness from '../../domain/storage/StorageRetentionWitness.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type {
  StagedBundleMember,
  StageOrderedBundleOptions,
  StageOrderedBundleRequest,
  StageOrderedBundlesOptions,
  StagePageOptions,
  StagePagesOptions,
} from '../../ports/ArtifactStagingPort.ts';
import MaterializationWorkspacePort, {
  type MaterializationWorkspaceRoots,
  type PromoteMaterializationRequest,
} from '../../ports/MaterializationWorkspacePort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import {
  requireWorkspaceOptions,
} from './GitCasMaterializationWorkspaceValidation.ts';

export type GitCasStagingWorkspace = Pick<
  StagingWorkspace,
  'assets' | 'pages' | 'bundles' | 'checkpoint' | 'release'
> & Readonly<{
  promoteToCache(options: {
    cache: Pick<CacheSet, 'ref' | 'put'>;
    key: string;
    handle: ApplicationHandleInput;
    options?: Parameters<CacheSet['put']>[2];
  }): ReturnType<StagingWorkspace['promoteToCache']>;
}>;

export type GitCasMaterializationWorkspaceOptions = Readonly<{
  workspace: GitCasStagingWorkspace;
  promote: (
    workspace: GitCasStagingWorkspace,
    request: PromoteMaterializationRequest,
  ) => Promise<MaterializationHandle>;
  onRelease?: () => void;
}>;

/** git-cas-owned retention scope for one in-progress materialization. */
export default class GitCasMaterializationWorkspace extends MaterializationWorkspacePort {
  readonly #workspace: GitCasStagingWorkspace;
  readonly #promoteMaterialization: GitCasMaterializationWorkspaceOptions['promote'];
  readonly #onRelease: () => void;
  #promoting = false;
  #promoted = false;
  #releaseRequested = false;
  #released = false;
  #releasePromise: Promise<void> | null = null;
  #tail: Promise<void> = Promise.resolve();

  constructor(options: GitCasMaterializationWorkspaceOptions) {
    super();
    requireWorkspaceOptions(options);
    this.#workspace = options.workspace;
    this.#promoteMaterialization = options.promote;
    this.#onRelease = options.onRelease ?? (() => undefined);
  }

  override stagePage(
    source: Uint8Array,
    options: StagePageOptions,
  ): Promise<string> {
    this.#assertMutable('stage a page');
    return this.#serialize(async () => {
      const staged = await this.#workspace.pages.put({
        source,
        maxBytes: options.maxBytes,
      });
      requireRetainedStage(staged, staged.handle.toString());
      return staged.handle.toString();
    });
  }

  override stagePages(
    sources: readonly Uint8Array[],
    options: StagePagesOptions,
  ): Promise<readonly string[]> {
    this.#assertMutable('stage pages');
    return this.#serialize(async () => {
      const staged = await this.#workspace.pages.putBatch({
        pages: sources.map((source) => ({ source, maxBytes: options.maxBytes })),
        maxBatchBytes: options.maxBatchBytes,
        maxBatchPages: options.maxBatchPages,
      });
      return retainedBatchHandles(staged, sources.length, 'page');
    });
  }

  override stageOrderedBundle(
    members: Iterable<StagedBundleMember>,
    options: StageOrderedBundleOptions = {},
  ): Promise<BundleHandle> {
    this.#assertMutable('stage a bundle');
    return this.#serialize(async () => {
      const staged = await this.#workspace.bundles.putOrdered({
        members,
        ...(options.maxMembers === undefined
          ? {}
          : { limits: { maxMembers: options.maxMembers } }),
      });
      requireRetainedStage(staged, staged.handle.toString());
      return new BundleHandle(staged.handle.toString());
    });
  }

  override stageOrderedBundles(
    bundles: readonly StageOrderedBundleRequest[],
    options: StageOrderedBundlesOptions,
  ): Promise<readonly BundleHandle[]> {
    this.#assertMutable('stage bundles');
    return this.#serialize(async () => {
      const staged = await this.#workspace.bundles.putOrderedBatch({
        bundles: bundles.map(gitCasBundleRequest),
        ...options,
      });
      return retainedBatchHandles(staged, bundles.length, 'bundle')
        .map((handle) => new BundleHandle(handle));
    });
  }

  override checkpoint(
    roots: MaterializationWorkspaceRoots,
  ): Promise<StorageRetentionWitness | null> {
    this.#assertMutable('checkpoint');
    return this.#serialize(async () => {
      const members = workspaceMembers(roots);
      if (members.length === 0) {
        return null;
      }
      const staged = await this.#workspace.bundles.putOrdered({ members });
      requireRetainedStage(staged, staged.handle.toString());
      const checkpoint = await this.#workspace.checkpoint({ handles: [staged.handle] });
      return requireCheckpointWitness(checkpoint, staged.handle.toString());
    });
  }

  override promote(
    request: PromoteMaterializationRequest,
  ): Promise<MaterializationHandle> {
    this.#assertMutable('promote');
    this.#promoting = true;
    const operation = this.#serialize(
      async () => await this.#promoteMaterialization(this.#workspace, request),
    );
    return operation.then((materialization) => {
      this.#promoted = true;
      return materialization;
    }).finally(() => {
      this.#promoting = false;
    });
  }

  override release(): Promise<void> {
    this.#releaseRequested = true;
    this.#releasePromise ??= this.#serialize(async () => {
      if (!this.#released) {
        await this.#workspace.release();
        this.#released = true;
        this.#onRelease();
      }
    });
    return this.#releasePromise;
  }

  #assertMutable(operation: string): void {
    if (
      this.#releaseRequested || this.#released || this.#promoting || this.#promoted
    ) {
      throw workspaceError(`cannot ${operation} on a closed workspace`);
    }
  }

  #serialize<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.#tail.then(operation);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

type RetainedStage = WorkspaceRetainedPage | WorkspaceRetainedBundle;

function retainedBatchHandles(
  staged: readonly RetainedStage[],
  expectedCount: number,
  kind: 'page' | 'bundle',
): readonly string[] {
  if (staged.length !== expectedCount) {
    throw workspaceError(`git-cas returned the wrong staged ${kind} count`);
  }
  if (staged.length === 0) { return Object.freeze([]); }
  const generations = new Set<string>();
  const handles = staged.map((entry) => {
    const handle = entry.handle.toString();
    generations.add(requireRetainedStage(entry, handle).root.generation);
    return handle;
  });
  if (generations.size !== 1) {
    throw workspaceError(`git-cas ${kind} batch did not share one generation`);
  }
  return Object.freeze(handles);
}

function gitCasBundleRequest(request: StageOrderedBundleRequest): {
  members: Iterable<StagedBundleMember>;
  limits?: Readonly<{ maxMembers?: number }>;
} {
  return {
    members: request.members,
    ...(request.options?.maxMembers === undefined
      ? {}
      : { limits: { maxMembers: request.options.maxMembers } }),
  };
}

function workspaceMembers(
  roots: MaterializationWorkspaceRoots,
): Array<[string, string]> {
  requireRoots(roots);
  const members: Array<[string, string]> = [];
  appendWorkspaceRoot(members, 'roots/edge-alive', roots.edgeAliveRoot);
  appendWorkspaceRoot(members, 'roots/node-alive', roots.nodeAliveRoot);
  appendWorkspaceRoot(members, 'roots/properties', roots.propertiesRoot);
  appendWorkspaceRoot(members, 'roots/roaring-indexes', roots.roaringIndexesRoot);
  return members;
}

function appendWorkspaceRoot(
  members: Array<[string, string]>,
  path: string,
  root: string | null | undefined,
): void {
  if (root !== undefined && root !== null) {
    members.push([path, parseRoot(root)]);
  }
}

function parseRoot(token: string): string {
  try {
    return GitCasBundleHandle.parse(token).toString();
  } catch (raw) {
    throw workspaceError(`root is not a bundle handle: ${errorMessage(raw)}`);
  }
}

function requireRetainedStage(
  staged: WorkspaceRetainedPage | WorkspaceRetainedBundle,
  expectedHandle: string,
): StorageRetentionWitness {
  if (
    staged.state !== 'retained' ||
    staged.retention.policy !== 'evictable' ||
    staged.retention.reachability !== 'anchored' ||
    staged.retention.protection !== 'workspace'
  ) {
    throw workspaceError('git-cas returned an unretained staged artifact');
  }
  return requireWorkspaceWitness(staged.witness, expectedHandle);
}

function requireCheckpointWitness(
  checkpoint: WorkspaceCheckpointResult,
  expectedHandle: string,
): StorageRetentionWitness {
  const exact = [
    checkpoint.handles.length === 1,
    checkpoint.handles[0]?.toString() === expectedHandle,
    checkpoint.witnesses.length === 1,
  ];
  if (exact.includes(false)) {
    throw workspaceError('git-cas checkpoint did not retain the exact workspace root');
  }
  const witness = checkpoint.witnesses[0];
  if (witness === undefined) {
    throw workspaceError('git-cas checkpoint omitted retention evidence');
  }
  return requireWorkspaceWitness(witness, expectedHandle);
}

function requireWorkspaceWitness(
  witness: RetentionWitness,
  expectedHandle: string,
): StorageRetentionWitness {
  const adapted = adaptGitCasRetentionWitness(witness.toJSON());
  if (
    adapted.handle.toString() !== expectedHandle ||
    adapted.policy !== 'evictable' ||
    adapted.reachability !== 'anchored' ||
    adapted.root.kind !== 'root-set'
  ) {
    throw workspaceError('git-cas returned invalid workspace retention evidence');
  }
  return adapted;
}

function requireRoots(value: MaterializationWorkspaceRoots): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw workspaceError('checkpoint roots must be an object');
  }
}

function errorMessage(raw: unknown): string {
  return raw instanceof Error ? raw.message : String(raw);
}

function workspaceError(message: string): WarpError {
  return new WarpError(`Materialization workspace ${message}`, 'E_MATERIALIZATION_STORAGE');
}
