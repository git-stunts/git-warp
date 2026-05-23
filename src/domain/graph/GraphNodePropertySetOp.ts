import VisibleNodePropertyRecord from './VisibleNodePropertyRecord.ts';
import WarpError from '../errors/WarpError.ts';

export const GRAPH_NODE_PROPERTY_SET_OP = 'GraphNodePropertySet';

export type GraphNodePropertySetOpFields = {
  readonly record: VisibleNodePropertyRecord;
};

/** Runtime-backed graph operation for a node property compatibility fact. */
export default class GraphNodePropertySetOp {
  readonly type = GRAPH_NODE_PROPERTY_SET_OP;
  readonly record: VisibleNodePropertyRecord;

  constructor(fields: GraphNodePropertySetOpFields) {
    const checkedFields = requireFields(fields);
    this.record = requireNodePropertyRecord(checkedFields.record);
    Object.freeze(this);
  }
}

/** Validates the graph-node-property operation constructor envelope. */
function requireFields(
  fields: GraphNodePropertySetOpFields | null | undefined,
): GraphNodePropertySetOpFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphNodePropertySetOp fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed visible node property record. */
function requireNodePropertyRecord(record: VisibleNodePropertyRecord): VisibleNodePropertyRecord {
  if (!(record instanceof VisibleNodePropertyRecord)) {
    throw new WarpError(
      'GraphNodePropertySetOp record must be a VisibleNodePropertyRecord',
      'E_VALIDATION',
    );
  }
  return record;
}
