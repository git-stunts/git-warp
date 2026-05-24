import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationContentMappingFields = {
  readonly legacyContentKey: string;
  readonly targetAttachmentKey: string;
};

/** Runtime-backed mapping from a legacy content property to a planned attachment fact. */
export default class GraphModelMigrationContentMapping {
  readonly legacyContentKey: string;
  readonly targetAttachmentKey: string;

  constructor(fields: GraphModelMigrationContentMappingFields) {
    const checkedFields = requireFields(fields);
    this.legacyContentKey = requireNonEmptyString(checkedFields.legacyContentKey, 'legacyContentKey');
    this.targetAttachmentKey = requireNonEmptyString(checkedFields.targetAttachmentKey, 'targetAttachmentKey');
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationContentMappingFields | null | undefined,
): GraphModelMigrationContentMappingFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationContentMapping fields must be provided', 'E_VALIDATION');
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
