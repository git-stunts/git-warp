import { compareStrings } from '../utils/StringComparison.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationPatchFrontierEvidenceFields = {
  readonly frontierKey: string;
  readonly parentPatchIds: readonly string[];
};

/** Runtime-backed patch frontier evidence for later migration equivalence checks. */
export default class GraphModelMigrationPatchFrontierEvidence {
  readonly frontierKey: string;
  readonly parentPatchIds: readonly string[];

  constructor(fields: GraphModelMigrationPatchFrontierEvidenceFields) {
    const checkedFields = requireFields(fields);
    this.frontierKey = requireNonEmptyString(checkedFields.frontierKey, 'frontierKey');
    this.parentPatchIds = freezeParentPatchIds(checkedFields.parentPatchIds);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationPatchFrontierEvidenceFields | null | undefined,
): GraphModelMigrationPatchFrontierEvidenceFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationPatchFrontierEvidence fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates and freezes parent patch ids as a deterministic set. */
function freezeParentPatchIds(parentPatchIds: readonly string[]): readonly string[] {
  const checked = requireArray(parentPatchIds, 'parentPatchIds')
    .map((patchId) => requireNonEmptyString(patchId, 'parentPatchId'));
  requireUnique(checked, 'parent patch id');
  return Object.freeze([...checked].sort(compareStrings));
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GraphModelMigrationPatchFrontierEvidence ${label} must be an array`, 'E_VALIDATION');
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

/** Requires no duplicate keys in a frontier section. */
function requireUnique(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`GraphModelMigrationPatchFrontierEvidence duplicates ${label} ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}
