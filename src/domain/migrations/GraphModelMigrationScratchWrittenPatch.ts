import GraphModelMigrationLoweredOperation from './GraphModelMigrationLoweredOperation.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationScratchWrittenPatchFields = {
  readonly commitId: string;
  readonly operation: GraphModelMigrationLoweredOperation;
  readonly sequence: number;
};

/** One scratch-history commit written for a lowered migration operation. */
export default class GraphModelMigrationScratchWrittenPatch {
  readonly commitId: string;
  readonly operation: GraphModelMigrationLoweredOperation;
  readonly sequence: number;

  constructor(fields: GraphModelMigrationScratchWrittenPatchFields) {
    const checkedFields = requireFields(fields);
    this.commitId = requireNonEmptyString(checkedFields.commitId, 'commitId');
    this.operation = requireOperation(checkedFields.operation);
    this.sequence = requireNonNegativeInteger(checkedFields.sequence, 'sequence');
    Object.freeze(this);
  }

  /** Returns the deterministic lowered operation key carried by this commit. */
  operationKey(): string {
    return this.operation.toKey();
  }
}

function requireFields(
  fields: GraphModelMigrationScratchWrittenPatchFields | null | undefined,
): GraphModelMigrationScratchWrittenPatchFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationScratchWrittenPatch fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireOperation(
  operation: GraphModelMigrationLoweredOperation,
): GraphModelMigrationLoweredOperation {
  if (!(operation instanceof GraphModelMigrationLoweredOperation)) {
    throw new WarpError('operation must be a GraphModelMigrationLoweredOperation', 'E_VALIDATION');
  }
  return operation;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError(`${name} must be a non-negative integer`, 'E_VALIDATION');
  }
  return value;
}
