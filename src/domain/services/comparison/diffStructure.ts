/**
 * Structural diff and node-view comparison for visible-state diffing.
 *
 * Covers neighbor list comparison, node-view normalization, node/edge set deltas,
 * and the top-level "has anything changed" check.
 * Pure functions — no side effects, no I/O, no classes.
 *
 * @module domain/services/comparison/diffStructure
 */

import type { VisibleNodeViewV5, VisibleStateNeighborV5, VisibleStateReaderV5 } from '../../../../index.js';
import {
  compareStrings,
  compareNeighbors,
  compareEdgeRefs,
  collectEdges,
  neighborKey,
  valueKey,
} from './diffKeys.ts';
import { compareNodeViewProperties } from './diffProperties.ts';

// ── Neighbor list comparison ─────────────────────────────────────────────────

/**
 * Builds a map from composite neighbor key to neighbor object.
 */
export function neighborMap(
  neighbors: VisibleStateNeighborV5[],
): Map<string, VisibleStateNeighborV5> {
  return new Map(neighbors.map((neighbor) => [neighborKey(neighbor), neighbor]));
}

/**
 * Computes the added and removed deltas between two neighbor lists.
 */
export function compareNeighborLists(
  leftNeighbors: VisibleStateNeighborV5[],
  rightNeighbors: VisibleStateNeighborV5[],
): { added: VisibleStateNeighborV5[]; removed: VisibleStateNeighborV5[] } {
  const leftMap = neighborMap(leftNeighbors);
  const rightMap = neighborMap(rightNeighbors);
  return {
    added: [...rightMap.entries()]
      .filter(([key]) => !leftMap.has(key))
      .map(([, value]) => value)
      .sort(compareNeighbors),
    removed: [...leftMap.entries()]
      .filter(([key]) => !rightMap.has(key))
      .map(([, value]) => value)
      .sort(compareNeighbors),
  };
}

// ── Change detection ─────────────────────────────────────────────────────────

/**
 * Returns true if any of the provided arrays has at least one entry.
 */
export function hasAnyEntries(groups: unknown[][]): boolean {
  return groups.some((group) => group.length > 0);
}

// ── Node view normalization ──────────────────────────────────────────────────

type NormalizedNodeView = {
  exists: boolean;
  nodeId: string | null;
  props: Record<string, unknown>;
  outgoing: VisibleStateNeighborV5[];
  incoming: VisibleStateNeighborV5[];
  content: unknown;
};

export const EMPTY_NODE_VIEW: NormalizedNodeView = {
  exists: false,
  nodeId: null,
  props: {},
  outgoing: [],
  incoming: [],
  content: null,
};

/**
 * Extracts fields from a non-null node view with defaults applied.
 */
export function extractNodeView(view: VisibleNodeViewV5): NormalizedNodeView {
  return {
    exists: true,
    nodeId: view.nodeId,
    props: view.props ?? {},
    outgoing: view.outgoing ?? [],
    incoming: view.incoming ?? [],
    content: view.content ?? null,
  };
}

/**
 * Normalizes a nullable node view into a consistent shape with defaults.
 */
export function normalizeNodeView(view: VisibleNodeViewV5 | null | undefined): NormalizedNodeView {
  if (view === null || view === undefined) {
    return { ...EMPTY_NODE_VIEW };
  }
  return extractNodeView(view);
}

// ── Node view comparison ─────────────────────────────────────────────────────

type NodeViewChangesParams = {
  propertyDelta: { added: unknown[]; removed: unknown[]; changed: unknown[] };
  outgoingDelta: { added: unknown[]; removed: unknown[] };
  incomingDelta: { added: unknown[]; removed: unknown[] };
  contentChanged: boolean;
  leftExists: boolean;
  rightExists: boolean;
};

/**
 * Determines whether a node view comparison has any structural changes.
 */
export function hasNodeViewChanges({
  propertyDelta,
  outgoingDelta,
  incomingDelta,
  contentChanged,
  leftExists,
  rightExists,
}: NodeViewChangesParams): boolean {
  return (
    hasAnyEntries([
      propertyDelta.added,
      propertyDelta.removed,
      propertyDelta.changed,
      outgoingDelta.added,
      outgoingDelta.removed,
      incomingDelta.added,
      incomingDelta.removed,
    ]) ||
    contentChanged ||
    leftExists !== rightExists
  );
}

export type NodeViewComparison = {
  targetId: string | null;
  leftExists: boolean;
  rightExists: boolean;
  changed: boolean;
  left: VisibleNodeViewV5 | null;
  right: VisibleNodeViewV5 | null;
  propertyDelta: {
    added: Array<{ key: string; value: unknown }>;
    removed: Array<{ key: string; value: unknown }>;
    changed: Array<{ key: string; leftValue: unknown; rightValue: unknown }>;
  };
  outgoingDelta: { added: VisibleStateNeighborV5[]; removed: VisibleStateNeighborV5[] };
  incomingDelta: { added: VisibleStateNeighborV5[]; removed: VisibleStateNeighborV5[] };
  contentChanged: boolean;
};

