/**
 * Key encoding, comparators, collectors, and summarizer for visible-state diffing.
 *
 * Pure functions — no side effects, no I/O, no classes.
 *
 * @module domain/services/comparison/diffKeys
 */

import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import type { VisibleStateNeighbor } from '../../types/VisibleStateNeighbor.ts';
import type { VisibleStateReader } from '../../types/VisibleStateReader.ts';

// ── Key encoding ────────────────────────────────────────────────────────────

/**
 * Compares two strings lexicographically, returning -1, 0, or 1.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Produces a canonical string representation of a value for equality comparison.
 */
export function valueKey(value: unknown): string {
  return canonicalStringify(value);
}

/**
 * Encodes an edge reference as a null-delimited composite key.
 */
export function edgeKey(edge: { from: string; to: string; label: string }): string {
  return `${edge.from}\0${edge.to}\0${edge.label}`;
}

/**
 * Encodes an edge property reference as a null-delimited composite key.
 */
export function edgePropKey(prop: { from: string; to: string; label: string; key: string }): string {
  return `${prop.from}\0${prop.to}\0${prop.label}\0${prop.key}`;
}

/**
 * Encodes a node property reference as a null-delimited composite key.
 */
export function nodePropKey(prop: { node: string; key: string }): string {
  return `${prop.node}\0${prop.key}`;
}

/**
 * Encodes a neighbor reference as a null-delimited composite key.
 */
export function neighborKey(neighbor: VisibleStateNeighbor): string {
  return `${neighbor.direction}\0${neighbor.nodeId}\0${neighbor.label}`;
}

// ── Comparators ─────────────────────────────────────────────────────────────

/**
 * Compares two edge references by their composite keys.
 */
export function compareEdgeRefs(
  a: { from: string; to: string; label: string },
  b: { from: string; to: string; label: string },
): number {
  return compareStrings(edgeKey(a), edgeKey(b));
}

/**
 * Compares two node property references by their composite keys.
 */
export function compareNodePropRefs(
  a: { node: string; key: string },
  b: { node: string; key: string },
): number {
  return compareStrings(nodePropKey(a), nodePropKey(b));
}

/**
 * Compares two edge property references by their composite keys.
 */
export function compareEdgePropRefs(
  a: { from: string; to: string; label: string; key: string },
  b: { from: string; to: string; label: string; key: string },
): number {
  return compareStrings(edgePropKey(a), edgePropKey(b));
}

/**
 * Compares two neighbor references by their composite keys.
 */
export function compareNeighbors(a: VisibleStateNeighbor, b: VisibleStateNeighbor): number {
  return compareStrings(neighborKey(a), neighborKey(b));
}

// ── Summarizer ──────────────────────────────────────────────────────────────

/**
 * Counts node properties for a single node via the reader.
 */
function countNodeProps(reader: VisibleStateReader, nodeId: string): number {
  const props = reader.getNodeProps(nodeId);
  return Object.keys(props ?? {}).length;
}

/**
 * Counts edge properties for a single edge record.
 */
function countEdgeProps(edge: { props?: Record<string, unknown> }): number {
  return Object.keys(edge.props ?? {}).length;
}

/**
 * Produces a summary of node/edge/property counts from a state reader.
 */
export function summarizeReader(reader: VisibleStateReader): {
  nodeCount: number;
  edgeCount: number;
  nodePropertyCount: number;
  edgePropertyCount: number;
} {
  const nodes = reader.getNodes();
  const edges = reader.getEdges();
  let nodePropertyCount = 0;
  for (const nodeId of nodes) {
    nodePropertyCount += countNodeProps(reader, nodeId);
  }
  let edgePropertyCount = 0;
  for (const edge of edges) {
    edgePropertyCount += countEdgeProps(edge);
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodePropertyCount,
    edgePropertyCount,
  };
}

// ── Collectors ──────────────────────────────────────────────────────────────

/**
 * Collects all node properties from a reader into a keyed map.
 */
export function collectNodeProperties(
  reader: VisibleStateReader,
): Map<string, { node: string; key: string; value: unknown }> {
  const entries = new Map<string, { node: string; key: string; value: unknown }>();
  for (const nodeId of reader.getNodes()) {
    const props = reader.getNodeProps(nodeId) ?? {};
    for (const [key, value] of Object.entries(props)) {
      entries.set(nodePropKey({ node: nodeId, key }), { node: nodeId, key, value });
    }
  }
  return entries;
}

/**
 * Collects all edge properties from a reader into a keyed map.
 */
export function collectEdgeProperties(
  reader: VisibleStateReader,
): Map<string, { from: string; to: string; label: string; key: string; value: unknown }> {
  const entries = new Map<string, { from: string; to: string; label: string; key: string; value: unknown }>();
  for (const edge of reader.getEdges()) {
    for (const [key, value] of Object.entries(edge.props ?? {})) {
      const ref = { from: edge.from, to: edge.to, label: edge.label, key, value };
      entries.set(edgePropKey(ref), ref);
    }
  }
  return entries;
}

/**
 * Collects all edges from a reader into a keyed map of edge references.
 */
export function collectEdges(
  reader: VisibleStateReader,
): Map<string, { from: string; to: string; label: string }> {
  const edges = new Map<string, { from: string; to: string; label: string }>();
  for (const edge of reader.getEdges()) {
    const ref = { from: edge.from, to: edge.to, label: edge.label };
    edges.set(edgeKey(ref), ref);
  }
  return edges;
}
