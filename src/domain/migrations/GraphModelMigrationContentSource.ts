import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationContentSourceFields = {
  readonly legacyContentKey: string;
  readonly contentOid: string;
};

/** Runtime-backed source blob fact needed by migration planning. */
export default class GraphModelMigrationContentSource {
  readonly legacyContentKey: string;
  readonly contentOid: string;

  constructor(fields: GraphModelMigrationContentSourceFields) {
    const checkedFields = requireFields(fields);
    this.legacyContentKey = requireNonEmptyString(checkedFields.legacyContentKey, 'legacyContentKey');
    this.contentOid = requireNonEmptyString(checkedFields.contentOid, 'contentOid');
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationContentSourceFields | null | undefined,
): GraphModelMigrationContentSourceFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationContentSource fields must be provided', 'E_VALIDATION');
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
