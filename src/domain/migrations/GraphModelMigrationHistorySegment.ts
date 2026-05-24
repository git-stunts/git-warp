import GraphModelMigrationHistoryPatchInput from './GraphModelMigrationHistoryPatchInput.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationHistorySegmentFields = {
  readonly writerId: string;
  readonly patches: readonly GraphModelMigrationHistoryPatchInput[];
};

/** Runtime-backed ordered legacy history segment for one writer. */
export default class GraphModelMigrationHistorySegment {
  readonly writerId: string;
  readonly patches: readonly GraphModelMigrationHistoryPatchInput[];

  constructor(fields: GraphModelMigrationHistorySegmentFields) {
    const checkedFields = requireFields(fields);
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.patches = freezePatches(this.writerId, checkedFields.patches);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationHistorySegmentFields | null | undefined,
): GraphModelMigrationHistorySegmentFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationHistorySegment fields must be provided', 'E_VALIDATION');
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

/** Validates, sorts, and freezes patches in writer-chain order. */
function freezePatches(
  writerId: string,
  patches: readonly GraphModelMigrationHistoryPatchInput[],
): readonly GraphModelMigrationHistoryPatchInput[] {
  const checked = requireArray(patches, 'patches').map(requirePatchInput);
  requireAllPatchesBelongToWriter(writerId, checked);
  const sorted = [...checked].sort(comparePatches);
  requireContiguousWriterSequence(sorted);
  requireUnique(sorted.map((patch) => patch.patchId), 'patch id');
  return Object.freeze(sorted);
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GraphModelMigrationHistorySegment ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Requires a history patch input instance. */
function requirePatchInput(
  patch: GraphModelMigrationHistoryPatchInput,
): GraphModelMigrationHistoryPatchInput {
  if (!(patch instanceof GraphModelMigrationHistoryPatchInput)) {
    throw new WarpError('patches must contain history patch inputs', 'E_VALIDATION');
  }
  return patch;
}

/** Requires every patch in the segment to belong to the segment writer. */
function requireAllPatchesBelongToWriter(
  writerId: string,
  patches: readonly GraphModelMigrationHistoryPatchInput[],
): void {
  for (const patch of patches) {
    if (patch.writerId !== writerId) {
      throw new WarpError(`patch ${patch.patchId} belongs to the wrong writer`, 'E_VALIDATION');
    }
  }
}

/** Requires writer sequences to be contiguous from zero. */
function requireContiguousWriterSequence(
  patches: readonly GraphModelMigrationHistoryPatchInput[],
): void {
  patches.forEach((patch, position) => {
    if (patch.writerSequence !== position) {
      throw new WarpError('writer patch order must be contiguous per writer', 'E_VALIDATION');
    }
  });
}

/** Requires no duplicate keys in a history segment. */
function requireUnique(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`GraphModelMigrationHistorySegment duplicates ${label} ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}

/** Compares history patch inputs by writer sequence. */
function comparePatches(
  left: GraphModelMigrationHistoryPatchInput,
  right: GraphModelMigrationHistoryPatchInput,
): number {
  if (left.writerSequence < right.writerSequence) {
    return -1;
  }
  if (left.writerSequence > right.writerSequence) {
    return 1;
  }
  return 0;
}
