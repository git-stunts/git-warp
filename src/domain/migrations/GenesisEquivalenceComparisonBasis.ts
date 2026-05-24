import GraphModelMigrationBasis from './GraphModelMigrationBasis.ts';
import WarpError from '../errors/WarpError.ts';

export type GenesisEquivalenceComparisonBasisFields = {
  readonly legacyBasis: GraphModelMigrationBasis;
  readonly migratedBasis: GraphModelMigrationBasis;
};

/** Runtime-backed basis pair for a genesis replay equivalence proof. */
export default class GenesisEquivalenceComparisonBasis {
  readonly legacyBasis: GraphModelMigrationBasis;
  readonly migratedBasis: GraphModelMigrationBasis;

  constructor(fields: GenesisEquivalenceComparisonBasisFields) {
    const checkedFields = requireFields(fields);
    this.legacyBasis = requireBasis(checkedFields.legacyBasis, 'legacyBasis');
    this.migratedBasis = requireBasis(checkedFields.migratedBasis, 'migratedBasis');
    Object.freeze(this);
  }

  /** Returns a deterministic basis pair key. */
  toKey(): string {
    return `${this.legacyBasis.toKey()}\0${this.migratedBasis.toKey()}`;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GenesisEquivalenceComparisonBasisFields | null | undefined,
): GenesisEquivalenceComparisonBasisFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceComparisonBasis fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a migration basis instance. */
function requireBasis(basis: GraphModelMigrationBasis, label: string): GraphModelMigrationBasis {
  if (!(basis instanceof GraphModelMigrationBasis)) {
    throw new WarpError(`${label} must be a GraphModelMigrationBasis`, 'E_VALIDATION');
  }
  return basis;
}
