import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationBasisFields = {
  readonly graphId: string;
  readonly basisId: string;
};

/** Runtime-backed identity for one migration source or target basis. */
export default class GraphModelMigrationBasis {
  readonly graphId: string;
  readonly basisId: string;

  constructor(fields: GraphModelMigrationBasisFields) {
    const checkedFields = requireFields(fields);
    this.graphId = requireNonEmptyString(checkedFields.graphId, 'graphId');
    this.basisId = requireNonEmptyString(checkedFields.basisId, 'basisId');
    Object.freeze(this);
  }

  /** Returns a stable key for equality and map indexing. */
  toKey(): string {
    return `${this.graphId}\0${this.basisId}`;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationBasisFields | null | undefined,
): GraphModelMigrationBasisFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationBasis fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
