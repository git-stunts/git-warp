import VisibleEdgePropertyRecord from './VisibleEdgePropertyRecord.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_EDGE_PROPERTY_SET_OP = 'GraphEdgePropertySet';

export type GraphEdgePropertySetOpFields = {
  readonly record: VisibleEdgePropertyRecord;
};

/** Runtime-backed graph operation for an edge property compatibility fact. */
export default class GraphEdgePropertySetOp {
  readonly type = GRAPH_EDGE_PROPERTY_SET_OP;
  readonly record: VisibleEdgePropertyRecord;

  constructor(fields: GraphEdgePropertySetOpFields) {
    const checkedFields = requireFields(fields);
    this.record = requireEdgePropertyRecord(checkedFields.record);
    Object.freeze(this);
  }
}

/** Validates the graph-edge-property operation constructor envelope. */
function requireFields(
  fields: GraphEdgePropertySetOpFields | null | undefined,
): GraphEdgePropertySetOpFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphEdgePropertySetOp fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed visible edge property record. */
function requireEdgePropertyRecord(record: VisibleEdgePropertyRecord): VisibleEdgePropertyRecord {
  if (!(record instanceof VisibleEdgePropertyRecord)) {
    throw new WarpError(
      'GraphEdgePropertySetOp record must be a VisibleEdgePropertyRecord',
      'E_VALIDATION',
    );
  }
  return record;
}
