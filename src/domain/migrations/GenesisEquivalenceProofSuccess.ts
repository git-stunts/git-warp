import GenesisEquivalenceComparisonBasis from './GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceProofSummary from './GenesisEquivalenceProofSummary.ts';
import WarpError from '../errors/WarpError.ts';

export type GenesisEquivalenceProofSuccessFields = {
  readonly basis: GenesisEquivalenceComparisonBasis;
  readonly summary: GenesisEquivalenceProofSummary;
};

/** Runtime-backed successful genesis replay equivalence result. */
export default class GenesisEquivalenceProofSuccess {
  readonly basis: GenesisEquivalenceComparisonBasis;
  readonly summary: GenesisEquivalenceProofSummary;

  constructor(fields: GenesisEquivalenceProofSuccessFields) {
    const checkedFields = requireFields(fields);
    this.basis = requireBasis(checkedFields.basis);
    this.summary = requireSummary(checkedFields.summary);
    requireSummaryMatchesBasis(this.basis, this.summary);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisEquivalenceProofSuccessFields | null | undefined,
): GenesisEquivalenceProofSuccessFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceProofSuccess fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a comparison basis instance. */
function requireBasis(basis: GenesisEquivalenceComparisonBasis): GenesisEquivalenceComparisonBasis {
  if (!(basis instanceof GenesisEquivalenceComparisonBasis)) {
    throw new WarpError('basis must be a GenesisEquivalenceComparisonBasis', 'E_VALIDATION');
  }
  return basis;
}

/** Requires a proof summary instance. */
function requireSummary(summary: GenesisEquivalenceProofSummary): GenesisEquivalenceProofSummary {
  if (!(summary instanceof GenesisEquivalenceProofSummary)) {
    throw new WarpError('summary must be a GenesisEquivalenceProofSummary', 'E_VALIDATION');
  }
  return summary;
}

/** Requires summary and result basis identity to match. */
function requireSummaryMatchesBasis(
  basis: GenesisEquivalenceComparisonBasis,
  summary: GenesisEquivalenceProofSummary,
): void {
  if (summary.basis.toKey() !== basis.toKey()) {
    throw new WarpError('summary basis must match success basis', 'E_VALIDATION');
  }
  if (summary.mismatchCount !== 0) {
    throw new WarpError('successful proof summaries must have zero mismatches', 'E_VALIDATION');
  }
}
