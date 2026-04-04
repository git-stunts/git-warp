import WarpError from '../domain/errors/WarpError.js';

/**
 * Port for checkpoint persistence.
 *
 * Domain-facing port that speaks WarpStateV5, VersionVector, and
 * Frontier domain objects. No bytes cross this boundary. The adapter
 * implementation owns the codec and talks to raw Git ports internally.
 *
 * This is part of the two-stage persistence boundary (P5 compliance):
 *   Domain Service → CheckpointStorePort (domain objects)
 *     → Adapter (codec + raw Git ports) → Git
 *
 * @abstract
 * @see CborCheckpointStoreAdapter - Reference implementation
 */
export default class CheckpointStorePort {
  /**
   * Persists full V5 state (ORSets + props + VV + edgeBirthEvent)
   * and returns its storage OID.
   *
   * @param {import('../domain/services/JoinReducer.js').WarpStateV5} _state
   * @returns {Promise<string>} The storage OID
   */
  async writeState(_state) {
    throw new WarpError('CheckpointStorePort.writeState() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads full V5 state by storage OID.
   *
   * @param {string} _blobOid
   * @returns {Promise<import('../domain/services/JoinReducer.js').WarpStateV5>}
   */
  async readState(_blobOid) {
    throw new WarpError('CheckpointStorePort.readState() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Persists applied version vector and returns its storage OID.
   *
   * @param {import('../domain/crdt/VersionVector.js').default} _vv
   * @returns {Promise<string>} The storage OID
   */
  async writeAppliedVV(_vv) {
    throw new WarpError('CheckpointStorePort.writeAppliedVV() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads applied version vector by storage OID.
   *
   * @param {string} _blobOid
   * @returns {Promise<import('../domain/crdt/VersionVector.js').default>}
   */
  async readAppliedVV(_blobOid) {
    throw new WarpError('CheckpointStorePort.readAppliedVV() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Persists a frontier (Map<writerId, tipSha>) and returns its
   * storage OID.
   *
   * @param {Map<string, string>} _frontier
   * @returns {Promise<string>} The storage OID
   */
  async writeFrontier(_frontier) {
    throw new WarpError('CheckpointStorePort.writeFrontier() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads a frontier by storage OID.
   *
   * @param {string} _blobOid
   * @returns {Promise<Map<string, string>>}
   */
  async readFrontier(_blobOid) {
    throw new WarpError('CheckpointStorePort.readFrontier() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Computes the SHA-256 hash of the canonical visible state projection.
   *
   * @param {import('../domain/services/JoinReducer.js').WarpStateV5} _state
   * @returns {Promise<string>} Hex-encoded SHA-256 hash
   */
  async computeStateHash(_state) {
    throw new WarpError('CheckpointStorePort.computeStateHash() not implemented', 'E_NOT_IMPLEMENTED');
  }
}
