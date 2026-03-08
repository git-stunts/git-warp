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
   * @param {{ slug?: string }} [_options] - Optional metadata
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
}
