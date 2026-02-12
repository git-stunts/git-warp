/**
 * Port for Git ref operations.
 *
 * Defines the contract for creating, reading, and deleting Git refs.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @abstract
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */
export default class RefPort {
  /**
   * Updates a ref to point to an OID.
   * @param {string} _ref - The ref name (e.g., 'refs/warp/events/writers/alice')
   * @param {string} _oid - The OID to point to
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async updateRef(_ref, _oid) {
    throw new Error('RefPort.updateRef() not implemented');
  }

  /**
   * Reads the OID a ref points to.
   * @param {string} _ref - The ref name
   * @returns {Promise<string|null>} The OID, or null if the ref does not exist
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readRef(_ref) {
    throw new Error('RefPort.readRef() not implemented');
  }

  /**
   * Deletes a ref.
   * @param {string} _ref - The ref name to delete
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async deleteRef(_ref) {
    throw new Error('RefPort.deleteRef() not implemented');
  }

  /**
   * Lists refs matching a prefix.
   * @param {string} _prefix - The ref prefix to match (e.g., 'refs/warp/events/writers/')
   * @returns {Promise<string[]>} Array of matching ref names
   * @throws {Error} If not implemented by a concrete adapter
   */
  async listRefs(_prefix) {
    throw new Error('RefPort.listRefs() not implemented');
  }

  /**
   * Atomically updates a ref using compare-and-swap semantics.
   *
   * The ref is updated to `_newOid` only if it currently points to `_expectedOid`.
   * If `_expectedOid` is `null`, the ref must not exist (genesis CAS).
   *
   * @param {string} _ref - The ref name
   * @param {string} _newOid - The new OID to set
   * @param {string|null} _expectedOid - The expected current OID, or null if the ref must not exist
   * @returns {Promise<void>}
   * @throws {Error} If the ref does not match the expected value (CAS mismatch)
   * @throws {Error} If not implemented by a concrete adapter
   */
  async compareAndSwapRef(_ref, _newOid, _expectedOid) {
    throw new Error('RefPort.compareAndSwapRef() not implemented');
  }
}
