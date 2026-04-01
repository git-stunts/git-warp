import { orsetContains } from '../crdt/ORSet.js';
import { compareEventIds } from '../utils/EventId.js';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  decodeEdgePropKey,
  decodePropKey,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
  isEdgePropKey,
} from './KeyCodec.js';
import { projectStateV5 } from './StateSerializerV5.js';

/**
 * @typedef {{ oid: string, mime: string|null, size: number|null }} ContentMeta
 * @typedef {{ nodeId: string, label: string, direction: 'outgoing'|'incoming' }} NeighborEntry
 * @typedef {{ from: string, to: string, label: string }} VisibleEdgeRef
 * @typedef {{ from: string, to: string, label: string, props: Record<string, unknown> }} VisibleEdgeView
 * @typedef {{
 *   projection: {
 *     nodes: string[],
 *     edges: VisibleEdgeRef[],
 *     props: Array<{ node: string, key: string, value: unknown }>
 *   },
 *   visibleNodeIds: Set<string>,
 *   nodePropsById: Map<string, Record<string, unknown>>,
 *   edgePropsByKey: Map<string, Record<string, unknown>>,
 *   edges: VisibleEdgeView[],
 *   outgoingByNode: Map<string, Array<{ nodeId: string, label: string, direction: 'outgoing' }>>,
 *   incomingByNode: Map<string, Array<{ nodeId: string, label: string, direction: 'incoming' }>>,
 *   nodeContentMetaById: Map<string, ContentMeta|null>,
 *   edgeContentMetaByKey: Map<string, ContentMeta|null>
 * }} StateReaderContext
 */

/**
 * Returns true when two registers were written in the same patch lineage.
 *
 * Content metadata is stored in sibling properties, so read-side helpers only
 * treat `_content.mime` / `_content.size` as current when they were written in
 * the same patch as the live `_content` reference.
 *
 * @param {import('../utils/EventId.js').EventId|null|undefined} contentEventId
 * @param {import('../utils/EventId.js').EventId|null|undefined} candidateEventId
 * @returns {boolean}
 */
function isSameAttachmentLineage(contentEventId, candidateEventId) {
  return Boolean(
    contentEventId
      && candidateEventId
      && contentEventId.lamport === candidateEventId.lamport
      && contentEventId.writerId === candidateEventId.writerId
      && contentEventId.patchSha === candidateEventId.patchSha
  );
}

/**
 * Filters an edge-property register against the edge birth event.
 *
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|undefined} register
 * @param {import('../utils/EventId.js').EventId|undefined} birthEvent
 * @returns {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null}
 */
function visibleEdgeRegister(register, birthEvent) {
  if (!register) {
    return null;
  }
  if (birthEvent && register.eventId && compareEventIds(register.eventId, birthEvent) < 0) {
    return null;
  }
  return register;
}

/**
 * Encodes a visible edge reference into a canonical edge key string.
 * @param {VisibleEdgeRef} edge
 * @returns {string}
 */
function edgeKeyFromRef(edge) {
  return encodeEdgeKey(edge.from, edge.to, edge.label);
}

/**
 * Looks up the current node attachment registers directly from materialized state.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string} nodeId
 * @returns {{ contentRegister: { eventId: import('../utils/EventId.js').EventId|null, value: string }, mimeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null, sizeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null }|null}
 */
function getNodeContentRegisters(state, nodeId) {
  if (!orsetContains(state.nodeAlive, nodeId)) {
    return null;
  }
  return extractNodeRegisters(state, nodeId);
}

/**
 * Extracts content, mime, and size registers for a live node.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string} nodeId
 * @returns {{ contentRegister: { eventId: import('../utils/EventId.js').EventId|null, value: string }, mimeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null, sizeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null }|null}
 */
