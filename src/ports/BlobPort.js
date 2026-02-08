/**
 * Port for Git blob operations.
 *
 * Defines the contract for writing and reading Git blob objects.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @abstract
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */
export default class BlobPort {
  /**
   * Writes content as a Git blob and returns its OID.
   * @param {Buffer|string} content - The blob content to write
   * @returns {Promise<string>} The Git OID of the created blob
   * @throws {Error} If not implemented by a concrete adapter
   */
  async writeBlob(_content) {
    throw new Error('BlobPort.writeBlob() not implemented');
  }

  /**
   * Reads the content of a Git blob.
   * @param {string} oid - The blob OID to read
   * @returns {Promise<Buffer>} The blob content
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readBlob(_oid) {
    throw new Error('BlobPort.readBlob() not implemented');
  }
}
