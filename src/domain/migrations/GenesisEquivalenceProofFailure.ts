import { compareStrings } from '../utils/StringComparison.ts';
import GenesisEquivalenceComparisonBasis from './GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceMismatch from './GenesisEquivalenceMismatch.ts';
import GenesisEquivalenceProofSummary from './GenesisEquivalenceProofSummary.ts';
import WarpError from '../errors/WarpError.ts';

export type GenesisEquivalenceProofFailureFields = {
  readonly basis: GenesisEquivalenceComparisonBasis;
  readonly summary: GenesisEquivalenceProofSummary;
  readonly mismatches: readonly GenesisEquivalenceMismatch[];
};

/** Runtime-backed failed genesis replay equivalence result. */
export default class GenesisEquivalenceProofFailure {
  readonly basis: GenesisEquivalenceComparisonBasis;
  readonly summary: GenesisEquivalenceProofSummary;
  readonly mismatches: readonly GenesisEquivalenceMismatch[];

  constructor(fields: GenesisEquivalenceProofFailureFields) {
    const checkedFields = requireFields(fields);
    this.basis = requireBasis(checkedFields.basis);
    this.summary = requireSummary(checkedFields.summary);
    this.mismatches = freezeMismatches(checkedFields.mismatches);
    requireSummaryMatchesFailure(this.basis, this.summary, this.mismatches);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisEquivalenceProofFailureFields | null | undefined,
): GenesisEquivalenceProofFailureFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceProofFailure fields must be provided', 'E_VALIDATION');
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

/** Validates and freezes mismatches in deterministic order. */
function freezeMismatches(
  mismatches: readonly GenesisEquivalenceMismatch[],
): readonly GenesisEquivalenceMismatch[] {
  const checked = requireArray(mismatches, 'mismatches').map(requireMismatch);
  if (checked.length === 0) {
    throw new WarpError('failed proof results must contain mismatches', 'E_VALIDATION');
  }
  return Object.freeze([...checked].sort(compareMismatches));
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GenesisEquivalenceProofFailure ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Requires a mismatch instance. */
function requireMismatch(mismatch: GenesisEquivalenceMismatch): GenesisEquivalenceMismatch {
  if (!(mismatch instanceof GenesisEquivalenceMismatch)) {
    throw new WarpError('mismatches must contain GenesisEquivalenceMismatch instances', 'E_VALIDATION');
  }
  return mismatch;
}

/** Requires summary and failure evidence to agree. */
function requireSummaryMatchesFailure(
  basis: GenesisEquivalenceComparisonBasis,
  summary: GenesisEquivalenceProofSummary,
  mismatches: readonly GenesisEquivalenceMismatch[],
): void {
  if (summary.basis.toKey() !== basis.toKey()) {
    throw new WarpError('summary basis must match failure basis', 'E_VALIDATION');
  }
  if (summary.mismatchCount !== mismatches.length) {
    throw new WarpError('failure summary mismatch count must match mismatches', 'E_VALIDATION');
  }
}

/** Compares mismatches deterministically. */
function compareMismatches(left: GenesisEquivalenceMismatch, right: GenesisEquivalenceMismatch): number {
  return compareStrings(left.toKey(), right.toKey());
}
