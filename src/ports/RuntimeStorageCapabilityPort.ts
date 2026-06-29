import type BlobStoragePort from './BlobStoragePort.ts';
import type { PatchStorageRoute } from './CommitMessageCodecPort.ts';
import type TrieStorePort from '../domain/orset/trie/TrieStorePort.ts';
import type WarpStateCachePort from './WarpStateCachePort.ts';
import type CodecPort from './CodecPort.ts';
import type LoggerPort from './LoggerPort.ts';

/**
 * Optional composition capability exposed by persistence adapters that
 * know how to provision runtime storage services for their backend.
 */
export default interface RuntimeStorageCapabilityPort {
  createRuntimeBlobStorage(): Promise<BlobStoragePort>;
  createRuntimeTrieStore(): Promise<TrieStorePort>;
  createRuntimeStateCache?(opts: { graphName: string; codec: CodecPort; logger?: LoggerPort }): Promise<WarpStateCachePort>;
  defaultPatchWriteStorage(): PatchStorageRoute;
}
