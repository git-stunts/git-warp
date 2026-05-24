import { compareStrings } from '../utils/StringComparison.ts';
import GraphModelMigrationBasis from './GraphModelMigrationBasis.ts';
import GraphModelMigrationLoweredOperation from './GraphModelMigrationLoweredOperation.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationLoweredPatchPlanFields = {
  readonly sourceBasis: GraphModelMigrationBasis;
  readonly targetBasis: GraphModelMigrationBasis;
  readonly operations: readonly GraphModelMigrationLoweredOperation[];
};

/** Frozen write-ready migration patch plan for scratch writers. */
export default class GraphModelMigrationLoweredPatchPlan {
  readonly sourceBasis: GraphModelMigrationBasis;
  readonly targetBasis: GraphModelMigrationBasis;
  readonly operations: readonly GraphModelMigrationLoweredOperation[];

  constructor(fields: GraphModelMigrationLoweredPatchPlanFields) {
    const checkedFields = requireFields(fields);
    this.sourceBasis = requireBasis(checkedFields.sourceBasis, 'sourceBasis');
    this.targetBasis = requireBasis(checkedFields.targetBasis, 'targetBasis');
    this.operations = freezeOperations(checkedFields.operations);
    Object.freeze(this);
  }

  /** Returns true when the plan has at least one lowered write fact. */
  hasOperations(): boolean {
    return this.operations.length > 0;
  }
}

function requireFields(
  fields: GraphModelMigrationLoweredPatchPlanFields | null | undefined,
): GraphModelMigrationLoweredPatchPlanFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationLoweredPatchPlan fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireBasis(basis: GraphModelMigrationBasis, name: string): GraphModelMigrationBasis {
  if (!(basis instanceof GraphModelMigrationBasis)) {
    throw new WarpError(`${name} must be a GraphModelMigrationBasis`, 'E_VALIDATION');
  }
  return basis;
}

function freezeOperations(
  operations: readonly GraphModelMigrationLoweredOperation[],
): readonly GraphModelMigrationLoweredOperation[] {
  if (!Array.isArray(operations)) {
    throw new WarpError('operations must be an array', 'E_VALIDATION');
  }
  const checked = operations.map(requireOperation);
  requireUnique(checked.map((operation) => operation.toKey()));
  return Object.freeze([...checked].sort(compareOperations));
}

function requireOperation(
  operation: GraphModelMigrationLoweredOperation,
): GraphModelMigrationLoweredOperation {
  if (!(operation instanceof GraphModelMigrationLoweredOperation)) {
    throw new WarpError('operations must contain lowered migration operations', 'E_VALIDATION');
  }
  return operation;
}

function requireUnique(keys: readonly string[]): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`GraphModelMigrationLoweredPatchPlan duplicates operation ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}

function compareOperations(
  left: GraphModelMigrationLoweredOperation,
  right: GraphModelMigrationLoweredOperation,
): number {
  return compareStrings(left.toKey(), right.toKey());
}
