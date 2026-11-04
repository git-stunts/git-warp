import ConeRecordError from '../../errors/ConeRecordError.ts';
import ConeFrontier from './ConeFrontier.ts';
import ConeRoot from './ConeRoot.ts';

/**
 * A cone basis: the record trie root and the writer frontier whose patches
 * it folds. Derived and clone-local, like a checkpoint head: it is never
 * transferred and can be rebuilt from writer chains.
 */
export default class ConeBasis {
  readonly root: ConeRoot;
  readonly frontier: ConeFrontier;

  constructor(root: ConeRoot, frontier: ConeFrontier) {
    if (!(root instanceof ConeRoot) || !(frontier instanceof ConeFrontier)) {
      throw new ConeRecordError('Cone basis needs a root and a frontier');
    }
    this.root = root;
    this.frontier = frontier;
    Object.freeze(this);
  }

  /** The basis of a clone that has folded nothing. */
  static empty(): ConeBasis {
    return new ConeBasis(ConeRoot.empty(), ConeFrontier.empty());
  }

  /** The patch each writer's chain is folded up to, by writer id. */
  writerHeads(): ReadonlyMap<string, string> {
    return new Map(this.frontier.entries().map(([writerId, position]) => [writerId, position.sha]));
  }

  equals(other: ConeBasis): boolean {
    return other.root.equals(this.root) && other.frontier.equals(this.frontier);
  }
}
