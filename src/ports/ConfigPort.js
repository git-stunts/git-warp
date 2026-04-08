import WarpError from '../domain/errors/WarpError.ts';

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
   * @param {string} _key - The config key to read (e.g., 'warp.writerId.events')
   * @returns {Promise<string|null>} The config value, or null if not set
   * @throws {WarpError} If not implemented by a concrete adapter
   */
  async configGet(_key) {
    throw new WarpError('ConfigPort.configGet() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Sets a git config value.
   * @param {string} _key - The config key to set (e.g., 'warp.writerId.events')
   * @param {string} _value - The value to set
   * @returns {Promise<void>}
   * @throws {WarpError} If not implemented by a concrete adapter
   */
  async configSet(_key, _value) {
    throw new WarpError('ConfigPort.configSet() not implemented', 'E_NOT_IMPLEMENTED');
  }
}
