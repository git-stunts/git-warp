import type BundleHandle from '../domain/storage/BundleHandle.ts';

export const DEPENDENT_ARTIFACT_ADMISSION_MAX_OPERATIONS = 1_024;

export type StagedBundleMember = [path: string, handle: string];

export type StagePageOptions = Readonly<{
  maxBytes: number;
}>;

export type StagePagesOptions = StagePageOptions & Readonly<{
  maxBatchBytes: number;
  maxBatchPages: number;
}>;

export type StageOrderedBundleOptions = Readonly<{
  maxMembers?: number;
}>;

export type StageOrderedBundleRequest = Readonly<{
  members: Iterable<StagedBundleMember>;
  options?: StageOrderedBundleOptions;
}>;

export type StageOrderedBundlesOptions = Readonly<{
  maxBatchBundles: number;
  maxBatchMembers: number;
  maxBatchObjects: number;
  maxBatchBytes: number;
}>;

export type DependentArtifactAdmissionOptions<T> = Readonly<{
  /** Must not exceed {@link DEPENDENT_ARTIFACT_ADMISSION_MAX_OPERATIONS}. */
  maxOperations: number;
  /** Narrows retention to top-level handles returned by this admission. */
  retain?: (value: T) => readonly string[];
}>;

export type DependentArtifactOperation<T> = (
  staging: ArtifactStagingPort,
) => Promise<T>;

/** Optional bounded page-batch staging capability. */
export interface ArtifactStagingPort {
  admitDependentArtifacts?<T>(
    _operation: DependentArtifactOperation<T>,
    _options: DependentArtifactAdmissionOptions<T>,
  ): Promise<T>;

  stagePages?(
    _sources: readonly Uint8Array[],
    _options: StagePagesOptions,
  ): Promise<readonly string[]>;

  stageOrderedBundles?(
    _bundles: readonly StageOrderedBundleRequest[],
    _options: StageOrderedBundlesOptions,
  ): Promise<readonly BundleHandle[]>;
}

/** Operation-scoped retention for immutable artifacts under construction. */
export abstract class ArtifactStagingPort {
  abstract stagePage(
    _source: Uint8Array,
    _options: StagePageOptions,
  ): Promise<string>;

  abstract stageOrderedBundle(
    _members: Iterable<StagedBundleMember>,
    _options?: StageOrderedBundleOptions,
  ): Promise<BundleHandle>;
}

export default ArtifactStagingPort;
