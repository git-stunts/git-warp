import assetByteLength from './assetByteLength.ts';
import requireAssetByteChunk from './requireAssetByteChunk.ts';
import WarpError from '../errors/WarpError.ts';

const INITIAL_CAPACITY = 1024;

/** Explicit allocation budget for a small, eagerly decoded artifact. */
export default class BoundedByteCollector {
  readonly #maxBytes: number;

  constructor(maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
      throw collectionLimit('Collection requires a non-negative safe integer byte limit', maxBytes);
    }
    this.#maxBytes = maxBytes;
    Object.freeze(this);
  }

  async collect(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    let bytes: Uint8Array = new Uint8Array();
    let length = 0;
    for await (const inputChunk of source) {
      const chunk = requireAssetByteChunk(inputChunk);
      const chunkBytes = assetByteLength(chunk);
      if (chunkBytes > this.#maxBytes - length) {
        throw collectionLimit('Byte collection exceeds its explicit limit; use streaming assets', this.#maxBytes);
      }
      bytes = this.#grow(bytes, length + chunkBytes);
      bytes.set(chunk, length);
      length += chunkBytes;
    }
    return length === bytes.byteLength ? bytes : bytes.slice(0, length);
  }

  #grow(bytes: Uint8Array, needed: number): Uint8Array {
    if (needed <= bytes.byteLength) { return bytes; }
    const capacity = Math.min(this.#maxBytes, Math.max(INITIAL_CAPACITY, bytes.byteLength * 2, needed));
    const grown = new Uint8Array(capacity);
    grown.set(bytes);
    return grown;
  }
}

function collectionLimit(message: string, maxBytes: number): WarpError {
  return new WarpError(message, 'E_BYTE_COLLECTION_LIMIT', { context: { maxBytes } });
}
