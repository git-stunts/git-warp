import ORSet from '../../crdt/ORSet.ts';
import WarpError from '../../errors/WarpError.ts';

/** Owners held before this GC cycle; absence alone is not evidence of removal. */
export default class PropertySweepCandidates {
  readonly #nodes: ReadonlySet<string>;
  readonly #edges: ReadonlySet<string>;

  constructor(nodeAlive: ORSet, edgeAlive: ORSet) {
    if (!(nodeAlive instanceof ORSet) || !(edgeAlive instanceof ORSet)) {
      throw new WarpError('Property sweep candidates require ORSets', 'E_GC_INVALID_STATE');
    }
    this.#nodes = new Set([...nodeAlive.entriesIter()].map(([owner]) => owner));
    this.#edges = new Set([...edgeAlive.entriesIter()].map(([owner]) => owner));
    Object.freeze(this);
  }

  heldNode(nodeId: string): boolean {
    return this.#nodes.has(nodeId);
  }

  heldEdge(edgeKey: string): boolean {
    return this.#edges.has(edgeKey);
  }
}
