import GraphAttachmentSetOp from './GraphAttachmentSetOp.ts';
import GraphContentAttachmentSetOp from './GraphContentAttachmentSetOp.ts';
import GraphEdgeRecordSetOp from './GraphEdgeRecordSetOp.ts';
import GraphEdgePropertySetOp from './GraphEdgePropertySetOp.ts';
import GraphNodeRecordSetOp from './GraphNodeRecordSetOp.ts';
import GraphNodePropertySetOp from './GraphNodePropertySetOp.ts';
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
  if (isRecordOperation(operation) || isProjectionOperation(operation)) {
    return operation;
  }
  throw new WarpError('GraphOpAlgebra operation must be a graph operation instance', 'E_VALIDATION');
}

/** Returns true when the operation is a core graph record operation. */
function isRecordOperation(operation: GraphOperation): boolean {
  return (
    operation instanceof GraphNodeRecordSetOp
    || operation instanceof GraphEdgeRecordSetOp
    || operation instanceof GraphAttachmentSetOp
  );
}

/** Returns true when the operation is a typed projection operation. */
function isProjectionOperation(operation: GraphOperation): boolean {
  return (
    operation instanceof GraphContentAttachmentSetOp
    || operation instanceof GraphNodePropertySetOp
    || operation instanceof GraphEdgePropertySetOp
  );
}
