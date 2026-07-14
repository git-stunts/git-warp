import type TrieStorePort from '../domain/orset/trie/TrieStorePort.ts';
import type BlobStoragePort from './BlobStoragePort.ts';
import type CheckpointStorePort from './CheckpointStorePort.ts';
import type CodecPort from './CodecPort.ts';
import type CommitMessageCodecPort from './CommitMessageCodecPort.ts';
import type IndexStorePort from './IndexStorePort.ts';
import type LoggerPort from './LoggerPort.ts';
import type PatchJournalPort from './PatchJournalPort.ts';
import type WarpStateCachePort from './WarpStateCachePort.ts';
import type WarpStateCacheRetentionPort from './WarpStateCacheRetentionPort.ts';

export type RuntimeStorageRequest = {
  readonly timelineName: string;
  readonly codec: CodecPort;
  readonly commitMessageCodec: CommitMessageCodecPort;
  readonly logger?: LoggerPort;
  readonly contentOverride?: BlobStoragePort;
  readonly patchContentOverride?: BlobStoragePort;
};

export type RuntimeStorageServices = {
  readonly content: BlobStoragePort;
  readonly patchJournal: PatchJournalPort;
  readonly checkpoints: CheckpointStorePort;
  readonly indexes: IndexStorePort;
  readonly stateSnapshots?: WarpStateCachePort & WarpStateCacheRetentionPort;
  readonly trie?: TrieStorePort;
};

/** Supplies one coherent set of semantic storage services to a runtime. */
export default interface RuntimeStorageProviderPort {
  createRuntimeStorageServices(
    request: RuntimeStorageRequest,
  ): Promise<RuntimeStorageServices>;
}
