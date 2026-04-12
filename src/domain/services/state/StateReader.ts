import { projectState } from './StateSerializer.ts';
import WarpState from './WarpState.ts';
import {
  type ContentMeta,
  type NeighborEntry,
  type StateReaderContext,
  type VisibleEdgeRef,
  type VisibleEdgeView,
  cloneBag,
  cloneMeta,
  cloneNeighbors,
  createEdgeContentMetaIndex,
  createEdgePropIndex,
  createNeighborIndex,
  createNodeContentMetaIndex,
  createNodePropIndex,
  createVisibleEdges,
  edgeKeyFromRef,
  populateVisibleProps,
} from './StateReaderContext.ts';
import type { VisibleStateReader } from '../../../../index.js';

// Re-export types that external code may need directly from this module.
export type { ContentMeta, NeighborEntry, VisibleEdgeRef, VisibleEdgeView };

// ── Projection clone ─────────────────────────────────────────────────────────

/** Deep-clones the state projection for safe external consumption. */
function cloneProjection(context: StateReaderContext): {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
  props: Array<{ node: string; key: string; value: unknown }>;
} {
  return {
    nodes: [...context.projection.nodes],
    edges: context.projection.edges.map((edge) => ({ ...edge })),
    props: context.projection.props.map((prop) => ({ ...prop })),
  };
}

// ── Context query helpers ────────────────────────────────────────────────────

/** Checks whether a node is visible in the current state. */
function hasVisibleNode(context: StateReaderContext, nodeId: string): boolean {
  return context.visibleNodeIds.has(nodeId);
}

/** Returns a copy of all visible node IDs. */
function getVisibleNodes(context: StateReaderContext): string[] {
  return [...context.projection.nodes];
}

/** Returns cloned visible edge views with properties. */
function getVisibleEdges(context: StateReaderContext): VisibleEdgeView[] {
  return context.edges.map((edge) => ({ ...edge, props: cloneBag(edge.props) }));
}

/** Returns cloned properties for a visible node, or null if not visible. */
function getVisibleNodeProps(
  context: StateReaderContext,
  nodeId: string,
): Record<string, unknown> | null {
  if (!hasVisibleNode(context, nodeId)) {
    return null;
  }
  return cloneBag(context.nodePropsById.get(nodeId) as Record<string, unknown>);
}

/** Returns cloned properties for a visible edge, or null if not found. */
function getVisibleEdgeProps(
  context: StateReaderContext,
  edge: VisibleEdgeRef,
): Record<string, unknown> | null {
  const props = context.edgePropsByKey.get(edgeKeyFromRef(edge));
  return props ? cloneBag(props) : null;
}

/** Returns visible neighbors for a node, optionally filtered by direction and label. */
function getVisibleNeighbors(
  context: StateReaderContext,
  nodeId: string,
  options: { direction?: 'outgoing' | 'incoming' | 'both'; edgeLabel?: string } = {},
): NeighborEntry[] {
  if (!hasVisibleNode(context, nodeId)) {
    return [];
  }

  const { direction = 'both', edgeLabel = undefined } = options;
  const outgoing = (context.outgoingByNode.get(nodeId) ?? []).filter(
    (entry) => edgeLabel === undefined || entry.label === edgeLabel,
  );
  const incoming = (context.incomingByNode.get(nodeId) ?? []).filter(
    (entry) => edgeLabel === undefined || entry.label === edgeLabel,
  );

  if (direction === 'outgoing') {
    return cloneNeighbors(outgoing);
  }
  if (direction === 'incoming') {
    return cloneNeighbors(incoming);
  }
  return cloneNeighbors([...outgoing, ...incoming]);
}

/** Returns cloned content metadata for a visible node, or null. */
function getVisibleNodeContentMeta(
  context: StateReaderContext,
  nodeId: string,
): ContentMeta | null {
  if (!hasVisibleNode(context, nodeId)) {
    return null;
  }
  return cloneMeta(context.nodeContentMetaById.get(nodeId));
}

