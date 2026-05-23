import NodeRecord from './NodeRecord.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_NODE_RECORD_SET_OP = 'GraphNodeRecordSet';

export type GraphNodeRecordSetOpFields = {
  readonly record: NodeRecord;
};

/** Runtime-backed graph operation that records a node skeleton. */
export default class GraphNodeRecordSetOp {
  readonly type = GRAPH_NODE_RECORD_SET_OP;
  readonly record: NodeRecord;

  constructor(fields: GraphNodeRecordSetOpFields) {
    const checkedFields = requireFields(fields);
    this.record = requireNodeRecord(checkedFields.record);
    Object.freeze(this);
  }
}

/** Validates the graph-node operation constructor envelope. */
function requireFields(
  fields: GraphNodeRecordSetOpFields | null | undefined,
): GraphNodeRecordSetOpFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphNodeRecordSetOp fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed node record. */
function requireNodeRecord(record: NodeRecord): NodeRecord {
  if (!(record instanceof NodeRecord)) {
    throw new WarpError('GraphNodeRecordSetOp record must be a NodeRecord', 'E_VALIDATION');
  }
  return record;
}
