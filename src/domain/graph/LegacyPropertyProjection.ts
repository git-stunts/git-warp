import EdgeRecord from './EdgeRecord.ts';
import NodeRecord from './NodeRecord.ts';
import VisibleEdgePropertyRecord from './VisibleEdgePropertyRecord.ts';
import VisibleNodePropertyRecord from './VisibleNodePropertyRecord.ts';
import WarpError from '../errors/WarpError.ts';

export type LegacyPropertyProjectionFields = {
  readonly nodeProperties: readonly VisibleNodePropertyRecord[];
  readonly edgeProperties: readonly VisibleEdgePropertyRecord[];
};

/** Runtime-backed collection of visible legacy property compatibility records. */
export default class LegacyPropertyProjection {
  readonly nodeProperties: readonly VisibleNodePropertyRecord[];
  readonly edgeProperties: readonly VisibleEdgePropertyRecord[];

  constructor(fields: LegacyPropertyProjectionFields) {
    const checkedFields = requireFields(fields);
    this.nodeProperties = requireNodeProperties(checkedFields.nodeProperties);
    this.edgeProperties = requireEdgeProperties(checkedFields.edgeProperties);
    Object.freeze(this);
  }

  /** Returns visible property records for a node owner. */
  propertiesForNode(owner: NodeRecord): readonly VisibleNodePropertyRecord[] {
    const checkedOwner = requireNodeOwner(owner);
    return Object.freeze(this.nodeProperties.filter((record) => record.owner.equals(checkedOwner)));
  }

  /** Returns visible property records for an edge owner. */
  propertiesForEdge(owner: EdgeRecord): readonly VisibleEdgePropertyRecord[] {
    const checkedOwner = requireEdgeOwner(owner);
    return Object.freeze(this.edgeProperties.filter((record) => record.owner.equals(checkedOwner)));
  }
}

/** Validates the projection constructor envelope. */
function requireFields(
  fields: LegacyPropertyProjectionFields | null | undefined,
): LegacyPropertyProjectionFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('LegacyPropertyProjection fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a node owner for projection lookup. */
function requireNodeOwner(owner: NodeRecord): NodeRecord {
  if (!(owner instanceof NodeRecord)) {
    throw new WarpError('LegacyPropertyProjection node owner must be a NodeRecord', 'E_VALIDATION');
  }
  return owner;
}

/** Requires an edge owner for projection lookup. */
function requireEdgeOwner(owner: EdgeRecord): EdgeRecord {
  if (!(owner instanceof EdgeRecord)) {
    throw new WarpError('LegacyPropertyProjection edge owner must be an EdgeRecord', 'E_VALIDATION');
  }
  return owner;
}

/** Requires immutable node property records. */
function requireNodeProperties(
  records: readonly VisibleNodePropertyRecord[],
): readonly VisibleNodePropertyRecord[] {
  if (!Array.isArray(records)) {
    throw new WarpError(
      'LegacyPropertyProjection nodeProperties must be an array',
      'E_VALIDATION',
    );
  }
  return Object.freeze(records.map((record) => requireNodeProperty(record)));
}

/** Requires immutable edge property records. */
function requireEdgeProperties(
  records: readonly VisibleEdgePropertyRecord[],
): readonly VisibleEdgePropertyRecord[] {
  if (!Array.isArray(records)) {
    throw new WarpError(
      'LegacyPropertyProjection edgeProperties must be an array',
      'E_VALIDATION',
    );
  }
  return Object.freeze(records.map((record) => requireEdgeProperty(record)));
}

/** Requires a runtime-backed visible node property record. */
function requireNodeProperty(record: VisibleNodePropertyRecord): VisibleNodePropertyRecord {
  if (!(record instanceof VisibleNodePropertyRecord)) {
    throw new WarpError(
      'LegacyPropertyProjection nodeProperties entries must be VisibleNodePropertyRecord values',
      'E_VALIDATION',
    );
  }
  return record;
}

/** Requires a runtime-backed visible edge property record. */
function requireEdgeProperty(record: VisibleEdgePropertyRecord): VisibleEdgePropertyRecord {
  if (!(record instanceof VisibleEdgePropertyRecord)) {
    throw new WarpError(
      'LegacyPropertyProjection edgeProperties entries must be VisibleEdgePropertyRecord values',
      'E_VALIDATION',
    );
  }
  return record;
}
