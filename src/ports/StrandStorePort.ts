import type AssetHandle from '../domain/storage/AssetHandle.ts';
import type BundleHandle from '../domain/storage/BundleHandle.ts';
import type StorageRetentionWitness from '../domain/storage/StorageRetentionWitness.ts';
import type { StagedAsset } from './AssetStoragePort.ts';

export type PublishStrandDescriptorRequest = Readonly<{
  graphName: string;
  strandId: string;
  descriptor: Uint8Array;
  attachments: readonly AssetHandle[];
}>;

export type PublishedStrandDescriptor = Readonly<{
  revision: string;
  descriptorAsset: StagedAsset;
  bundleHandle: BundleHandle;
  retention: StorageRetentionWitness;
}>;

/** Semantic persistence boundary for retained strand descriptor state. */
export default abstract class StrandStorePort {
  abstract readDescriptor(_graphName: string, _strandId: string): Promise<Uint8Array | null>;

  abstract publishDescriptor(
    _request: PublishStrandDescriptorRequest,
  ): Promise<PublishedStrandDescriptor>;

  abstract listStrandIds(_graphName: string): Promise<string[]>;

  abstract hasDescriptor(_graphName: string, _strandId: string): Promise<boolean>;

  abstract deleteDescriptor(_graphName: string, _strandId: string): Promise<boolean>;
}
