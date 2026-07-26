import type BundleHandle from '../domain/storage/BundleHandle.ts';

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

/** Optional bounded page-batch staging capability. */
export interface ArtifactStagingPort {
  stagePages?(
    _sources: readonly Uint8Array[],
    _options: StagePagesOptions,
  ): Promise<readonly string[]>;
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
