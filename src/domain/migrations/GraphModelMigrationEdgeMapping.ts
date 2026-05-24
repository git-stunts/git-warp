import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationEdgeMappingFields = {
  readonly legacyEdgeId: string;
  readonly targetEdgeId: string;
};

/** Runtime-backed mapping from a legacy edge id to the planned graph edge id. */
export default class GraphModelMigrationEdgeMapping {
  readonly legacyEdgeId: string;
  readonly targetEdgeId: string;

  constructor(fields: GraphModelMigrationEdgeMappingFields) {
    const checkedFields = requireFields(fields);
    this.legacyEdgeId = requireNonEmptyString(checkedFields.legacyEdgeId, 'legacyEdgeId');
    this.targetEdgeId = requireNonEmptyString(checkedFields.targetEdgeId, 'targetEdgeId');
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationEdgeMappingFields | null | undefined,
): GraphModelMigrationEdgeMappingFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationEdgeMapping fields must be provided', 'E_VALIDATION');
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
