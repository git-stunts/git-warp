import type TrieStorePort from '../domain/orset/trie/TrieStorePort.ts';
import type AssetStoragePort from './AssetStoragePort.ts';
import type AuditLogPort from './AuditLogPort.ts';
import type CheckpointStorePort from './CheckpointStorePort.ts';
import type CodecPort from './CodecPort.ts';
import type CommitMessageCodecPort from './CommitMessageCodecPort.ts';
import type IndexStorePort from './IndexStorePort.ts';
import type IntentStorePort from './IntentStorePort.ts';
import type LoggerPort from './LoggerPort.ts';
import type PatchJournalPort from './PatchJournalPort.ts';
import type StrandStorePort from './StrandStorePort.ts';
import type WarpStateCachePort from './WarpStateCachePort.ts';
import type WarpStateCacheRetentionPort from './WarpStateCacheRetentionPort.ts';

export type RuntimeStorageRequest = {
  readonly timelineName: string;
  readonly codec: CodecPort;
  readonly commitMessageCodec: CommitMessageCodecPort;
  readonly logger?: LoggerPort;
};

export type RuntimeStorageServices = {
  readonly content: AssetStoragePort;
  readonly auditLog: AuditLogPort;
  readonly patchJournal: PatchJournalPort;
  readonly strands: StrandStorePort;
  readonly checkpoints: CheckpointStorePort;
  readonly indexes: IndexStorePort;
  readonly intents: IntentStorePort;
  readonly stateSnapshots?: WarpStateCachePort & WarpStateCacheRetentionPort;
  readonly trie?: TrieStorePort;
};

/** Supplies one coherent set of semantic storage services to a runtime. */
export default interface RuntimeStorageProviderPort {
  createRuntimeStorageServices(
    request: RuntimeStorageRequest,
  ): Promise<RuntimeStorageServices>;
}