function extractNodeRegisters(state, nodeId) {
  const contentRegister = state.prop.get(encodePropKey(nodeId, CONTENT_PROPERTY_KEY));
  if (!contentRegister || typeof contentRegister.value !== 'string') {
    return null;
  }
  return {
    contentRegister: /** @type {{ eventId: import('../utils/EventId.js').EventId|null, value: string }} */ (contentRegister),
    mimeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_MIME_PROPERTY_KEY)) ?? null,
    sizeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_SIZE_PROPERTY_KEY)) ?? null,
  };
}

/**
 * Looks up the current edge attachment registers directly from materialized state.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {VisibleEdgeRef} edge
 * @returns {{ contentRegister: { eventId: import('../utils/EventId.js').EventId|null, value: string }, mimeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null, sizeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null }|null}
 */
function getEdgeContentRegisters(state, edge) {
  const edgeKey = edgeKeyFromRef(edge);
  if (!isEdgeFullyAlive(state, edgeKey, edge)) {
    return null;
  }
  return extractEdgeRegisters(state, edge, edgeKey);
}

/**
 * Returns true when the edge and both its endpoints are alive.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string} edgeKey
 * @param {VisibleEdgeRef} edge
 * @returns {boolean}
 */
function isEdgeFullyAlive(state, edgeKey, edge) {
  return orsetContains(state.edgeAlive, edgeKey)
    && orsetContains(state.nodeAlive, edge.from)
    && orsetContains(state.nodeAlive, edge.to);
}

/**
 * @typedef {{ state: import('./JoinReducer.js').WarpStateV5, edge: VisibleEdgeRef, birthEvent: import('../utils/EventId.js').EventId|undefined }} EdgeRegisterCtx
 */

/**
 * Resolves a visible edge register against the edge birth event.
 * @param {EdgeRegisterCtx} ctx
 * @param {string} propKey
 * @returns {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null}
 */
function resolveEdgeRegister(ctx, propKey) {
  return visibleEdgeRegister(
    ctx.state.prop.get(encodeEdgePropKey(ctx.edge.from, ctx.edge.to, ctx.edge.label, propKey)),
    ctx.birthEvent,
  );
}

/**
 * Extracts content, mime, and size registers for a live edge.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {VisibleEdgeRef} edge
 * @param {string} edgeKey
 * @returns {{ contentRegister: { eventId: import('../utils/EventId.js').EventId|null, value: string }, mimeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null, sizeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null }|null}
 */
function extractEdgeRegisters(state, edge, edgeKey) {
  /** @type {EdgeRegisterCtx} */
  const ctx = { state, edge, birthEvent: state.edgeBirthEvent?.get(edgeKey) };
  const contentRegister = resolveEdgeRegister(ctx, CONTENT_PROPERTY_KEY);
  if (!contentRegister || typeof contentRegister.value !== 'string') {
    return null;
  }
  return {
    contentRegister: /** @type {{ eventId: import('../utils/EventId.js').EventId|null, value: string }} */ (contentRegister),
    mimeRegister: resolveEdgeRegister(ctx, CONTENT_MIME_PROPERTY_KEY),
    sizeRegister: resolveEdgeRegister(ctx, CONTENT_SIZE_PROPERTY_KEY),
  };
}

/**
 * Reads the value of a sibling register when it shares attachment lineage with the content event.
 * @param {import('../utils/EventId.js').EventId|null|undefined} contentEventId
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null|undefined} register
 * @returns {unknown}
 */
function readAttachmentSiblingValue(contentEventId, register) {
  if (!isSameAttachmentLineage(contentEventId, register?.eventId)) {
    return null;
  }
  return register?.value ?? null;
}

/**
 * Coerces an unknown value to a MIME string or null.
 * @param {unknown} value
 * @returns {string|null}
 */
function coerceMime(value) {
  return typeof value === 'string' ? value : null;
}

/**
 * Coerces an unknown value to a non-negative integer size or null.
 * @param {unknown} value
 * @returns {number|null}
 */
