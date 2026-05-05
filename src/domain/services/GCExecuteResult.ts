/**
 * GCExecuteResult — immutable summary of an executeGC run.
 *
 * @module domain/services/GCExecuteResult
 */

export default class GCExecuteResult {
  /** Number of node entries compacted out of `nodeAlive`. */
  readonly nodesCompacted: number;

  /** Number of edge entries compacted out of `edgeAlive`. */
  readonly edgesCompacted: number;

  /** Total tombstones removed across both alive sets. */
  readonly tombstonesRemoved: number;

  constructor(fields: {
    readonly nodesCompacted: number;
    readonly edgesCompacted: number;
    readonly tombstonesRemoved: number;
  }) {
    this.nodesCompacted = fields.nodesCompacted;
    this.edgesCompacted = fields.edgesCompacted;
    this.tombstonesRemoved = fields.tombstonesRemoved;
    Object.freeze(this);
  }
}
