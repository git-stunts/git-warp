import GraphAttachmentSetOp from './GraphAttachmentSetOp.ts';
import GraphEdgeRecordSetOp from './GraphEdgeRecordSetOp.ts';
import GraphNodeRecordSetOp from './GraphNodeRecordSetOp.ts';
import WarpError from '../errors/WarpError.ts';
import type { GraphOperation } from './GraphOperation.ts';

export type GraphOpAlgebraFields = {
  readonly operations: readonly GraphOperation[];
};

/** Immutable graph-operation algebra over node, edge, and attachment records. */
export default class GraphOpAlgebra {
  readonly operations: readonly GraphOperation[];

  constructor(fields: GraphOpAlgebraFields) {
    const checkedFields = requireFields(fields);
    this.operations = requireOperations(checkedFields.operations);
    Object.freeze(this);
  }
}

/** Validates the graph-op algebra constructor envelope. */
function requireFields(fields: GraphOpAlgebraFields | null | undefined): GraphOpAlgebraFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphOpAlgebra fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a frozen list of runtime-backed graph operations. */
function requireOperations(
  operations: readonly GraphOperation[] | null | undefined,
): readonly GraphOperation[] {
  if (!Array.isArray(operations)) {
    throw new WarpError('GraphOpAlgebra operations must be an array', 'E_VALIDATION');
  }
  const checkedOperations: GraphOperation[] = [];
  for (const operation of operations) {
    checkedOperations.push(requireOperation(operation));
  }
  return Object.freeze(checkedOperations);
}

/** Requires a supported graph operation instance. */
function requireOperation(operation: GraphOperation): GraphOperation {
  if (
    operation instanceof GraphNodeRecordSetOp
    || operation instanceof GraphEdgeRecordSetOp
    || operation instanceof GraphAttachmentSetOp
  ) {
    return operation;
  }
  throw new WarpError('GraphOpAlgebra operation must be a graph operation instance', 'E_VALIDATION');
}