function coerceSize(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Extracts structured content metadata from attachment sibling properties.
 *
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: string }} contentRegister
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null} mimeRegister
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null} sizeRegister
 * @returns {ContentMeta}
 */
function extractContentMeta(contentRegister, mimeRegister, sizeRegister) {
  return {
    oid: contentRegister.value,
    mime: coerceMime(readAttachmentSiblingValue(contentRegister.eventId, mimeRegister)),
    size: coerceSize(readAttachmentSiblingValue(contentRegister.eventId, sizeRegister)),
  };
}

/**
 * Shallow-clones a property bag.
 * @param {Record<string, unknown>} bag
 * @returns {Record<string, unknown>}
 */
function cloneBag(bag) {
  return { ...bag };
}

/**
 * Shallow-clones content metadata, normalising undefined to null.
 * @param {ContentMeta|null|undefined} meta
 * @returns {ContentMeta|null}
 */
function cloneMeta(meta) {
  return meta ? { ...meta } : null;
}

/**
 * Shallow-clones an array of neighbor entries for safe external consumption.
 * @param {NeighborEntry[]} entries
 * @returns {NeighborEntry[]}
 */
function cloneNeighbors(entries) {
  return entries.map((entry) => ({ ...entry }));
}

/**
 * Builds an empty property bag map keyed by node ID.
 * @param {string[]} nodeIds
 * @returns {Map<string, Record<string, unknown>>}
 */
function createNodePropIndex(nodeIds) {
  return new Map(
    nodeIds.map((nodeId) => [nodeId, /** @type {Record<string, unknown>} */ (Object.create(null))]),
  );
}

/**
 * Builds an empty property bag map keyed by encoded edge key.
 * @param {VisibleEdgeRef[]} edges
 * @returns {Map<string, Record<string, unknown>>}
 */
function createEdgePropIndex(edges) {
  return new Map(
    edges.map((edge) => [edgeKeyFromRef(edge), /** @type {Record<string, unknown>} */ (Object.create(null))]),
  );
}

/**
 * Builds outgoing and incoming neighbor indexes from edges.
 * @param {string[]} nodeIds
 * @param {VisibleEdgeRef[]} edges
 * @returns {{ outgoingByNode: StateReaderContext['outgoingByNode'], incomingByNode: StateReaderContext['incomingByNode'] }}
 */
function createNeighborIndex(nodeIds, edges) {
  const outgoingByNode = new Map(
    nodeIds.map((nodeId) => [
      nodeId,
      /** @type {Array<{ nodeId: string, label: string, direction: 'outgoing' }>} */ ([]),
    ]),
  );
  const incomingByNode = new Map(
    nodeIds.map((nodeId) => [
      nodeId,
      /** @type {Array<{ nodeId: string, label: string, direction: 'incoming' }>} */ ([]),
    ]),
  );

  for (const edge of edges) {
    outgoingByNode.get(edge.from)?.push({ nodeId: edge.to, label: edge.label, direction: 'outgoing' });
    incomingByNode.get(edge.to)?.push({ nodeId: edge.from, label: edge.label, direction: 'incoming' });
  }

  return { outgoingByNode, incomingByNode };
}

/**
 * Returns true when an edge property register predates the edge birth event.
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }} register
 * @param {import('../utils/EventId.js').EventId|undefined} birthEvent
 * @returns {boolean}
 */
function isEdgePropStale(register, birthEvent) {
  return Boolean(birthEvent && register.eventId && compareEventIds(register.eventId, birthEvent) < 0);
}

/**
 * @typedef {{ edgePropsByKey: Map<string, Record<string, unknown>>, state: import('./JoinReducer.js').WarpStateV5 }} EdgePropCtx
 */

/**
 * Applies a single edge property register to the edge property bag.
 * @param {EdgePropCtx} ctx
 * @param {string} propKey
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }} register
 * @returns {void}
 */
