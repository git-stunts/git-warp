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
import GitCasMaterializationStoreAdapter from '../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import GitCasStrandStoreAdapter from '../../src/infrastructure/adapters/GitCasStrandStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import CasContentEncryptionPolicy from '../../src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
import type AssetStoragePort from '../../src/ports/AssetStoragePort.ts';
import InMemoryBlobStorageAdapter from './InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from './InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';
import InMemorySyncReplayProtection from './InMemorySyncReplayProtection.ts';

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
  readonly #syncReplayProtection = new Map<string, InMemorySyncReplayProtection>();
  readonly backing: InMemoryBlobStorageAdapter;

  constructor(options: MemoryRuntimeStorageAdapterOptions) {
    this.#history = withFixtureObjectTypeProbe(options.history);
    this.backing = options.backing ?? new InMemoryBlobStorageAdapter();
    const contentEncryption = resolveContentEncryption(options);
    this.#cas = new InMemoryGitCasFacade({
      history: this.#history,
      storage: this.backing,
      fixtureAssetReader: async (oid) => await this.#readFixtureAsset(oid),
    });
    this.#content = new GitCasAssetStorageAdapter({
      cas: this.#cas,
      contentEncryption,
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
      }),
      strands: new GitCasStrandStoreAdapter({
        history: this.#history,
        cas: this.#cas,
        assets: this.#content,
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
        encrypted: this.#encrypted,
      }),
      checkpoints: new CborCheckpointStoreAdapter({
        codec: request.codec,
        crypto: request.crypto,
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
      materializations: new GitCasMaterializationStoreAdapter({
        cas: this.#cas,
        codec: request.codec,
        crypto: request.crypto,
        laneName: request.timelineName,
      }),
      syncReplayProtection: this.#replayProtection(request.timelineName),
    }));
  }

  #replayProtection(timelineName: string): InMemorySyncReplayProtection {
    const existing = this.#syncReplayProtection.get(timelineName);
    if (existing !== undefined) {
      return existing;
    }
    const created = new InMemorySyncReplayProtection();
    this.#syncReplayProtection.set(timelineName, created);
    return created;
  }

  async #readFixtureAsset(oid: string): Promise<Uint8Array | null> {
    const bytes = await this.#history.readBlob(oid);
    return bytes instanceof Uint8Array ? bytes : null;
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

export function withFixtureObjectTypeProbe(history: InMemoryGraphAdapter): InMemoryGraphAdapter {
  if (typeof history.readObjectType === 'function') {
    return history;
  }
  const fallbackObjects = new InMemoryGraphAdapter();
  const objectTypes = new Map<string, 'blob' | 'tree' | 'commit'>([
    [history.emptyTree, 'tree'],
  ]);
  const readObjectType = (oid: string): Promise<string> => Promise.resolve(
    objectTypes.get(oid) ?? 'blob',
  );
  const commitNodeWithTree = async (
    options: Parameters<InMemoryGraphAdapter['commitNodeWithTree']>[0],
  ): Promise<string> => {
    const oid = await normalizeToGitObjectId(
      await history.commitNodeWithTree(options),
      async () => await fallbackObjects.writeBlob(JSON.stringify(options)),
    );
    objectTypes.set(oid, 'commit');
    return oid;
  };
  const writeBlob = async (
    content: Parameters<InMemoryGraphAdapter['writeBlob']>[0],
  ): Promise<string> => {
    const oid = await normalizeToGitObjectId(
      await history.writeBlob(content),
      async () => await fallbackObjects.writeBlob(content),
    );
    objectTypes.set(oid, 'blob');
    return oid;
  };
  const writeTree = async (
    entries: Parameters<InMemoryGraphAdapter['writeTree']>[0],
  ): Promise<string> => {
    const oid = await normalizeToGitObjectId(
      await history.writeTree(entries),
      async () => await fallbackObjects.writeTree(entries),
    );
    objectTypes.set(oid, 'tree');
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
      if (property === 'writeBlob') {
        return writeBlob;
      }
      if (property === 'writeTree') {
        return writeTree;
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function normalizeToGitObjectId(
  candidate: string,
  fallback: () => Promise<string>,
): Promise<string> {
  return isGitObjectId(candidate) ? candidate : await fallback();
}

function isGitObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}
