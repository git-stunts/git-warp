import EdgeId from './EdgeId.ts';
import EdgeTypeId from './EdgeTypeId.ts';
import NodeId from './NodeId.ts';
import WarpError from '../errors/WarpError.ts';

const LEGACY_EDGE_ID_PREFIX = 'legacy-edge';

export type LegacyEdgeFields = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

export type EdgeRecordFields = {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly typeId: EdgeTypeId;
};

/** Runtime-backed graph substrate edge record. */
export default class EdgeRecord {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly typeId: EdgeTypeId;

  constructor(fields: EdgeRecordFields) {
    const checkedFields = requireFields(fields);
    this.id = requireEdgeId(checkedFields.id);
    this.from = requireNodeId(checkedFields.from, 'from');
    this.to = requireNodeId(checkedFields.to, 'to');
    this.typeId = requireEdgeTypeId(checkedFields.typeId);
    Object.freeze(this);
  }

  /** Builds a transitional edge record from legacy edge key fields. */
  static fromLegacyEdge(fields: LegacyEdgeFields): EdgeRecord {
    return new EdgeRecord({
      id: new EdgeId(legacyEdgeIdValue(fields)),
      from: new NodeId(fields.from),
      to: new NodeId(fields.to),
      typeId: new EdgeTypeId(fields.label),
    });
  }

  /** Compares edge records by graph identity, endpoints, and type. */
  equals(other: EdgeRecord): boolean {
    return this.id.equals(other.id)
      && this.from.equals(other.from)
      && this.to.equals(other.to)
      && this.typeId.equals(other.typeId);
  }
}

/** Returns the deterministic transitional edge id for legacy edge fields. */
function legacyEdgeIdValue(fields: LegacyEdgeFields): string {
  return [
    LEGACY_EDGE_ID_PREFIX,
    segment(fields.from),
    segment(fields.to),
    segment(fields.label),
  ].join(':');
}

/** Length-prefixes a legacy edge id segment. */
function segment(value: string): string {
  return `${value.length}:${value}`;
}

/** Validates the edge-record constructor envelope. */
function requireFields(fields: EdgeRecordFields | null | undefined): EdgeRecordFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('EdgeRecord fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed edge id. */
function requireEdgeId(value: EdgeId): EdgeId {
  if (!(value instanceof EdgeId)) {
    throw new WarpError('EdgeRecord id must be an EdgeId', 'E_VALIDATION');
  }
  return value;
}

/** Requires a runtime-backed node id for an edge endpoint. */
function requireNodeId(value: NodeId, endpointName: string): NodeId {
  if (!(value instanceof NodeId)) {
    throw new WarpError(`EdgeRecord ${endpointName} must be a NodeId`, 'E_VALIDATION');
  }
  return value;
}

/** Requires a runtime-backed edge type id. */
function requireEdgeTypeId(value: EdgeTypeId): EdgeTypeId {
  if (!(value instanceof EdgeTypeId)) {
    throw new WarpError('EdgeRecord typeId must be an EdgeTypeId', 'E_VALIDATION');
  }
  return value;
}
