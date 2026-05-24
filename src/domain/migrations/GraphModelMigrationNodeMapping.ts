import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationNodeMappingFields = {
  readonly legacyNodeId: string;
  readonly targetNodeId: string;
};

/** Runtime-backed mapping from a legacy node id to the planned graph node id. */
export default class GraphModelMigrationNodeMapping {
  readonly legacyNodeId: string;
  readonly targetNodeId: string;

  constructor(fields: GraphModelMigrationNodeMappingFields) {
    const checkedFields = requireFields(fields);
    this.legacyNodeId = requireNonEmptyString(checkedFields.legacyNodeId, 'legacyNodeId');
    this.targetNodeId = requireNonEmptyString(checkedFields.targetNodeId, 'targetNodeId');
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationNodeMappingFields | null | undefined,
): GraphModelMigrationNodeMappingFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationNodeMapping fields must be provided', 'E_VALIDATION');
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
