import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationWriterChainDescriptorFields = {
  readonly writerId: string;
  readonly patchIds: readonly string[];
};

/** Runtime-backed source writer chain for graph-model migration planning. */
export default class GraphModelMigrationWriterChainDescriptor {
  readonly writerId: string;
  readonly patchIds: readonly string[];

  constructor(fields: GraphModelMigrationWriterChainDescriptorFields) {
    const checkedFields = requireFields(fields);
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.patchIds = freezePatchIds(checkedFields.patchIds);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationWriterChainDescriptorFields | null | undefined,
): GraphModelMigrationWriterChainDescriptorFields {
  if (fields === null || fields === undefined) {
    throw new WarpError(
      'GraphModelMigrationWriterChainDescriptor fields must be provided',
      'E_VALIDATION',
    );
  }
  return fields;
}

/** Validates and freezes patch ids. */
function freezePatchIds(patchIds: readonly string[]): readonly string[] {
  const checked = requireArray(patchIds, 'patchIds').map((patchId) => requireNonEmptyString(patchId, 'patchId'));
  requireUnique(checked, 'writer chain patch id');
  return Object.freeze(checked);
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GraphModelMigrationWriterChainDescriptor ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Requires no duplicate keys in a chain section. */
function requireUnique(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`GraphModelMigrationWriterChainDescriptor duplicates ${label} ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}
