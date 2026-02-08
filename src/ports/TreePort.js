/**
 * Port for Git tree operations.
 *
 * Defines the contract for writing and reading Git tree objects.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @abstract
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */
export default class TreePort {
  /**
   * Creates a Git tree from mktree-formatted entries.
   * @param {string[]} entries - Lines in git mktree format (e.g., "100644 blob <oid>\t<path>")
   * @returns {Promise<string>} The Git OID of the created tree
   * @throws {Error} If not implemented by a concrete adapter
   */
  async writeTree(_entries) {
    throw new Error('TreePort.writeTree() not implemented');
  }

  /**
   * Reads a tree and returns a map of path to content.
   * @param {string} treeOid - The tree OID to read
   * @returns {Promise<Record<string, Buffer>>} Map of file path to blob content
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readTree(_treeOid) {
    throw new Error('TreePort.readTree() not implemented');
  }

  /**
   * Reads a tree and returns a map of path to blob OID.
   * Useful for lazy-loading shards without reading all blob contents.
   * @param {string} treeOid - The tree OID to read
   * @returns {Promise<Record<string, string>>} Map of file path to blob OID
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readTreeOids(_treeOid) {
    throw new Error('TreePort.readTreeOids() not implemented');
  }

  /**
   * The well-known SHA for Git's empty tree object.
   * All WARP graph commits point to this tree so that no files appear in the working directory.
   * @type {string}
   * @readonly
   */
  get emptyTree() {
    throw new Error('TreePort.emptyTree not implemented');
  }
}
