import GraphModelMigrationPatchFrontierEvidence from './GraphModelMigrationPatchFrontierEvidence.ts';
import GraphModelMigrationPatchOperationFact from './GraphModelMigrationPatchOperationFact.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationHistoryPatchInputFields = {
  readonly writerId: string;
  readonly patchId: string;
  readonly writerSequence: number;
  readonly frontierEvidence: GraphModelMigrationPatchFrontierEvidence | null;
  readonly operations: readonly GraphModelMigrationPatchOperationFact[];
};

/** Runtime-backed ordered legacy patch input for migration planning. */
export default class GraphModelMigrationHistoryPatchInput {
  readonly writerId: string;
  readonly patchId: string;
  readonly writerSequence: number;
  readonly frontierEvidence: GraphModelMigrationPatchFrontierEvidence | null;
  readonly operations: readonly GraphModelMigrationPatchOperationFact[];

  constructor(fields: GraphModelMigrationHistoryPatchInputFields) {
    const checkedFields = requireFields(fields);
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.patchId = requireNonEmptyString(checkedFields.patchId, 'patchId');
    this.writerSequence = requireWriterSequence(checkedFields.writerSequence);
    this.frontierEvidence = requireOptionalFrontierEvidence(checkedFields.frontierEvidence);
    this.operations = freezeOperations(checkedFields.operations);
    Object.freeze(this);
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationHistoryPatchInputFields | null | undefined,
): GraphModelMigrationHistoryPatchInputFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationHistoryPatchInput fields must be provided', 'E_VALIDATION');
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

/** Validates a deterministic per-writer sequence number. */
function requireWriterSequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WarpError('writerSequence must be a non-negative safe integer', 'E_VALIDATION');
  }
  return value;
}

/** Requires frontier evidence when present. */
function requireOptionalFrontierEvidence(
  evidence: GraphModelMigrationPatchFrontierEvidence | null,
): GraphModelMigrationPatchFrontierEvidence | null {
  if (evidence !== null && !(evidence instanceof GraphModelMigrationPatchFrontierEvidence)) {
    throw new WarpError('frontierEvidence must be a GraphModelMigrationPatchFrontierEvidence', 'E_VALIDATION');
  }
  return evidence;
}

/** Validates, sorts, and freezes patch operation facts. */
function freezeOperations(
  operations: readonly GraphModelMigrationPatchOperationFact[],
): readonly GraphModelMigrationPatchOperationFact[] {
  const checked = requireArray(operations, 'operations').map(requireOperationFact);
  const sorted = [...checked].sort(compareOperations);
  requireContiguousOperationIndexes(sorted);
  return Object.freeze(sorted);
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GraphModelMigrationHistoryPatchInput ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Requires a patch operation fact instance. */
function requireOperationFact(
  operation: GraphModelMigrationPatchOperationFact,
): GraphModelMigrationPatchOperationFact {
  if (!(operation instanceof GraphModelMigrationPatchOperationFact)) {
    throw new WarpError('operations must contain patch operation facts', 'E_VALIDATION');
  }
  return operation;
}

/** Requires operation indexes to be contiguous from zero. */
function requireContiguousOperationIndexes(
  operations: readonly GraphModelMigrationPatchOperationFact[],
): void {
  operations.forEach((operation, position) => {
    if (operation.operationIndex !== position) {
      throw new WarpError('operation indexes must be contiguous per patch', 'E_VALIDATION');
    }
  });
}

/** Compares patch operation facts by operation index. */
function compareOperations(
  left: GraphModelMigrationPatchOperationFact,
  right: GraphModelMigrationPatchOperationFact,
): number {
  if (left.operationIndex < right.operationIndex) {
    return -1;
  }
  if (left.operationIndex > right.operationIndex) {
    return 1;
  }
  return 0;
}
