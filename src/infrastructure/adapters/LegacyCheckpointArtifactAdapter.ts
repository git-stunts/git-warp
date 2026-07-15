import AssetHandle from '../../domain/storage/AssetHandle.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';

const CAS_POINTER_PREFIX = 'git-warp:cas-pointer:v1:';
const CAS_POINTER_PREFIX_BYTES = textEncode(CAS_POINTER_PREFIX);

export type LegacyCheckpointArtifactHistory = {
  readBlob(oid: string): Promise<Uint8Array>;
};

/** Reads retired checkpoint blobs and follows their optional git-cas pointer. */
export default class LegacyCheckpointArtifactAdapter {
  readonly #history: LegacyCheckpointArtifactHistory;
  readonly #assets: AssetStoragePort;

  constructor(options: {
    readonly history: LegacyCheckpointArtifactHistory;
    readonly assets: AssetStoragePort;
  }) {
    this.#history = options.history;
    this.#assets = options.assets;
  }

  async read(oid: string): Promise<Uint8Array> {
    const bytes = await this.#history.readBlob(oid);
    const assetToken = decodeLegacyCasPointer(bytes);
    if (assetToken === null) {
      return bytes;
    }
    return await collectAsyncIterable(this.#assets.open(new AssetHandle(assetToken)));
  }
}

function decodeLegacyCasPointer(bytes: Uint8Array): string | null {
  if (bytes.length < CAS_POINTER_PREFIX_BYTES.length) {
    return null;
  }
  for (let index = 0; index < CAS_POINTER_PREFIX_BYTES.length; index += 1) {
    if (bytes[index] !== CAS_POINTER_PREFIX_BYTES[index]) {
      return null;
    }
  }
  const token = textDecode(bytes).slice(CAS_POINTER_PREFIX.length);
  if (token.length === 0) {
    throw new PersistenceError(
      'Legacy checkpoint CAS pointer is empty',
      'E_CHECKPOINT_EMPTY_CAS_POINTER',
    );
  }
  return token;
}
