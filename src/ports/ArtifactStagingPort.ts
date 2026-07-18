import type BundleHandle from '../domain/storage/BundleHandle.ts';

export type StagedBundleMember = [path: string, handle: string];

export type StagePageOptions = Readonly<{
  maxBytes: number;
}>;

export type StageOrderedBundleOptions = Readonly<{
  maxMembers?: number;
}>;

/** Operation-scoped retention for immutable artifacts under construction. */
export default abstract class ArtifactStagingPort {
  abstract stagePage(
    _source: Uint8Array,
    _options: StagePageOptions,
  ): Promise<string>;

  abstract stageOrderedBundle(
    _members: Iterable<StagedBundleMember>,
    _options?: StageOrderedBundleOptions,
  ): Promise<BundleHandle>;
}
