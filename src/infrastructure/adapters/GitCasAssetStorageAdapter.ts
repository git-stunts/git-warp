import {
  AssetHandle as GitCasAssetHandle,
  type AssetCapability,
  type AssetPutOptions,
  type StagedAsset as GitCasStagedAsset,
} from '@git-stunts/git-cas';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import AssetStoragePort, {
  type AssetWriteOptions,
  type StagedAsset,
} from '../../ports/AssetStoragePort.ts';
import {
  CURRENT_SUBSTRATE_ONLY_POLICY,
  type SubstrateCompatibilityPolicyValue,
} from './SubstrateCompatibilityPolicy.ts';
import CasContentEncryptionPolicy, {
  mapCasContentEncryptionError,
} from './CasContentEncryptionPolicy.ts';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const LEGACY_REFERENCE_CODES = new Set([
  'GIT_ERROR',
  'GIT_OBJECT_NOT_FOUND',
  'HANDLE_TARGET_MISSING',
  'MANIFEST_NOT_FOUND',
]);

export type GitCasAssetFacade = {
  readonly assets: AssetCapability;
};

export type LegacyAssetReader = {
  readBlob(oid: string): Promise<Uint8Array | null | undefined>;
};

/** Delegates immutable asset lifecycle to the high-level git-cas asset API. */
export default class GitCasAssetStorageAdapter extends AssetStoragePort {
  readonly #cas: GitCasAssetFacade;
  readonly #contentEncryption: CasContentEncryptionPolicy;
  readonly #legacyReader: LegacyAssetReader;
  readonly #compatibilityPolicy: SubstrateCompatibilityPolicyValue;

  constructor(options: {
    readonly cas: GitCasAssetFacade;
    readonly legacyReader: LegacyAssetReader;
    readonly contentEncryption?: CasContentEncryptionPolicy;
    readonly compatibilityPolicy?: SubstrateCompatibilityPolicyValue;
  }) {
    super();
    this.#cas = options.cas;
    this.#legacyReader = options.legacyReader;
    this.#contentEncryption = options.contentEncryption ?? CasContentEncryptionPolicy.disabled();
    this.#compatibilityPolicy = options.compatibilityPolicy ?? CURRENT_SUBSTRATE_ONLY_POLICY;
  }

  override async stage(
    source: AsyncIterable<Uint8Array>,
    options: AssetWriteOptions,
  ): Promise<StagedAsset> {
    const putOptions: AssetPutOptions = {
      source,
      slug: options.slug,
      filename: options.filename ?? 'content',
      ...this.#contentEncryption.toStoreOptions(),
    };
    const staged = await this.#cas.assets.put(putOptions);
    return stagedAsset(staged);
  }

  override async *open(handle: AssetHandle): AsyncIterable<Uint8Array> {
    try {
      yield* await this.#openResolved(handle);
    } catch (error) {
      const encryptionError = mapCasContentEncryptionError(error, 'asset-open');
      if (encryptionError !== null) {
        throw encryptionError;
      }
      throw error;
    }
  }

  async #openResolved(handle: AssetHandle): Promise<AsyncIterable<Uint8Array>> {
    const token = handle.toString();
    if (!OID_PATTERN.test(token)) {
      GitCasAssetHandle.parse(token);
      return this.#cas.assets.open({
        handle: token,
        ...this.#contentEncryption.toRestoreOptions(),
      });
    }
    return await this.#openLegacyReference(token);
  }

  async #openLegacyReference(oid: string): Promise<AsyncIterable<Uint8Array>> {
    let adopted: GitCasStagedAsset;
    try {
      adopted = await this.#cas.assets.adopt({ treeOid: oid });
    } catch (adoptionError) {
      rethrowUnlessLegacyReference(adoptionError);
      return await this.#openLegacyBlob(oid, adoptionError);
    }
    return this.#cas.assets.open({
      handle: adopted.handle,
      ...this.#contentEncryption.toRestoreOptions(),
    });
  }

  async #openLegacyBlob(oid: string, adoptionError: unknown): Promise<AsyncIterable<Uint8Array>> {
    if (!this.#compatibilityPolicy.legacyContentBlobReads) {
      throw new PersistenceError(
        `Legacy raw blob reads require the substrate migration compatibility policy: ${oid}`,
        'E_LEGACY_SUBSTRATE_DISABLED',
        { context: { oid } },
      );
    }
    const bytes = await this.#readLegacyCandidate(oid, adoptionError);
    return singleChunk(bytes);
  }

  async #readLegacyCandidate(oid: string, cause: unknown): Promise<Uint8Array> {
    const bytes = await this.#tryReadLegacyBlob(oid);
    if (bytes !== null) {
      return bytes;
    }
    throw missingObject(oid, cause);
  }

  async #tryReadLegacyBlob(oid: string): Promise<Uint8Array | null> {
    try {
      const bytes = await this.#legacyReader.readBlob(oid);
      return bytes ?? null;
    } catch (error) {
      rethrowUnexpectedLegacyReadError(error);
      return null;
    }
  }
}

function rethrowUnexpectedLegacyReadError(error: unknown): void {
  if (!(error instanceof PersistenceError) || error.code !== PersistenceError.E_MISSING_OBJECT) {
    throw error;
  }
}

function rethrowUnlessLegacyReference(error: unknown): void {
  if (!LEGACY_REFERENCE_CODES.has(errorCode(error))) {
    throw error;
  }
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : '';
  }
  return '';
}

function missingObject(oid: string, cause: unknown): PersistenceError {
  return new PersistenceError(
    `Missing Git object: ${oid}`,
    PersistenceError.E_MISSING_OBJECT,
    cause instanceof Error ? { context: { oid }, cause } : { context: { oid } },
  );
}

function stagedAsset(staged: GitCasStagedAsset): StagedAsset {
  return Object.freeze({
    handle: new AssetHandle(staged.handle.toString()),
    size: staged.asset.size,
    observedAt: staged.observedAt,
    retention: Object.freeze({
      reachability: staged.retention.reachability,
      protection: staged.retention.protection,
    }),
  });
}

function singleChunk(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  return WarpStream.from([bytes]);
}
