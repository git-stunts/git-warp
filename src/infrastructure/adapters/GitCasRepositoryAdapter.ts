import ContentAddressableStore, {
  CborCodec,
  type AssetCapability,
  type BundleCapability,
  type PublicationCapability,
} from '@git-stunts/git-cas';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type RuntimeStorageProviderPort from '../../ports/RuntimeStorageProviderPort.ts';
import type {
  RuntimeStorageRequest,
  RuntimeStorageServices,
} from '../../ports/RuntimeStorageProviderPort.ts';
import GitCasAssetStorageAdapter from './GitCasAssetStorageAdapter.ts';
import GitCasAuditLogAdapter from './GitCasAuditLogAdapter.ts';
import GitCasStrandStoreAdapter from './GitCasStrandStoreAdapter.ts';
import GitCasIntentStoreAdapter from './GitCasIntentStoreAdapter.ts';
import GitCasMaterializationStoreAdapter, {
  type GitCasMaterializationFacade,
} from './GitCasMaterializationStoreAdapter.ts';
import type CasContentEncryptionPolicy from './CasContentEncryptionPolicy.ts';
import { CborCheckpointStoreAdapter } from './CborCheckpointStoreAdapter.ts';
import { CborIndexStoreAdapter } from './CborIndexStoreAdapter.ts';
import { CborPatchJournalAdapter } from './CborPatchJournalAdapter.ts';
import { GitCasWarpStateCacheAdapter } from './GitCasWarpStateCacheAdapter.ts';
import type { GitCasRootSetClient } from './GitCasStateCacheRootSetCoordinator.ts';
import GitCasTrieStoreAdapter from './GitCasTrieStoreAdapter.ts';
import GitTrustChainAdapter from './GitTrustChainAdapter.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import LoggerObservabilityBridge from './LoggerObservabilityBridge.ts';
import type GitTimelineHistoryAdapter from './GitTimelineHistoryAdapter.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

type GitCasPolicy = {
  execute<T>(operation: () => Promise<T>): Promise<T>;
};

export type GitCasFacade = Pick<
  ContentAddressableStore,
  | 'createTree'
  | 'readManifest'
  | 'restore'
  | 'restoreStream'
  | 'store'
