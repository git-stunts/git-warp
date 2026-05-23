import EdgeRecord from './EdgeRecord.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_EDGE_RECORD_SET_OP = 'GraphEdgeRecordSet';

export type GraphEdgeRecordSetOpFields = {
  readonly record: EdgeRecord;
};

/** Runtime-backed graph operation that records an edge skeleton. */
export default class GraphEdgeRecordSetOp {
  readonly type = GRAPH_EDGE_RECORD_SET_OP;
  readonly record: EdgeRecord;

  constructor(fields: GraphEdgeRecordSetOpFields) {
    const checkedFields = requireFields(fields);
    this.record = requireEdgeRecord(checkedFields.record);
    Object.freeze(this);
  }
}

/** Validates the graph-edge operation constructor envelope. */
function requireFields(
  fields: GraphEdgeRecordSetOpFields | null | undefined,
): GraphEdgeRecordSetOpFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphEdgeRecordSetOp fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed edge record. */
function requireEdgeRecord(record: EdgeRecord): EdgeRecord {
  if (!(record instanceof EdgeRecord)) {
    throw new WarpError('GraphEdgeRecordSetOp record must be an EdgeRecord', 'E_VALIDATION');
  }
  return record;
}
