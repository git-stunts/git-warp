import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationStateSnapshotReferenceFields = {
  readonly snapshotId: string;
};

/** Runtime-backed reference to a collected visible-state snapshot. */
export default class GraphModelMigrationStateSnapshotReference {
  readonly snapshotId: string;

  constructor(fields: GraphModelMigrationStateSnapshotReferenceFields) {
    const checkedFields = requireFields(fields);
    this.snapshotId = requireNonEmptyString(checkedFields.snapshotId, 'snapshotId');
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationStateSnapshotReferenceFields | null | undefined,
): GraphModelMigrationStateSnapshotReferenceFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationStateSnapshotReference fields must be provided', 'E_VALIDATION');
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
