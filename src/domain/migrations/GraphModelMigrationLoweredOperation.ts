import GraphModelMigrationPlannedGraphOperation, {
  type GraphModelMigrationPlannedGraphOperationKind,
} from './GraphModelMigrationPlannedGraphOperation.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationLoweredOperationFields = {
  readonly kind: GraphModelMigrationPlannedGraphOperationKind;
  readonly sourceKey: string;
  readonly targetKey: string;
};

/** Runtime-backed write-ready migration operation fact. */
export default class GraphModelMigrationLoweredOperation {
  readonly kind: GraphModelMigrationPlannedGraphOperationKind;
  readonly sourceKey: string;
  readonly targetKey: string;

  constructor(fields: GraphModelMigrationLoweredOperationFields) {
    const checkedFields = requireFields(fields);
    const planned = new GraphModelMigrationPlannedGraphOperation({
      kind: checkedFields.kind,
      sourceKey: checkedFields.sourceKey,
      targetKey: checkedFields.targetKey,
    });
    this.kind = planned.kind;
    this.sourceKey = planned.sourceKey;
    this.targetKey = planned.targetKey;
    Object.freeze(this);
  }

  /** Lowers a planned dry-run fact into a write-ready operation fact. */
  static fromPlanned(
    operation: GraphModelMigrationPlannedGraphOperation,
  ): GraphModelMigrationLoweredOperation {
    if (!(operation instanceof GraphModelMigrationPlannedGraphOperation)) {
      throw new WarpError('operation must be a planned graph operation', 'E_VALIDATION');
    }
    return new GraphModelMigrationLoweredOperation({
      kind: operation.kind,
      sourceKey: operation.sourceKey,
      targetKey: operation.targetKey,
    });
  }

  /** Returns a deterministic operation key for ordering and dedupe. */
  toKey(): string {
    return `lowered\0${this.kind}\0${this.sourceKey}\0${this.targetKey}`;
  }
}

function requireFields(
  fields: GraphModelMigrationLoweredOperationFields | null | undefined,
): GraphModelMigrationLoweredOperationFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationLoweredOperation fields must be provided', 'E_VALIDATION');
  }
  return fields;
}
