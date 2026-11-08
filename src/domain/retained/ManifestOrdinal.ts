import RetainedGraphError from '../errors/RetainedGraphError.ts';
import GraphOrdinal from './GraphOrdinal.ts';
import ManifestCommitment from './ManifestCommitment.ts';

/**
 * A graph ordinal pinned to the manifest that gives it meaning (#815). A
 * reference that carries an ordinal carries this, so resolving it against any
 * other manifest fails closed instead of naming an unrelated element.
 */
export default class ManifestOrdinal {
  readonly commitment: ManifestCommitment;
  readonly ordinal: GraphOrdinal;

  constructor(commitment: ManifestCommitment, ordinal: GraphOrdinal) {
    if (!(commitment instanceof ManifestCommitment) || !(ordinal instanceof GraphOrdinal)) {
      throw new RetainedGraphError('A pinned ordinal needs a manifest commitment and a graph ordinal', 'E_RETAINED_ORDINAL_INVALID');
    }
    this.commitment = commitment;
    this.ordinal = ordinal;
    Object.freeze(this);
  }
}