function applyEdgeProp(ctx, propKey, register) {
  const decoded = decodeEdgePropKey(propKey);
  const edgeKey = encodeEdgeKey(decoded.from, decoded.to, decoded.label);
  const props = ctx.edgePropsByKey.get(edgeKey);
  if (props === undefined) {
    return;
  }
  const birthEvent = ctx.state.edgeBirthEvent?.get(edgeKey);
  if (isEdgePropStale(register, birthEvent)) {
    return;
  }
  props[decoded.propKey] = register.value;
}

/**
 * Populates node and edge property bags from the materialized property map.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {{ visibleNodeIds: Set<string>, nodePropsById: Map<string, Record<string, unknown>>, edgePropsByKey: Map<string, Record<string, unknown>> }} indexes
 * @returns {void}
 */
function populateVisibleProps(state, indexes) {
  const { visibleNodeIds, nodePropsById, edgePropsByKey } = indexes;
  /** @type {EdgePropCtx} */
  const edgeCtx = { edgePropsByKey, state };
  for (const [propKey, register] of state.prop) {
    if (!isEdgePropKey(propKey)) {
      const { nodeId, propKey: key } = decodePropKey(propKey);
      if (visibleNodeIds.has(nodeId)) {
        /** @type {Record<string, unknown>} */ (nodePropsById.get(nodeId))[key] = register.value;
      }
      continue;
    }
    applyEdgeProp(edgeCtx, propKey, register);
  }
}

/**
 * Builds edge view objects by merging edge refs with their property bags.
 * @param {VisibleEdgeRef[]} edges
 * @param {Map<string, Record<string, unknown>>} edgePropsByKey
 * @returns {VisibleEdgeView[]}
 */
function createVisibleEdges(edges, edgePropsByKey) {
  return edges.map((edge) => ({
    ...edge,
    props: cloneBag(/** @type {Record<string, unknown>} */ (edgePropsByKey.get(edgeKeyFromRef(edge)))),
  }));
}

/**
 * Builds a map of node content metadata keyed by node ID.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string[]} nodeIds
 * @returns {Map<string, ContentMeta|null>}
 */
function createNodeContentMetaIndex(state, nodeIds) {
  return new Map(
    nodeIds.map((nodeId) => {
      const registers = getNodeContentRegisters(state, nodeId);
      return [
        nodeId,
        registers
          ? extractContentMeta(registers.contentRegister, registers.mimeRegister, registers.sizeRegister)
          : null,
      ];
    }),
  );
}

/**
 * Builds a map of edge content metadata keyed by encoded edge key.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {VisibleEdgeRef[]} edges
 * @returns {Map<string, ContentMeta|null>}
 */
function createEdgeContentMetaIndex(state, edges) {
  return new Map(
    edges.map((edge) => {
      const registers = getEdgeContentRegisters(state, edge);
      return [
        edgeKeyFromRef(edge),
        registers
          ? extractContentMeta(registers.contentRegister, registers.mimeRegister, registers.sizeRegister)
          : null,
      ];
    }),
  );
}

/**
 * Deep-clones the projection arrays for safe external consumption.
 * @param {StateReaderContext} context
 * @returns {{ nodes: string[], edges: Array<{ from: string, to: string, label: string }>, props: Array<{ node: string, key: string, value: unknown }> }}
 */
function cloneProjection(context) {
  return {
    nodes: [...context.projection.nodes],
    edges: context.projection.edges.map((edge) => ({ ...edge })),
    props: context.projection.props.map((prop) => ({ ...prop })),
  };
}

/**
 * Returns true when a node is present in the visible set.
 * @param {StateReaderContext} context
 * @param {string} nodeId
 * @returns {boolean}
 */
function hasVisibleNode(context, nodeId) {
  return context.visibleNodeIds.has(nodeId);
}

/**
 * Returns a copy of all visible node IDs.
 * @param {StateReaderContext} context
 * @returns {string[]}
 */
