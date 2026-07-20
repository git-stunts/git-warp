import type WarpStream from '../domain/stream/WarpStream.ts';
import type StorageRetentionWitness from '../domain/storage/StorageRetentionWitness.ts';
import type { WarpIntentDescriptor } from '../domain/types/WarpIntentDescriptor.ts';
import type { StagedAsset } from './AssetStoragePort.ts';

export type IntentChannel = 'admitted' | 'queued';

export type PublishIntentRequest = Readonly<{
  graphName: string;
  channel: IntentChannel;
  ownerId: string;
  descriptor: WarpIntentDescriptor;
}>;

export type PublishedIntent = Readonly<{
  sha: string;
  publicationRef: string;
  basisRef: string;
  resultingFrontierRef: string;
  descriptorAsset: StagedAsset;
  retention: StorageRetentionWitness;
}>;

/** Durable journal for unmaterialized intent descriptors. */
export default abstract class IntentStorePort {
  abstract currentBasisRef(
    _graphName: string,
    _channel: IntentChannel,
    _ownerId: string,
  ): Promise<string>;

  abstract publish(_request: PublishIntentRequest): Promise<PublishedIntent>;

  abstract scan(
    _graphName: string,
    _channel: IntentChannel,
    _ownerId: string,
  ): WarpStream<WarpIntentDescriptor>;
}
