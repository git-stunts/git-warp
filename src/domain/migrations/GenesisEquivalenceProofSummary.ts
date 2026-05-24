import GenesisEquivalenceComparisonBasis from './GenesisEquivalenceComparisonBasis.ts';
import WarpError from '../errors/WarpError.ts';

export type GenesisEquivalenceProofSummaryFields = {
  readonly basis: GenesisEquivalenceComparisonBasis;
  readonly legacyFactCount: number;
  readonly migratedFactCount: number;
  readonly mismatchCount: number;
};

/** Runtime-backed summary for a genesis replay equivalence proof. */
export default class GenesisEquivalenceProofSummary {
  readonly basis: GenesisEquivalenceComparisonBasis;
  readonly legacyFactCount: number;
  readonly migratedFactCount: number;
  readonly mismatchCount: number;

  constructor(fields: GenesisEquivalenceProofSummaryFields) {
    const checkedFields = requireFields(fields);
    this.basis = requireBasis(checkedFields.basis);
    this.legacyFactCount = requireCount(checkedFields.legacyFactCount, 'legacyFactCount');
    this.migratedFactCount = requireCount(checkedFields.migratedFactCount, 'migratedFactCount');
    this.mismatchCount = requireCount(checkedFields.mismatchCount, 'mismatchCount');
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisEquivalenceProofSummaryFields | null | undefined,
): GenesisEquivalenceProofSummaryFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceProofSummary fields must be provided', 'E_VALIDATION');
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

/** Validates a non-negative count. */
function requireCount(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WarpError(`${name} must be a non-negative safe integer`, 'E_VALIDATION');
  }
  return value;
}
