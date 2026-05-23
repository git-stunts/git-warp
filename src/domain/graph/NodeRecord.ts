import NodeId from './NodeId.ts';
import NodeTypeId, { DEFAULT_NODE_TYPE_ID } from './NodeTypeId.ts';
import WarpError from '../errors/WarpError.ts';

export type NodeRecordFields = {
  readonly id: NodeId;
  readonly typeId: NodeTypeId;
};

/** Runtime-backed graph substrate node record. */
export default class NodeRecord {
  readonly id: NodeId;
  readonly typeId: NodeTypeId;

  constructor(fields: NodeRecordFields) {
    const checkedFields = requireFields(fields);
    this.id = requireNodeId(checkedFields.id);
    this.typeId = requireNodeTypeId(checkedFields.typeId);
    Object.freeze(this);
  }

  /** Builds a transitional node record from a legacy string node id. */
  static fromLegacyNodeId(nodeId: string): NodeRecord {
    return new NodeRecord({
      id: new NodeId(nodeId),
      typeId: new NodeTypeId(DEFAULT_NODE_TYPE_ID),
    });
  }

  /** Compares node records by graph identity and type. */
  equals(other: NodeRecord): boolean {
    return this.id.equals(other.id) && this.typeId.equals(other.typeId);
  }
}

/** Validates the node-record constructor envelope. */
function requireFields(fields: NodeRecordFields | null | undefined): NodeRecordFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('NodeRecord fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed node id. */
function requireNodeId(value: NodeId): NodeId {
  if (!(value instanceof NodeId)) {
    throw new WarpError('NodeRecord id must be a NodeId', 'E_VALIDATION');
  }
  return value;
}

/** Requires a runtime-backed node type id. */
function requireNodeTypeId(value: NodeTypeId): NodeTypeId {
  if (!(value instanceof NodeTypeId)) {
    throw new WarpError('NodeRecord typeId must be a NodeTypeId', 'E_VALIDATION');
  }
  return value;
}
