import type {
  ApplicationHandle,
  WorkspaceCompoundScope,
} from '@git-stunts/git-cas';
import WarpError from '../../domain/errors/WarpError.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import ArtifactStagingPort, {
  type StagedBundleMember,
  type StageOrderedBundleOptions,
  type StageOrderedBundleRequest,
  type StageOrderedBundlesOptions,
  type StagePageOptions,
  type StagePagesOptions,
} from '../../ports/ArtifactStagingPort.ts';

/** Adapts one provisional git-cas compound scope to the artifact staging port. */
export default class GitCasCompoundArtifactStagingAdapter extends ArtifactStagingPort {
  readonly #scope: WorkspaceCompoundScope;

  constructor(options: { readonly scope: WorkspaceCompoundScope }) {
    super();
    this.#scope = options.scope;
  }

  override async stagePage(
    source: Uint8Array,
    options: StagePageOptions,
  ): Promise<string> {
    const handles = await this.#scope.pages.putBatch({
      pages: [{ source, maxBytes: options.maxBytes }],
    });
    return requireHandle(handles, 1, 'page').toString();
  }

  override async stagePages(
    sources: readonly Uint8Array[],
    options: StagePagesOptions,
  ): Promise<readonly string[]> {
    const handles = await this.#scope.pages.putBatch({
      pages: sources.map((source) => ({ source, maxBytes: options.maxBytes })),
      maxBatchBytes: options.maxBatchBytes,
      maxBatchPages: options.maxBatchPages,
    });
    requireDenseHandles(handles, sources.length, 'page');
    return Object.freeze(handles.map((handle) => handle.toString()));
  }

  override async stageOrderedBundle(
    members: Iterable<StagedBundleMember>,
    options: StageOrderedBundleOptions = {},
  ): Promise<BundleHandle> {
    const handles = await this.#scope.bundles.putOrderedBatch({
      bundles: [gitCasBundleRequest({ members, options })],
    });
    return new BundleHandle(requireHandle(handles, 1, 'bundle').toString());
  }

  override async stageOrderedBundles(
    bundles: readonly StageOrderedBundleRequest[],
    options: StageOrderedBundlesOptions,
  ): Promise<readonly BundleHandle[]> {
    const handles = await this.#scope.bundles.putOrderedBatch({
      bundles: bundles.map(gitCasBundleRequest),
      ...options,
    });
    requireDenseHandles(handles, bundles.length, 'bundle');
    return Object.freeze(handles.map((handle) => new BundleHandle(handle.toString())));
  }
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

function requireHandle(
  handles: ReadonlyArray<ApplicationHandle>,
  expected: number,
  kind: 'page' | 'bundle',
): ApplicationHandle {
  requireCardinality(handles.length, expected, kind);
  const handle = handles[0];
  if (handle === undefined) {
    throw stagingError(`git-cas omitted the staged ${kind} handle`);
  }
  return handle;
}

function requireCardinality(
  actual: number,
  expected: number,
  kind: 'page' | 'bundle',
): void {
  if (actual !== expected) {
    throw stagingError(`git-cas returned the wrong provisional ${kind} count`);
  }
}

function requireDenseHandles(
  handles: ReadonlyArray<ApplicationHandle>,
  expected: number,
  kind: 'page' | 'bundle',
): void {
  requireCardinality(handles.length, expected, kind);
  for (let index = 0; index < handles.length; index += 1) {
    if (handles[index] === undefined) {
      throw stagingError(`git-cas omitted a provisional ${kind} handle`);
    }
  }
}

function stagingError(message: string): WarpError {
  return new WarpError(`Compound artifact staging ${message}`, 'E_MATERIALIZATION_STORAGE');
}