function getVisibleNodes(context) {
  return [...context.projection.nodes];
}

/**
 * Returns defensive copies of all visible edge views.
 * @param {StateReaderContext} context
 * @returns {VisibleEdgeView[]}
 */
function getVisibleEdges(context) {
  return context.edges.map((edge) => ({ ...edge, props: cloneBag(edge.props) }));
}

/**
 * Returns a cloned property bag for a visible node, or null if not found.
 * @param {StateReaderContext} context
 * @param {string} nodeId
 * @returns {Record<string, unknown>|null}
 */
function getVisibleNodeProps(context, nodeId) {
  if (!hasVisibleNode(context, nodeId)) {
    return null;
  }
  return cloneBag(/** @type {Record<string, unknown>} */ (context.nodePropsById.get(nodeId)));
}

/**
 * Returns a cloned property bag for a visible edge, or null if not found.
 * @param {StateReaderContext} context
 * @param {VisibleEdgeRef} edge
 * @returns {Record<string, unknown>|null}
 */
function getVisibleEdgeProps(context, edge) {
  const props = context.edgePropsByKey.get(edgeKeyFromRef(edge));
  return props ? cloneBag(props) : null;
}

/**
 * Filters a neighbor list by optional edge label.
 * @param {NeighborEntry[]} entries
 * @param {string|undefined} edgeLabel
 * @returns {NeighborEntry[]}
 */
function filterByLabel(entries, edgeLabel) {
  if (edgeLabel === undefined) {
    return entries;
  }
  return entries.filter((entry) => entry.label === edgeLabel);
}

/**
 * Selects neighbors in the requested direction and clones the result.
 * @param {NeighborEntry[]} outgoing
 * @param {NeighborEntry[]} incoming
 * @param {'outgoing'|'incoming'|'both'} direction
 * @returns {NeighborEntry[]}
 */
function selectByDirection(outgoing, incoming, direction) {
  if (direction === 'outgoing') {
    return cloneNeighbors(outgoing);
  }
  if (direction === 'incoming') {
    return cloneNeighbors(incoming);
  }
  return cloneNeighbors([...outgoing, ...incoming]);
}

/**
 * Collects raw outgoing and incoming entries for a node, filtered by label.
 * @param {StateReaderContext} context
 * @param {string} nodeId
 * @param {string|undefined} edgeLabel
 * @returns {{ outgoing: NeighborEntry[], incoming: NeighborEntry[] }}
 */
function collectRawNeighbors(context, nodeId, edgeLabel) {
  return {
    outgoing: filterByLabel(context.outgoingByNode.get(nodeId) ?? [], edgeLabel),
    incoming: filterByLabel(context.incomingByNode.get(nodeId) ?? [], edgeLabel),
  };
}

/**
 * Returns visible neighbors of a node, filtered by direction and edge label.
 * @param {StateReaderContext} context
 * @param {string} nodeId
 * @param {{ direction?: 'outgoing'|'incoming'|'both', edgeLabel?: string }} [options]
 * @returns {NeighborEntry[]}
 */
function getVisibleNeighbors(context, nodeId, options = {}) {
  if (!hasVisibleNode(context, nodeId)) {
    return [];
  }
  const { direction = 'both', edgeLabel = undefined } = options;
  const raw = collectRawNeighbors(context, nodeId, edgeLabel);
  return selectByDirection(raw.outgoing, raw.incoming, direction);
}

/**
 * Returns cloned content metadata for a visible node, or null.
 * @param {StateReaderContext} context
 * @param {string} nodeId
 * @returns {ContentMeta|null}
 */
function getVisibleNodeContentMeta(context, nodeId) {
  if (!hasVisibleNode(context, nodeId)) {
    return null;
  }
  return cloneMeta(context.nodeContentMetaById.get(nodeId));
}

