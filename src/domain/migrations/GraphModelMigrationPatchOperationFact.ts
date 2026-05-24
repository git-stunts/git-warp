import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationPatchOperationFactFields = {
  readonly operationIndex: number;
  readonly operationKind: string;
  readonly operationKey: string;
};

/** Runtime-backed legacy patch operation boundary for migration history input. */
export default class GraphModelMigrationPatchOperationFact {
  readonly operationIndex: number;
  readonly operationKind: string;
  readonly operationKey: string;

  constructor(fields: GraphModelMigrationPatchOperationFactFields) {
    const checkedFields = requireFields(fields);
    this.operationIndex = requireOperationIndex(checkedFields.operationIndex);
    this.operationKind = requireNonEmptyString(checkedFields.operationKind, 'operationKind');
    this.operationKey = requireNonEmptyString(checkedFields.operationKey, 'operationKey');
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationPatchOperationFactFields | null | undefined,
): GraphModelMigrationPatchOperationFactFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationPatchOperationFact fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates a deterministic operation index. */
function requireOperationIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WarpError('operationIndex must be a non-negative safe integer', 'E_VALIDATION');
  }
  return value;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
