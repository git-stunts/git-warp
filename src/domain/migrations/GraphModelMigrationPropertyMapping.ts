import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationPropertyMappingFields = {
  readonly legacyOwnerId: string;
  readonly legacyPropertyKey: string;
  readonly targetOwnerId: string;
  readonly targetPropertyKey: string;
};

/** Runtime-backed mapping from a legacy property fact to a planned target property fact. */
export default class GraphModelMigrationPropertyMapping {
  readonly legacyOwnerId: string;
  readonly legacyPropertyKey: string;
  readonly targetOwnerId: string;
  readonly targetPropertyKey: string;

  constructor(fields: GraphModelMigrationPropertyMappingFields) {
    const checkedFields = requireFields(fields);
    this.legacyOwnerId = requireNonEmptyString(checkedFields.legacyOwnerId, 'legacyOwnerId');
    this.legacyPropertyKey = requireNonEmptyString(checkedFields.legacyPropertyKey, 'legacyPropertyKey');
    this.targetOwnerId = requireNonEmptyString(checkedFields.targetOwnerId, 'targetOwnerId');
    this.targetPropertyKey = requireNonEmptyString(checkedFields.targetPropertyKey, 'targetPropertyKey');
    Object.freeze(this);
  }

  /** Returns the legacy uniqueness key. */
  legacyKey(): string {
    return `${this.legacyOwnerId}\0${this.legacyPropertyKey}`;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationPropertyMappingFields | null | undefined,
): GraphModelMigrationPropertyMappingFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationPropertyMapping fields must be provided', 'E_VALIDATION');
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
