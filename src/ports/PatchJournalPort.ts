import type PatchEntry from '../domain/artifacts/PatchEntry.ts';
import type AssetHandle from '../domain/storage/AssetHandle.ts';
import type BundleHandle from '../domain/storage/BundleHandle.ts';
import type StorageRetentionWitness from '../domain/storage/StorageRetentionWitness.ts';
import type WarpStream from '../domain/stream/WarpStream.ts';
import type Patch from '../domain/types/Patch.ts';
import type { PatchCommitMessage } from './CommitMessageCodecPort.ts';
import type { StagedAsset } from './AssetStoragePort.ts';

export type AppendPatchRequest = Readonly<{
  patch: Patch;
  graph: string;
  writer: string;
  targetRef: string;
  expectedHead: string | null;
  parent: string | null;
  attachments: readonly AssetHandle[];
}>;

export type PublishedPatch = Readonly<{
  sha: string;
  bundleHandle: BundleHandle;
  stagedPatch: StagedAsset;
  retention: StorageRetentionWitness;
}>;

/** Semantic persistence boundary for causal patch history. */
export default abstract class PatchJournalPort {
  /** Stages, bundles, and causally publishes one patch plus its attachments. */
  abstract appendPatch(_request: AppendPatchRequest): Promise<PublishedPatch>;

  /** Reads a patch through its decoded commit locator, including legacy routes. */
  abstract readPatch(_message: PatchCommitMessage): Promise<Patch>;

  /** Streams a writer's chronological patch range. */
  abstract scanPatchRange(
    _writerId: string,
    _fromSha: string | null,
    _toSha: string,
  ): WarpStream<PatchEntry>;
}
