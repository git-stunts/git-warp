/**
 * Port for Git tree operations.
 *
 * Defines the contract for writing and reading Git tree objects.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @abstract
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */

import WarpError from '../domain/errors/WarpError.ts';

export default class TreePort {
  /**
   * Creates a Git tree from mktree-formatted entries.
   * @param {string[]} _entries - Lines in git mktree format (e.g., "100644 blob <oid>\t<path>")
   * @returns {Promise<string>} The Git OID of the created tree
   * @throws {WarpError} If not implemented by a concrete adapter
   */
  async writeTree(_entries) {
    throw new WarpError('TreePort.writeTree() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads a tree and returns a map of path to content.
   * @param {string} _treeOid - The tree OID to read
   * @returns {Promise<Record<string, Uint8Array>>} Map of file path to blob content
   * @throws {WarpError} If not implemented by a concrete adapter
   */
  async readTree(_treeOid) {
    throw new WarpError('TreePort.readTree() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads a tree and returns a map of path to blob OID.
   * Useful for lazy-loading shards without reading all blob contents.
   * @param {string} _treeOid - The tree OID to read
   * @returns {Promise<Record<string, string>>} Map of file path to blob OID
   * @throws {WarpError} If not implemented by a concrete adapter
   */
  async readTreeOids(_treeOid) {
    throw new WarpError('TreePort.readTreeOids() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * The well-known SHA for Git's empty tree object.
   * All WARP graph commits point to this tree so that no files appear in the working directory.
   * @type {string}
   * @readonly
   */
  get emptyTree() {
    throw new WarpError('TreePort.emptyTree not implemented', 'E_NOT_IMPLEMENTED');
  }
}
