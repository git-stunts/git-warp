import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type {
  RuntimeStorageRequest,
  RuntimeStorageServices,
} from '../../src/ports/RuntimeStorageProviderPort.ts';
import { CborCheckpointStoreAdapter } from '../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import { CborIndexStoreAdapter } from '../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import { CborPatchJournalAdapter } from '../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitCasAuditLogAdapter from '../../src/infrastructure/adapters/GitCasAuditLogAdapter.ts';
import GitCasIntentStoreAdapter from '../../src/infrastructure/adapters/GitCasIntentStoreAdapter.ts';
import GitCasStrandStoreAdapter from '../../src/infrastructure/adapters/GitCasStrandStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import CasContentEncryptionPolicy from '../../src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
import SubstrateCompatibilityPolicy from '../../src/infrastructure/adapters/SubstrateCompatibilityPolicy.ts';
import type AssetStoragePort from '../../src/ports/AssetStoragePort.ts';
import InMemoryBlobStorageAdapter from './InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from './InMemoryGitCasFacade.ts';
import type InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';

export type MemoryRuntimeStorageAdapterOptions = {
  readonly history: InMemoryGraphAdapter;
  readonly encrypted?: boolean;
  readonly encryptionKey?: Uint8Array;
  readonly backing?: InMemoryBlobStorageAdapter;
};

/** Coherent semantic runtime storage services for in-memory tests. */
export default class MemoryRuntimeStorageAdapter implements RuntimeStorageProviderPort {
  readonly #history: InMemoryGraphAdapter;
  readonly #content: AssetStoragePort;
  readonly #cas: InMemoryGitCasFacade;
  readonly #encrypted: boolean;
  readonly backing: InMemoryBlobStorageAdapter;

  constructor(options: MemoryRuntimeStorageAdapterOptions) {
    this.#history = withFixtureObjectTypeProbe(options.history);
    this.backing = options.backing ?? new InMemoryBlobStorageAdapter();
    const contentEncryption = resolveContentEncryption(options);
    this.#cas = new InMemoryGitCasFacade({
      history: this.#history,
      storage: this.backing,
    });
    this.#content = new GitCasAssetStorageAdapter({
      cas: this.#cas,
      legacyReader: this.#history,
      contentEncryption,
      compatibilityPolicy: TEST_COMPATIBILITY_POLICY,
    });
    this.#encrypted = contentEncryption.enabled;
  }

  createRuntimeStorageServices(request: RuntimeStorageRequest): Promise<RuntimeStorageServices> {
    return Promise.resolve(Object.freeze({
      content: this.#content,
      auditLog: new GitCasAuditLogAdapter({
        history: this.#history,
        cas: this.#cas,
        assets: this.#content,
        compatibilityPolicy: TEST_COMPATIBILITY_POLICY,
      }),
      strands: new GitCasStrandStoreAdapter({
        history: this.#history,
        cas: this.#cas,
        assets: this.#content,
        compatibilityPolicy: TEST_COMPATIBILITY_POLICY,
      }),
      intents: new GitCasIntentStoreAdapter({
        history: this.#history,
        cas: this.#cas,
        assets: this.#content,
        codec: request.codec,
      }),
      patchJournal: new CborPatchJournalAdapter({
        assetStorage: this.#content,
        cas: this.#cas,
        codec: request.codec,
        commitReader: this.#history,
        commitMessageCodec: request.commitMessageCodec,
        compatibilityPolicy: TEST_COMPATIBILITY_POLICY,
        encrypted: this.#encrypted,
      }),
      checkpoints: new CborCheckpointStoreAdapter({
        codec: request.codec,
        commitMessageCodec: request.commitMessageCodec,
        history: this.#history,
        assetStorage: this.#content,
        cas: this.#cas,
      }),
      indexes: new CborIndexStoreAdapter({
        codec: request.codec,
        assetStorage: this.#content,
        cas: this.#cas,
      }),
    }));
  }
}

function resolveContentEncryption(
  options: MemoryRuntimeStorageAdapterOptions,
): CasContentEncryptionPolicy {
  if (options.encryptionKey !== undefined) {
    return CasContentEncryptionPolicy.fromInternalResolvedKey({
      encryptionKey: options.encryptionKey,
    });
  }
  if (options.encrypted === true) {
    return CasContentEncryptionPolicy.fromInternalResolvedKey({
      encryptionKey: new Uint8Array(32).fill(0x19),
    });
  }
  return CasContentEncryptionPolicy.disabled();
}

const TEST_COMPATIBILITY_POLICY = new SubstrateCompatibilityPolicy({
  legacyAuditReceiptTreeReads: true,
  legacyContentBlobReads: true,
  legacyInlinePayloadReads: true,
  legacyPatchStorageReads: true,
  legacyStrandDescriptorBlobReads: true,
  legacyTrustRecordBlobReads: true,
});

function withFixtureObjectTypeProbe(history: InMemoryGraphAdapter): InMemoryGraphAdapter {
  if (typeof history.readObjectType === 'function') {
    return history;
  }
  const publicationCommits = new Set<string>();
  const readObjectType = (oid: string): Promise<string> => Promise.resolve(
    publicationCommits.has(oid) ? 'commit' : 'blob',
  );
  const commitNodeWithTree = async (
    options: Parameters<InMemoryGraphAdapter['commitNodeWithTree']>[0],
  ): Promise<string> => {
    const oid = await history.commitNodeWithTree(options);
    publicationCommits.add(oid);
    return oid;
  };
  return new Proxy(history, {
    get(target, property): unknown {
      if (property === 'readObjectType') {
        return readObjectType;
      }
      if (property === 'commitNodeWithTree') {
        return commitNodeWithTree;
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
