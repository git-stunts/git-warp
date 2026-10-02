import {
  AssetHandle as GitCasAssetHandle,
  CasError,
  type AssetCapability,
  type AssetPutOptions,
  type StagedAsset as GitCasStagedAsset,
} from '@git-stunts/git-cas';
import AssetStreamConsumption from '../../domain/storage/AssetStreamConsumption.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import AssetStoragePort, {
  type AssetWriteOptions,
  type StagedAsset,
} from '../../ports/AssetStoragePort.ts';
import CasContentEncryptionPolicy, {
  mapCasContentEncryptionError,
} from './CasContentEncryptionPolicy.ts';

const CAS_STREAM_ERROR = 'STREAM_ERROR';

export type GitCasAssetFacade = {
  readonly assets: Pick<AssetCapability, 'put' | 'open'>;
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
    const consumption = new AssetStreamConsumption(options.expectedSize);
    const putOptions: AssetPutOptions = {
      source: consumption.stream(source),
      slug: options.slug,
      filename: options.filename ?? 'content',
      ...this.#contentEncryption.toStoreOptions(),
    };
    const staged = await putAsset(this.#cas, putOptions);
    if (!this.#contentEncryption.enabled) { consumption.verifyPlaintextReceipt(staged.asset.size); }
    return stagedAsset(staged, consumption.size);
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

/** Restores an explicitly wrapped producer failure without parsing storage error messages. */
async function putAsset(cas: GitCasAssetFacade, options: AssetPutOptions): Promise<GitCasStagedAsset> {
  try {
    return await cas.assets.put(options);
  } catch (error) {
    if (error instanceof CasError && error.code === CAS_STREAM_ERROR) {
      const original = error.meta['originalError'];
      if (original instanceof Error) { throw original; }
    }
    throw error;
  }
}

function stagedAsset(staged: GitCasStagedAsset, plaintextSize: number): StagedAsset {
  return Object.freeze({
    handle: new AssetHandle(staged.handle.toString()),
    size: plaintextSize,
    observedAt: staged.observedAt,
    retention: Object.freeze({
      reachability: staged.retention.reachability,
      protection: staged.retention.protection,
    }),
  });
}
