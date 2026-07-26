import {
  AssetHandle as GitCasAssetHandle,
  type AssetCapability,
  type AssetPutOptions,
  type StagedAsset as GitCasStagedAsset,
} from '@git-stunts/git-cas';
import AssetSizeMismatchError from '../../domain/errors/AssetSizeMismatchError.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import AssetStoragePort, {
  type AssetWriteOptions,
  type StagedAsset,
} from '../../ports/AssetStoragePort.ts';
import CasContentEncryptionPolicy, {
  mapCasContentEncryptionError,
} from './CasContentEncryptionPolicy.ts';

export type GitCasAssetFacade = {
  readonly assets: AssetCapability;
};

/** Delegates immutable asset lifecycle to the high-level git-cas asset API. */
export default class GitCasAssetStorageAdapter extends AssetStoragePort {
  readonly #cas: GitCasAssetFacade;
  readonly #contentEncryption: CasContentEncryptionPolicy;

  constructor(options: {
    readonly cas: GitCasAssetFacade;
    readonly contentEncryption?: CasContentEncryptionPolicy;
  }) {
    super();
    this.#cas = options.cas;
    this.#contentEncryption = options.contentEncryption ?? CasContentEncryptionPolicy.disabled();
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
    requireExpectedSize(staged.asset.size, options.expectedSize);
    return stagedAsset(staged);
  }

  override async *open(handle: AssetHandle): AsyncIterable<Uint8Array> {
    try {
      yield* this.#openResolved(handle);
    } catch (error) {
      const encryptionError = mapCasContentEncryptionError(
        error,
        'asset-open',
        this.#contentEncryption.enabled,
      );
      if (encryptionError !== null) {
        throw encryptionError;
      }
      throw error;
    }
  }

  #openResolved(handle: AssetHandle): AsyncIterable<Uint8Array> {
    const token = handle.toString();
    GitCasAssetHandle.parse(token);
    return this.#cas.assets.open({
      handle: token,
      ...this.#contentEncryption.toRestoreOptions(),
    });
  }
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

function requireExpectedSize(actualSize: number, expectedSize: number | null | undefined): void {
  if (expectedSize !== null && expectedSize !== undefined && actualSize !== expectedSize) {
    throw new AssetSizeMismatchError(expectedSize, actualSize);
  }
}
