/**
 * Port for Git config operations.
 *
 * Defines the contract for reading and writing Git configuration values.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @abstract
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */
export default class ConfigPort {
  /**
   * Reads a git config value.
   * @param {string} key - The config key to read (e.g., 'warp.writerId.events')
   * @returns {Promise<string|null>} The config value, or null if not set
   * @throws {Error} If not implemented by a concrete adapter
   */
  async configGet(_key) {
    throw new Error('ConfigPort.configGet() not implemented');
  }

  /**
   * Sets a git config value.
   * @param {string} key - The config key to set (e.g., 'warp.writerId.events')
   * @param {string} value - The value to set
   * @returns {Promise<void>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async configSet(_key, _value) {
    throw new Error('ConfigPort.configSet() not implemented');
  }
}