> & {
  readonly assets: Pick<AssetCapability, 'put' | 'adopt' | 'open'>;
  readonly bundles: Pick<
    BundleCapability,
    'getMemberReference' | 'putOrdered' | 'iterateMemberReferences'
  >;
  readonly caches: GitCasMaterializationFacade['caches'];
  readonly pages: GitCasMaterializationFacade['pages'];
  readonly workspaces: GitCasMaterializationFacade['workspaces'];
  readonly publications: Pick<PublicationCapability, 'commit'>;
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
  private readonly _closeCas: (() => Promise<void>) | null;
  private readonly _cbor: InstanceType<typeof CborCodec>;
  private readonly _contentEncryption: CasContentEncryptionPolicy | undefined;
  private readonly _materializations = new Set<GitCasMaterializationStoreAdapter>();
  private _closePromise: Promise<void> | null = null;
  private _closed = false;

  constructor(options: GitCasRepositoryAdapterOptions) {
    this._plumbing = options.plumbing;
    this._history = options.history;
    if (options.cas === undefined) {
      const cas = ContentAddressableStore.createCbor({
        plumbing: options.plumbing,
        chunking: { strategy: 'cdc' },
        applicationRefPrefixes: ['refs/warp/'],
        ...(options.policy === undefined ? {} : { policy: options.policy }),
        ...(options.logger === undefined
          ? {}
          : { observability: new LoggerObservabilityBridge(options.logger) }),
      });
      this._cas = cas;
      this._closeCas = async () => await cas.close();
    } else {
      this._cas = options.cas;
      this._closeCas = null;
    }
    this._cbor = new CborCodec();
    this._contentEncryption = options.contentEncryption;
  }

  createRuntimeStorageServices(request: RuntimeStorageRequest): Promise<RuntimeStorageServices> {
    this._assertOpen();
    const content = this._createContentStorage();
    const materializations = this._createMaterializationStore(request);
    this._materializations.add(materializations);
    return Promise.resolve(
      Object.freeze({
        content,
        auditLog: this._createAuditLog(content),
        strands: this._createStrandStore(content),
        intents: this._createIntentStore(request, content),
        patchJournal: this._createPatchJournal(request, content),
        checkpoints: this._createCheckpointStore(request, content),
        indexes: this._createIndexStore(request, content),
        materializations,
        stateSnapshots: this._createStateSnapshots(request),
        trie: new GitCasTrieStoreAdapter({ cas: this._cas }),
      })
    );
  }

  private _createAuditLog(content: AssetStoragePort): GitCasAuditLogAdapter {
    return new GitCasAuditLogAdapter({
      history: this._history,
      cas: this._cas,
      assets: content,
    });
  }

  private _createStrandStore(content: AssetStoragePort): GitCasStrandStoreAdapter {
    return new GitCasStrandStoreAdapter({
      history: this._history,
      cas: this._cas,
      assets: content,
    });
  }

  private _createIntentStore(
    request: RuntimeStorageRequest,
    content: AssetStoragePort,
  ): GitCasIntentStoreAdapter {
    return new GitCasIntentStoreAdapter({
      history: this._history,
      cas: this._cas,
      assets: content,
      codec: request.codec,
    });
  }

  private _createCheckpointStore(
    request: RuntimeStorageRequest,
    content: AssetStoragePort,
  ): CborCheckpointStoreAdapter {
    return new CborCheckpointStoreAdapter({
      codec: request.codec,
      commitMessageCodec: request.commitMessageCodec,
      history: this._history,
      assetStorage: content,
      cas: this._cas,
    });
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
    content: AssetStoragePort
  ): CborPatchJournalAdapter {
    return new CborPatchJournalAdapter({
      assetStorage: content,
      cas: this._cas,
      codec: request.codec,
      commitReader: this._history,
      commitMessageCodec: request.commitMessageCodec,
      encrypted: this._contentEncryption?.enabled ?? false,
    });
  }

  private _createIndexStore(
    request: RuntimeStorageRequest,
    content: AssetStoragePort,
  ): CborIndexStoreAdapter {
    return new CborIndexStoreAdapter({
      codec: request.codec,
      assetStorage: content,
      cas: this._cas,
    });
  }

  private _createMaterializationStore(
    request: RuntimeStorageRequest,
  ): GitCasMaterializationStoreAdapter {
    const materializations = new GitCasMaterializationStoreAdapter({
      cas: this._cas,
      codec: request.codec,
      crypto: request.crypto,
      laneName: request.timelineName,
      onClose: () => this._materializations.delete(materializations),
    });
    return materializations;
  }

  createTrustChain(crypto: CryptoPort): GitTrustChainAdapter {
    this._assertOpen();
    return new GitTrustChainAdapter({
      cas: this._cas,
      cbor: this._cbor,
      plumbing: this._plumbing,
      crypto,
    });
  }

  private _createContentStorage(): GitCasAssetStorageAdapter {
    return new GitCasAssetStorageAdapter({
      cas: this._cas,
      legacyReader: this._history,
      ...(this._contentEncryption === undefined
        ? {}
        : { contentEncryption: this._contentEncryption }),
    });
  }

  /** Releases repository-scoped local resources without changing retained data. */
  close(): Promise<void> {
    this._closed = true;
    this._closePromise ??= this._close();
    return this._closePromise;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private async _close(): Promise<void> {
    const materializationResults = await Promise.allSettled(
      [...this._materializations].map(async (materializations) => await materializations.close()),
    );
    this._materializations.clear();
    const failures = materializationResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown);

    if (this._closeCas !== null) {
      try {
        await this._closeCas();
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, 'Git CAS repository storage failed to close cleanly');
    }
  }

  private _assertOpen(): void {
    if (this._closed) {
      throw new AdapterValidationError('Git CAS repository storage is closed');
    }
  }
}
