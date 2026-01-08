/**
 * Port for graph persistence operations.
 */
export default class GraphPersistencePort {
  /**
   * @param {Object} options
   * @param {string} options.message
   * @param {string[]} [options.parents]
   * @param {boolean} [options.sign]
   * @returns {Promise<string>} The SHA of the new node.
   */
  async commitNode(_options) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} sha
   * @returns {Promise<string>} The raw message content.
   */
  async showNode(_sha) {
    throw new Error('Not implemented');
  }

  /**
   * @param {Object} options
   * @param {string} options.ref
   * @param {number} [options.limit]
   * @returns {Promise<string>} The raw log output.
   */
  async logNodes(_options) {
    throw new Error('Not implemented');
  }

  /**
   * @returns {string}
   */
  get emptyTree() {
    throw new Error('Not implemented');
  }
}
