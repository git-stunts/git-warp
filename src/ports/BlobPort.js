/**
 * Port for Git blob operations.
 *
 * Defines the contract for writing and reading Git blob objects.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @abstract
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */
import WarpError from '../domain/errors/WarpError.js';

export default class BlobPort {
  /**
   * Writes content as a Git blob and returns its OID.
   * @param {Uint8Array | string} _content - The blob content to write
   * @returns {Promise<string>} The Git OID of the created blob
   * @throws {Error} If not implemented by a concrete adapter
   */
  async writeBlob(_content) {
    throw new WarpError('BlobPort.writeBlob() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads the content of a Git blob.
   * @param {string} _oid - The blob OID to read
   * @returns {Promise<Uint8Array>} The blob content
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readBlob(_oid) {
    throw new WarpError('BlobPort.readBlob() not implemented', 'E_NOT_IMPLEMENTED');
  }
}
