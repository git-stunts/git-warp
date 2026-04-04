import WarpError from '../domain/errors/WarpError.js';

/**
 * @typedef {{
 *   state: import('../domain/services/JoinReducer.js').WarpStateV5,
 *   frontier: Map<string, string>,
 *   appliedVV: import('../domain/crdt/VersionVector.js').default,
 *   stateHash: string,
 *   provenanceIndex?: import('../domain/services/provenance/ProvenanceIndex.js').ProvenanceIndex | null,
 * }} CheckpointRecord
 */

/**
 * @typedef {{
 *   treeOid: string,
 *   stateBlobOid: string,
 *   frontierBlobOid: string,
 *   appliedVVBlobOid: string,
 *   provenanceIndexBlobOid: string | null,
 * }} CheckpointWriteResult
 */

/**
 * @typedef {{
 *   state: import('../domain/services/JoinReducer.js').WarpStateV5,
 *   frontier: Map<string, string>,
 *   appliedVV: import('../domain/crdt/VersionVector.js').default | null,
 *   stateHash: string,
 *   schema: number,
 *   provenanceIndex?: import('../domain/services/provenance/ProvenanceIndex.js').ProvenanceIndex | null,
 *   indexShardOids: Record<string, string> | null,
 * }} CheckpointData
 */

/**
 * Port for checkpoint persistence.
 *
 * A checkpoint is one domain event with multiple persistence artifacts.
 * The port speaks one semantic operation (writeCheckpoint, readCheckpoint),
 * not individual blob writes. The adapter internally fans artifacts out
 * through the stream pipeline.
 *
 * @abstract
 * @see CborCheckpointStoreAdapter - Reference implementation
 */
export default class CheckpointStorePort {
  /**
   * Persists a complete checkpoint and returns write results.
   *
   * The adapter internally encodes and writes state, frontier,
   * appliedVV (and optionally provenanceIndex) as separate blobs,
   * assembles a Git tree, and returns the OIDs.
   *
   * @param {CheckpointRecord} _record - The checkpoint artifacts to persist
   * @returns {Promise<CheckpointWriteResult>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async writeCheckpoint(_record) {
    throw new WarpError('CheckpointStorePort.writeCheckpoint() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads a checkpoint from a tree of OIDs.
   *
   * @param {Record<string, string>} _treeOids - Map of path → blob OID from the checkpoint tree
   * @returns {Promise<CheckpointData>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  async readCheckpoint(_treeOids) {
    throw new WarpError('CheckpointStorePort.readCheckpoint() not implemented', 'E_NOT_IMPLEMENTED');
  }
}
