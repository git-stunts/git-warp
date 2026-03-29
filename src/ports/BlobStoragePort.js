/**
 * Port interface for content blob storage operations.
 *
 * Abstracts how large binary content is stored and retrieved.
 * Concrete adapters may use git-cas (chunked, CDC-deduped, optionally
 * encrypted) or raw Git blobs.
 *
 * @abstract
 */
export default class BlobStoragePort {
  /**
   * Stores content and returns a storage identifier (e.g. CAS tree OID).
   *
   * @param {Uint8Array|string} _content - The content to store
   * @param {{ slug?: string, mime?: string|null, size?: number|null }} [_options] - Optional storage metadata
   * @returns {Promise<string>} Storage identifier for retrieval
   * @abstract
   */
  async store(_content, _options) {
    throw new Error('BlobStoragePort.store() not implemented');
  }

  /**
   * Retrieves content by its storage identifier.
   *
   * @param {string} _oid - Storage identifier returned by store()
   * @returns {Promise<Uint8Array>} The stored content
   * @abstract
   */
  async retrieve(_oid) {
    throw new Error('BlobStoragePort.retrieve() not implemented');
  }

  /**
   * Stores content from a streaming source and returns a storage identifier.
   *
   * @param {AsyncIterable<Uint8Array>} _source - Async iterable of content chunks
   * @param {{ slug?: string, mime?: string|null, size?: number|null }} [_options] - Optional storage metadata
   * @returns {Promise<string>} Storage identifier for retrieval
   * @abstract
   */
  async storeStream(_source, _options) {
    throw new Error('BlobStoragePort.storeStream() not implemented');
  }

  /**
   * Retrieves content as an async iterable of chunks.
   *
   * @param {string} _oid - Storage identifier returned by store() or storeStream()
   * @returns {AsyncIterable<Uint8Array>} Async iterable of content chunks
   * @abstract
   */
  retrieveStream(_oid) {
    throw new Error('BlobStoragePort.retrieveStream() not implemented');
  }
}
