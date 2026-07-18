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
  StagePageOptions,
} from '../../ports/ArtifactStagingPort.ts';
import MaterializationWorkspacePort, {
  type MaterializationWorkspaceRoots,
  type PromoteMaterializationRequest,
} from '../../ports/MaterializationWorkspacePort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';

export type GitCasStagingWorkspace = Pick<
  StagingWorkspace,
  'pages' | 'bundles' | 'checkpoint' | 'release'
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
}>;

/** git-cas-owned retention scope for one in-progress materialization. */
export default class GitCasMaterializationWorkspace extends MaterializationWorkspacePort {
  readonly #workspace: GitCasStagingWorkspace;
  readonly #promoteMaterialization: GitCasMaterializationWorkspaceOptions['promote'];
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

function workspaceMembers(
  roots: MaterializationWorkspaceRoots,
): Array<[string, string]> {
  requireRoots(roots);
  const members: Array<[string, string]> = [];
  if (roots.edgeAliveRoot !== null) {
    members.push(['roots/edge-alive', parseRoot(roots.edgeAliveRoot)]);
  }
  if (roots.nodeAliveRoot !== null) {
    members.push(['roots/node-alive', parseRoot(roots.nodeAliveRoot)]);
  }
  if (roots.propertiesRoot !== undefined && roots.propertiesRoot !== null) {
    members.push(['roots/properties', parseRoot(roots.propertiesRoot)]);
  }
  return members;
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

function requireWorkspaceOptions(options: GitCasMaterializationWorkspaceOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw workspaceError('options must be an object');
  }
  requireObject(options.workspace, 'git-cas workspace dependency');
  requireObject(options.workspace.pages, 'git-cas workspace dependency pages');
  requireObject(options.workspace.bundles, 'git-cas workspace dependency bundles');
  requireMethod(options.workspace.pages, 'put', 'git-cas workspace pages');
  requireMethod(options.workspace.bundles, 'putOrdered', 'git-cas workspace bundles');
  requireMethod(options.workspace, 'checkpoint', 'git-cas workspace');
  requireMethod(options.workspace, 'promoteToCache', 'git-cas workspace');
  requireMethod(options.workspace, 'release', 'git-cas workspace');
  requireFunction(options.promote, 'promote dependency');
}

function requireObject(value: unknown, field: string): asserts value is object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw workspaceError(`${field} is required`);
  }
}

function requireMethod(value: object, method: string, field: string): void {
  if (typeof Reflect.get(value, method) !== 'function') {
    throw workspaceError(`${field} must provide ${method}()`);
  }
}

function requireFunction(value: unknown, field: string): void {
  if (typeof value !== 'function') {
    throw workspaceError(`${field} is required`);
  }
}

function errorMessage(raw: unknown): string {
  return raw instanceof Error ? raw.message : String(raw);
}

function workspaceError(message: string): WarpError {
  return new WarpError(`Materialization workspace ${message}`, 'E_MATERIALIZATION_STORAGE');
}
