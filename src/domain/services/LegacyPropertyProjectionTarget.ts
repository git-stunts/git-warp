import {
  EDGE_PROP_PREFIX,
  FIELD_SEPARATOR,
} from './KeyCodec.ts';

export type LegacyEdgePropertyProjectionTarget = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

/** Returns true when a public node-property projection target can be a graph node id. */
export function isLegacyNodePropertyProjectionTarget(nodeId: string): boolean {
  return isLegacyNodeSegment(nodeId);
}

/** Returns true when a public edge-property projection target can be a graph edge identity. */
export function isLegacyEdgePropertyProjectionTarget(
  edge: LegacyEdgePropertyProjectionTarget,
): boolean {
  return isLegacyNodeSegment(edge.from)
    && isLegacyNodeSegment(edge.to)
    && isLegacyEdgeTypeSegment(edge.label);
}

/** Returns true for a node-id segment that runtime graph records can represent. */
function isLegacyNodeSegment(value: string): boolean {
  return isNonEmptyLegacySegment(value) && !value.startsWith(EDGE_PROP_PREFIX);
}

/** Returns true for an edge-type segment that runtime graph records can represent. */
function isLegacyEdgeTypeSegment(value: string): boolean {
  return isNonEmptyLegacySegment(value);
}

/** Returns true for a non-empty legacy segment without key separators. */
function isNonEmptyLegacySegment(value: string): boolean {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes(FIELD_SEPARATOR);
}
