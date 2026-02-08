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
   * @param {string} ref - The ref name (e.g., 'refs/warp/events/writers/alice')
   * @param {string} oid - The OID to point to
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async updateRef(_ref, _oid) {
    throw new Error('RefPort.updateRef() not implemented');
  }

  /**
   * Reads the OID a ref points to.
   * @param {string} ref - The ref name
   * @returns {Promise<string|null>} The OID, or null if the ref does not exist
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readRef(_ref) {
    throw new Error('RefPort.readRef() not implemented');
  }

  /**
   * Deletes a ref.
   * @param {string} ref - The ref name to delete
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async deleteRef(_ref) {
    throw new Error('RefPort.deleteRef() not implemented');
  }
}
