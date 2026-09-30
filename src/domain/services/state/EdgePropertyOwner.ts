/**
 * The edge whose presence in `edgeAlive` governs an edge property register.
 *
 * @module domain/services/state/EdgePropertyOwner
 */
export default class EdgePropertyOwner {
  /** The encoded edge key as `edgeAlive` stores it. */
  readonly edgeKey: string;

  constructor(edgeKey: string) {
    this.edgeKey = edgeKey;
    Object.freeze(this);
  }
}
