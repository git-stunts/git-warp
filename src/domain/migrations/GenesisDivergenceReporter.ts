import GenesisDivergenceReport from './GenesisDivergenceReport.ts';
import GenesisEquivalenceProofFailure from './GenesisEquivalenceProofFailure.ts';
import WarpError from '../errors/WarpError.ts';

/** Selects the first deterministic divergence from a failed equivalence proof. */
export default class GenesisDivergenceReporter {
  /** Reports the first structured mismatch in a failed proof. */
  report(failure: GenesisEquivalenceProofFailure): GenesisDivergenceReport {
    const checkedFailure = requireFailure(failure);
    const firstMismatch = checkedFailure.mismatches[0];
    if (firstMismatch === undefined) {
      throw new WarpError('failure must contain at least one mismatch', 'E_VALIDATION');
    }
    return GenesisDivergenceReport.fromMismatch(firstMismatch);
  }
}

/** Requires a proof failure instance. */
function requireFailure(failure: GenesisEquivalenceProofFailure): GenesisEquivalenceProofFailure {
  if (!(failure instanceof GenesisEquivalenceProofFailure)) {
    throw new WarpError('failure must be a GenesisEquivalenceProofFailure', 'E_VALIDATION');
  }
  return failure;
}
