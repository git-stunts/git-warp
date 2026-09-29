/**
 * The node whose presence in `nodeAlive` governs a node property register.
 *
 * @module domain/services/state/NodePropertyOwner
 */
export default class NodePropertyOwner {
  /** The node id as `nodeAlive` stores it. */
  readonly nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    Object.freeze(this);
  }
}