type NodeViewDeltas = {
  targetId: string | null;
  propertyDelta: NodeViewComparison['propertyDelta'];
  outgoingDelta: { added: VisibleStateNeighborV5[]; removed: VisibleStateNeighborV5[] };
  incomingDelta: { added: VisibleStateNeighborV5[]; removed: VisibleStateNeighborV5[] };
  contentChanged: boolean;
  leftExists: boolean;
  rightExists: boolean;
};

/**
 * Computes all per-view deltas from two normalized node views.
 */
function diffNormalizedViews(
  leftView: NormalizedNodeView,
  rightView: NormalizedNodeView,
): NodeViewDeltas {
  return {
    targetId: leftView.nodeId ?? rightView.nodeId ?? null,
    propertyDelta: compareNodeViewProperties(leftView.props, rightView.props),
    outgoingDelta: compareNeighborLists(leftView.outgoing, rightView.outgoing),
    incomingDelta: compareNeighborLists(leftView.incoming, rightView.incoming),
    contentChanged: valueKey(leftView.content) !== valueKey(rightView.content),
    leftExists: leftView.exists,
    rightExists: rightView.exists,
  };
}

/**
 * Compares two nullable node views and returns a detailed diff result.
 */
export function compareNodeViews(
  left: VisibleNodeViewV5 | null,
  right: VisibleNodeViewV5 | null,
): NodeViewComparison {
  const d = diffNormalizedViews(normalizeNodeView(left), normalizeNodeView(right));
  const changed = hasNodeViewChanges(d);
  return {
    targetId: d.targetId,
    leftExists: d.leftExists,
    rightExists: d.rightExists,
    changed,
    left,
    right,
    propertyDelta: d.propertyDelta,
    outgoingDelta: d.outgoingDelta,
    incomingDelta: d.incomingDelta,
    contentChanged: d.contentChanged,
  };
}

// ── Node / edge set deltas ───────────────────────────────────────────────────

/**
 * Computes the set-difference delta of node IDs between two readers.
 */
export function buildNodeDelta(
  leftReader: VisibleStateReaderV5,
  rightReader: VisibleStateReaderV5,
): { added: string[]; removed: string[] } {
  const leftNodes = new Set(leftReader.getNodes());
  const rightNodes = new Set(rightReader.getNodes());
  return {
    added: [...rightNodes].filter((nodeId) => !leftNodes.has(nodeId)).sort(compareStrings),
    removed: [...leftNodes].filter((nodeId) => !rightNodes.has(nodeId)).sort(compareStrings),
  };
}

/**
 * Computes the set-difference delta of edges between two readers.
 */
export function buildEdgeDelta(
  leftReader: VisibleStateReaderV5,
  rightReader: VisibleStateReaderV5,
): { added: Array<{ from: string; to: string; label: string }>; removed: Array<{ from: string; to: string; label: string }> } {
  const leftEdges = collectEdges(leftReader);
  const rightEdges = collectEdges(rightReader);
  return {
    added: [...rightEdges.entries()]
      .filter(([key]) => !leftEdges.has(key))
      .map(([, value]) => value)
      .sort(compareEdgeRefs),
    removed: [...leftEdges.entries()]
      .filter(([key]) => !rightEdges.has(key))
      .map(([, value]) => value)
      .sort(compareEdgeRefs),
  };
}

// ── Top-level change detection ───────────────────────────────────────────────

type VisibleStateDeltas = {
  nodeDelta: { added: string[]; removed: string[] };
  edgeDelta: { added: Array<unknown>; removed: Array<unknown> };
  nodePropertyDelta: { added: Array<unknown>; removed: Array<unknown>; changed: Array<unknown> };
  edgePropertyDelta: { added: Array<unknown>; removed: Array<unknown>; changed: Array<unknown> };
};

/**
 * Returns true if any delta array has entries, indicating visible state changes.
 */
export function hasVisibleStateChanges({
  nodeDelta,
  edgeDelta,
  nodePropertyDelta,
  edgePropertyDelta,
}: VisibleStateDeltas): boolean {
  return hasAnyEntries([
    nodeDelta.added,
    nodeDelta.removed,
    edgeDelta.added,
    edgeDelta.removed,
    nodePropertyDelta.added,
    nodePropertyDelta.removed,
    nodePropertyDelta.changed,
    edgePropertyDelta.added,
    edgePropertyDelta.removed,
    edgePropertyDelta.changed,
  ]);
}

/**
 * Normalizes a potentially null or empty target ID to a trimmed string or null.
 */
export function normalizeTargetId(targetId: string | undefined | null): string | null {
  return typeof targetId === 'string' && targetId.trim().length > 0
    ? targetId.trim()
    : null;
}

/**
 * Builds a node-level comparison for a specific target, or undefined if no target.
 */
export function buildTargetComparison(
  leftReader: VisibleStateReaderV5,
  rightReader: VisibleStateReaderV5,
  targetId: string | null,
): NodeViewComparison | undefined {
  if (typeof targetId !== 'string' || targetId.length === 0) {
    return undefined;
  }
  return compareNodeViews(leftReader.inspectNode(targetId), rightReader.inspectNode(targetId));
}
