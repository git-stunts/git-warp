import ContentAddressableStore, { CborCodec } from '@git-stunts/git-cas';
import { createGitCasPatchStorage } from '../../ports/CommitMessageCodecPort.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type RuntimeStorageProviderPort from '../../ports/RuntimeStorageProviderPort.ts';
import type {
  RuntimeStorageRequest,
  RuntimeStorageServices,
} from '../../ports/RuntimeStorageProviderPort.ts';
import CasBlobAdapter from './CasBlobAdapter.ts';
import type CasContentEncryptionPolicy from './CasContentEncryptionPolicy.ts';
import CasSeekCacheAdapter from './CasSeekCacheAdapter.ts';
import { CborCheckpointStoreAdapter } from './CborCheckpointStoreAdapter.ts';
import { CborIndexStoreAdapter } from './CborIndexStoreAdapter.ts';
import { CborPatchJournalAdapter } from './CborPatchJournalAdapter.ts';
import { GitCasWarpStateCacheAdapter } from './GitCasWarpStateCacheAdapter.ts';
import type { GitCasRootSetClient } from './GitCasStateCacheRootSetCoordinator.ts';
import GitTrieStoreAdapter from './GitTrieStoreAdapter.ts';
import GitTrustChainAdapter from './GitTrustChainAdapter.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import LoggerObservabilityBridge from './LoggerObservabilityBridge.ts';
import type GitTimelineHistoryAdapter from './GitTimelineHistoryAdapter.ts';

type GitCasPolicy = {
  execute<T>(operation: () => Promise<T>): Promise<T>;
};

export type GitCasFacade = Pick<
  ContentAddressableStore,
  'readManifest' | 'restore' | 'restoreStream' | 'store' | 'createTree'
> & {
  readonly rootSets: {
    open(options: { readonly ref: string }): Promise<GitCasRootSetClient>;
  };
};

export type GitCasRepositoryAdapterOptions = {
  readonly plumbing: GitPlumbing;
  readonly history: GitTimelineHistoryAdapter;
  readonly policy?: GitCasPolicy;
  readonly logger?: LoggerPort;
  readonly cas?: GitCasFacade;
  readonly contentEncryption?: CasContentEncryptionPolicy;
};

/** Repository-scoped adapter for every git-cas-backed WARP service. */
export default class GitCasRepositoryAdapter implements RuntimeStorageProviderPort {
  private readonly _plumbing: GitPlumbing;
  private readonly _history: GitTimelineHistoryAdapter;
  private readonly _cas: GitCasFacade;
  private readonly _cbor: InstanceType<typeof CborCodec>;
  private readonly _contentEncryption: CasContentEncryptionPolicy | undefined;

  constructor(options: GitCasRepositoryAdapterOptions) {
    this._plumbing = options.plumbing;
    this._history = options.history;
    this._cas =
      options.cas ??
      ContentAddressableStore.createCbor({
        plumbing: options.plumbing,
        chunking: { strategy: 'cdc' },
        ...(options.policy === undefined ? {} : { policy: options.policy }),
        ...(options.logger === undefined
          ? {}
          : { observability: new LoggerObservabilityBridge(options.logger) }),
      });
    this._cbor = new CborCodec();
    this._contentEncryption = options.contentEncryption;
  }

  createRuntimeStorageServices(request: RuntimeStorageRequest): Promise<RuntimeStorageServices> {
    const content = request.contentOverride ?? this._createContentStorage();
    return Promise.resolve(
      Object.freeze({
        content,
        patchJournal: this._createPatchJournal(request, content),
        checkpoints: new CborCheckpointStoreAdapter({
          codec: request.codec,
          blobPort: this._history,
        }),
        indexes: this._createIndexStore(request, content),
        stateSnapshots: this._createStateSnapshots(request),
        trie: new GitTrieStoreAdapter({ plumbing: this._plumbing }),
      })
    );
  }

  private _createStateSnapshots(request: RuntimeStorageRequest): GitCasWarpStateCacheAdapter {
    return new GitCasWarpStateCacheAdapter({
      cas: this._cas,
      persistence: this._history,
      graphName: request.timelineName,
      codec: request.codec,
      ...(this._contentEncryption === undefined
        ? {}
        : { contentEncryption: this._contentEncryption }),
    });
  }

  private _createPatchJournal(
    request: RuntimeStorageRequest,
    content: BlobStoragePort
  ): CborPatchJournalAdapter {
    return new CborPatchJournalAdapter({
      codec: request.codec,
      blobPort: this._history,
      commitPort: this._history,
      commitMessageCodec: request.commitMessageCodec,
      blobStorage: content,
      ...(request.patchContentOverride === undefined
        ? {}
        : { legacyPatchBlobStorage: request.patchContentOverride }),
      writeStorage: createGitCasPatchStorage({ encrypted: false }),
    });
  }

  private _createIndexStore(
    request: RuntimeStorageRequest,
    content: BlobStoragePort
  ): CborIndexStoreAdapter {
    return new CborIndexStoreAdapter({
      codec: request.codec,
      blobPort: this._history,
      treePort: this._history,
      blobStorage: content,
    });
  }

  createSeekCache(timelineName: string): CasSeekCacheAdapter {
    return new CasSeekCacheAdapter({
      cas: this._cas,
      persistence: this._history,
      graphName: timelineName,
      ...(this._contentEncryption === undefined
        ? {}
        : { contentEncryption: this._contentEncryption }),
    });
  }

  createTrustChain(crypto: CryptoPort): GitTrustChainAdapter {
    return new GitTrustChainAdapter({
      cas: this._cas,
      cbor: this._cbor,
      plumbing: this._plumbing,
      crypto,
    });
  }

  private _createContentStorage(): CasBlobAdapter {
    return new CasBlobAdapter({
      cas: this._cas,
      persistence: this._history,
      ...(this._contentEncryption === undefined
        ? {}
        : { contentEncryption: this._contentEncryption }),
    });
  }
}
