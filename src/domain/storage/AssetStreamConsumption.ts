import AssetByteCount from './AssetByteCount.ts';
import assetByteLength from './assetByteLength.ts';
import requireAssetByteChunk from './requireAssetByteChunk.ts';
import WarpError from '../errors/WarpError.ts';
import AssetSizeExpectation from './AssetSizeExpectation.ts';

/** Single-consumption plaintext byte witness, independent of ciphertext framing. */
export default class AssetStreamConsumption {
  readonly #expectation: AssetSizeExpectation | null;
  #phase: 'fresh' | 'consuming' | 'complete' = 'fresh';
  readonly #bytes = new AssetByteCount();

  constructor(expectedSize: number | null | undefined) {
    this.#expectation = expectedSize === null || expectedSize === undefined
      ? null : new AssetSizeExpectation(expectedSize);
    Object.freeze(this);
  }

  async *stream(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
    if (this.#phase !== 'fresh') {
      throw new WarpError('Asset input can only be consumed once', 'E_ASSET_INPUT_REUSED');
    }
    this.#phase = 'consuming';
    const checked = this.#expectation === null ? source : this.#expectation.stream(source);
    for await (const inputChunk of checked) {
      const chunk = requireAssetByteChunk(inputChunk);
      const chunkBytes = assetByteLength(chunk);
      this.#bytes.add(chunkBytes);
      yield chunk;
    }
    this.#phase = 'complete';
  }

  get size(): number {
    if (this.#phase !== 'complete') {
      throw new WarpError('Storage returned before asset input completed', 'E_ASSET_INPUT_INCOMPLETE');
    }
    return this.#bytes.value;
  }

  verifyPlaintextReceipt(bytes: number): void {
    new AssetSizeExpectation(this.size).verify(bytes);
  }
}
