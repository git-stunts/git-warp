import { compareStrings } from '../utils/StringComparison.ts';
import GraphModelMigrationHistorySegment from './GraphModelMigrationHistorySegment.ts';
import WarpError from '../errors/WarpError.ts';
import type GraphModelMigrationHistoryPatchInput from './GraphModelMigrationHistoryPatchInput.ts';

export type GraphModelMigrationHistoryInputFields = {
  readonly segments: readonly GraphModelMigrationHistorySegment[];
};

/** Runtime-backed ordered legacy history input for graph-model migration. */
export default class GraphModelMigrationHistoryInput {
  readonly segments: readonly GraphModelMigrationHistorySegment[];
  readonly patches: readonly GraphModelMigrationHistoryPatchInput[];

  constructor(fields: GraphModelMigrationHistoryInputFields) {
    const checkedFields = requireFields(fields);
    this.segments = freezeSegments(checkedFields.segments);
    this.patches = freezeOrderedPatches(this.segments);
    requireFrontierEvidence(this.patches);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationHistoryInputFields | null | undefined,
): GraphModelMigrationHistoryInputFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationHistoryInput fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates, sorts, and freezes writer history segments. */
function freezeSegments(
  segments: readonly GraphModelMigrationHistorySegment[],
): readonly GraphModelMigrationHistorySegment[] {
  const checked = requireArray(segments, 'segments').map(requireSegment);
  requireUnique(checked.map((segment) => segment.writerId), 'writer segment');
  return Object.freeze([...checked].sort(compareSegments));
}

/** Flattens and freezes all patches in deterministic segment order. */
function freezeOrderedPatches(
  segments: readonly GraphModelMigrationHistorySegment[],
): readonly GraphModelMigrationHistoryPatchInput[] {
  const patches = segments.flatMap((segment) => segment.patches);
  requireUnique(patches.map((patch) => patch.patchId), 'patch id');
  return Object.freeze(patches);
}

/** Requires frontier evidence for all equivalence-ready patch inputs. */
function requireFrontierEvidence(
  patches: readonly GraphModelMigrationHistoryPatchInput[],
): void {
  for (const patch of patches) {
    if (patch.frontierEvidence === null) {
      throw new WarpError(`patch ${patch.patchId} is missing frontier evidence`, 'E_VALIDATION');
    }
  }
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GraphModelMigrationHistoryInput ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Requires a history segment instance. */
function requireSegment(segment: GraphModelMigrationHistorySegment): GraphModelMigrationHistorySegment {
  if (!(segment instanceof GraphModelMigrationHistorySegment)) {
    throw new WarpError('segments must contain history segments', 'E_VALIDATION');
  }
  return segment;
}

/** Requires no duplicate keys in history input. */
function requireUnique(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`GraphModelMigrationHistoryInput duplicates ${label} ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}

/** Compares writer segments deterministically. */
function compareSegments(
  left: GraphModelMigrationHistorySegment,
  right: GraphModelMigrationHistorySegment,
): number {
  return compareStrings(left.writerId, right.writerId);
}
