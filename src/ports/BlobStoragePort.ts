/**
 * Port interface for content blob storage operations.
 *
 * Abstracts how large binary content is stored and retrieved.
 * Concrete adapters may use git-cas (chunked, CDC-deduped, optionally
 * encrypted) or raw Git blobs.
 */

export interface BlobStorageOptions {
  slug?: string;
  mime?: string | null;
  size?: number | null;
}

/** Port for content blob storage operations. */
export default abstract class BlobStoragePort {
  /** Stores content and returns a storage identifier (e.g. CAS tree OID). */
  abstract store(_content: Uint8Array | string, _options?: BlobStorageOptions): Promise<string>;

  /** Retrieves content by its storage identifier. */
  abstract retrieve(_oid: string): Promise<Uint8Array>;

  /** Stores content from a streaming source and returns a storage identifier. */
  abstract storeStream(
    _source: AsyncIterable<Uint8Array>,
    _options?: BlobStorageOptions,
  ): Promise<string>;

  /** Retrieves content as an async iterable of chunks. */
  abstract retrieveStream(_oid: string): AsyncIterable<Uint8Array>;

  /** Checks if the content exists in CAS storage. */
  async has?(_oid: string): Promise<boolean> {
    return false;
  }
}