/** Returns cloned content metadata for a visible edge, or null. */
function getVisibleEdgeContentMeta(
  context: StateReaderContext,
  edge: VisibleEdgeRef,
): ContentMeta | null {
  return cloneMeta(context.edgeContentMetaByKey.get(edgeKeyFromRef(edge)));
}

/** Inspects a visible node, returning its props, neighbors, and content metadata. */
function inspectVisibleNode(
  context: StateReaderContext,
  nodeId: string,
): { nodeId: string; props: Record<string, unknown>; outgoing: NeighborEntry[]; incoming: NeighborEntry[]; content: ContentMeta | null } | null {
  if (!hasVisibleNode(context, nodeId)) {
    return null;
  }
  return {
    nodeId,
    props: cloneBag(context.nodePropsById.get(nodeId) as Record<string, unknown>),
    outgoing: cloneNeighbors(context.outgoingByNode.get(nodeId) ?? []),
    incoming: cloneNeighbors(context.incomingByNode.get(nodeId) ?? []),
    content: cloneMeta(context.nodeContentMetaById.get(nodeId)),
  };
}

// ── Reader API assembly ──────────────────────────────────────────────────────

/** Assembles the frozen reader API from a pre-built context. */
function buildReaderApi(context: StateReaderContext): VisibleStateReader {
  const reader: VisibleStateReader = {
    project() {
      return cloneProjection(context);
    },
    hasNode(nodeId: string) {
      return hasVisibleNode(context, nodeId);
    },
    getNodes() {
      return getVisibleNodes(context);
    },
    getEdges() {
      return getVisibleEdges(context);
    },
    getNodeProps(nodeId: string) {
      return getVisibleNodeProps(context, nodeId);
    },
    getEdgeProps(from: string, to: string, label: string) {
      return getVisibleEdgeProps(context, { from, to, label });
    },
    neighbors(nodeId: string, direction?: 'outgoing' | 'incoming' | 'both', edgeLabel?: string) {
      return getVisibleNeighbors(context, nodeId, {
        ...(direction !== undefined ? { direction } : {}),
        ...(edgeLabel !== undefined ? { edgeLabel } : {}),
      });
    },
    getNodeContentMeta(nodeId: string) {
      return getVisibleNodeContentMeta(context, nodeId);
    },
    getEdgeContentMeta(from: string, to: string, label: string) {
      return getVisibleEdgeContentMeta(context, { from, to, label });
    },
    inspectNode(nodeId: string) {
      return inspectVisibleNode(context, nodeId);
    },
  };
  return Object.freeze(reader);
}

// ── Context construction ─────────────────────────────────────────────────────

/** Builds the full reader context from materialized state, including all indexes. */
function buildReaderContext(state: WarpState): StateReaderContext {
  const projection = projectState(state);
  const visibleNodeIds = new Set(projection.nodes);
  const nodePropsById = createNodePropIndex(projection.nodes);
  const edgePropsByKey = createEdgePropIndex(projection.edges);
  const { outgoingByNode, incomingByNode } = createNeighborIndex(projection.nodes, projection.edges);

  populateVisibleProps(state, { visibleNodeIds, nodePropsById, edgePropsByKey });

  return {
    projection,
    visibleNodeIds,
    nodePropsById,
    edgePropsByKey,
    edges: createVisibleEdges(projection.edges, edgePropsByKey),
    outgoingByNode,
    incomingByNode,
    nodeContentMetaById: createNodeContentMetaIndex(state, projection.nodes),
    edgeContentMetaByKey: createEdgeContentMetaIndex(state, projection.edges),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a substrate-generic reader over a materialized WarpState.
 *
 * The reader exposes stable node/edge/property helpers and an entity-local
 * node inspection view without leaking OR-Set internals to higher layers.
 */
export function createStateReader(state: WarpState): VisibleStateReader {
  return buildReaderApi(buildReaderContext(state));
}
