import requireAssetByteChunk from './requireAssetByteChunk.ts';
import AssetSizeMismatchError from '../errors/AssetSizeMismatchError.ts';
import WarpError from '../errors/WarpError.ts';

/** An exact declared length enforced while storage consumes an asset. */
export default class AssetSizeExpectation {
  readonly #bytes: number;

  constructor(bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new WarpError('Asset size must be a non-negative safe integer', 'E_ASSET_SIZE_INVALID');
    }
    this.#bytes = bytes;
    Object.freeze(this);
  }

  /** Rejects excess bytes before forwarding a chunk; verifies EOF length. */
  async *stream(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
    let observed = 0;
    for await (const inputChunk of source) {
      const chunk = requireAssetByteChunk(inputChunk);
      const next = observed + chunk.byteLength;
      if (chunk.byteLength > this.#bytes - observed) {
        throw new AssetSizeMismatchError(this.#bytes, next);
      }
      observed = next;
      yield chunk;
    }
    this.verify(observed);
  }

  /** Also checks the storage receipt independently of producer byte counts. */
  verify(actual: number): void {
    if (actual !== this.#bytes) {
      throw new AssetSizeMismatchError(this.#bytes, actual);
    }
  }
}