/**
 * Returns cloned content metadata for a visible edge, or null.
 * @param {StateReaderContext} context
 * @param {VisibleEdgeRef} edge
 * @returns {ContentMeta|null}
 */
function getVisibleEdgeContentMeta(context, edge) {
  return cloneMeta(context.edgeContentMetaByKey.get(edgeKeyFromRef(edge)));
}

/**
 * Returns an entity-local inspection view of a visible node with all props and neighbors.
 * @param {StateReaderContext} context
 * @param {string} nodeId
 * @returns {{ nodeId: string, props: Record<string, unknown>, outgoing: NeighborEntry[], incoming: NeighborEntry[], content: ContentMeta|null }|null}
 */
function inspectVisibleNode(context, nodeId) {
  if (!hasVisibleNode(context, nodeId)) {
    return null;
  }
  return {
    nodeId,
    props: cloneBag(/** @type {Record<string, unknown>} */ (context.nodePropsById.get(nodeId))),
    outgoing: cloneNeighbors(context.outgoingByNode.get(nodeId) ?? []),
    incoming: cloneNeighbors(context.incomingByNode.get(nodeId) ?? []),
    content: cloneMeta(context.nodeContentMetaById.get(nodeId)),
  };
}

/**
 * Builds the graph-structure portion of the reader API.
 * @param {StateReaderContext} ctx
 * @returns {Pick<import('../../../index.js').VisibleStateReaderV5, 'project'|'hasNode'|'getNodes'|'getEdges'|'getNodeProps'|'getEdgeProps'|'neighbors'>}
 */
function buildStructureMethods(ctx) {
  return {
    /** Returns a defensive copy of the state projection. */
    project() { return cloneProjection(ctx); },
    /** Checks whether a node is present in the visible set. */
    hasNode(nodeId) { return hasVisibleNode(ctx, nodeId); },
    /** Returns all visible node IDs. */
    getNodes() { return getVisibleNodes(ctx); },
    /** Returns all visible edge views. */
    getEdges() { return getVisibleEdges(ctx); },
    /** Returns the property bag for a visible node. */
    getNodeProps(nodeId) { return getVisibleNodeProps(ctx, nodeId); },
    /** Returns the property bag for a visible edge. */
    getEdgeProps(from, to, label) { return getVisibleEdgeProps(ctx, { from, to, label }); },
    /** Returns neighbors filtered by direction and label. */
    neighbors(nodeId, direction, edgeLabel) { return getVisibleNeighbors(ctx, nodeId, { direction, edgeLabel }); },
  };
}

/**
 * Assembles the frozen public reader API from a pre-built context.
 * @param {StateReaderContext} context
 * @returns {import('../../../index.js').VisibleStateReaderV5}
 */
function buildReaderApi(context) {
  /** @type {import('../../../index.js').VisibleStateReaderV5} */
  const reader = {
    ...buildStructureMethods(context),
    /** Returns content metadata for a visible node. */
    getNodeContentMeta(nodeId) { return getVisibleNodeContentMeta(context, nodeId); },
    /** Returns content metadata for a visible edge. */
    getEdgeContentMeta(from, to, label) { return getVisibleEdgeContentMeta(context, { from, to, label }); },
    /** Returns an entity-local inspection view of a visible node. */
    inspectNode(nodeId) { return inspectVisibleNode(context, nodeId); },
  };
  return Object.freeze(reader);
}

/**
 * Materialises all reader indexes from raw V5 state.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {StateReaderContext}
 */
function buildReaderContext(state) {
  const projection = projectStateV5(state);
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

/**
 * Creates a substrate-generic reader over a materialized V5 state.
 *
 * The reader exposes stable node/edge/property helpers and an entity-local
 * node inspection view without leaking OR-Set internals to higher layers.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {import('../../../index.js').VisibleStateReaderV5}
 */
export function createStateReaderV5(state) {
  return buildReaderApi(buildReaderContext(state));
}
