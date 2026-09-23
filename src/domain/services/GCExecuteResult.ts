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

  /** Property registers dropped because their node or edge is dead. */
  readonly propertiesPruned: number;

  constructor(fields: {
    readonly nodesCompacted: number;
    readonly edgesCompacted: number;
    readonly tombstonesRemoved: number;
    readonly propertiesPruned?: number;
  }) {
    this.nodesCompacted = fields.nodesCompacted;
    this.edgesCompacted = fields.edgesCompacted;
    this.tombstonesRemoved = fields.tombstonesRemoved;
    this.propertiesPruned = fields.propertiesPruned ?? 0;
    Object.freeze(this);
  }
}
