import type { BlobStorageOptions } from './BlobStoragePort.ts';
import IndexStoragePort from './IndexStoragePort.ts';

/**
 * Stronger index-storage seam for streaming rebuild paths.
 *
 * `IndexStoragePort` is enough for bounded single-blob reads and writes.
 * Streaming rebuild paths need a stronger contract: blob payloads can be
 * written and read as async byte streams without forcing a whole-blob buffer
 * step in the domain layer.
 */
export default abstract class StreamingIndexStoragePort extends IndexStoragePort {
  /** Writes blob content from a stream and returns the resulting OID. */
  abstract writeBlobStream(
    _source: AsyncIterable<Uint8Array>,
    _options?: BlobStorageOptions,
  ): Promise<string>;

  /** Reads blob content as a stream of byte chunks. */
  abstract readBlobStream(_oid: string): AsyncIterable<Uint8Array>;
}
