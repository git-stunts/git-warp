import { compareEventIds } from '../../utils/EventId.ts';
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
} from '../KeyCodec.js';
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
 * @param {import('../../utils/EventId.ts').EventId|null|undefined} contentEventId
 * @param {import('../../utils/EventId.ts').EventId|null|undefined} candidateEventId
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
 * @param {{ eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|undefined} register
 * @param {import('../../utils/EventId.ts').EventId|undefined} birthEvent
 * @returns {{ eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null}
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
 * Encodes a visible edge reference into a composite key string.
 *
 * @param {VisibleEdgeRef} edge - the edge reference to encode
 * @returns {string} the encoded edge key
 */
function edgeKeyFromRef(edge) {
  return encodeEdgeKey(edge.from, edge.to, edge.label);
}

/**
 * Looks up the current node attachment registers directly from materialized state.
 *
 * @param {import('../JoinReducer.ts').WarpStateV5} state
 * @param {string} nodeId
 * @returns {{ contentRegister: { eventId: import('../../utils/EventId.ts').EventId|null, value: string }, mimeRegister: { eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null, sizeRegister: { eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null }|null}
 */
function getNodeContentRegisters(state, nodeId) {
  if (!state.nodeAlive.contains(nodeId)) {
    return null;
  }
  const contentRegister = state.prop.get(encodePropKey(nodeId, CONTENT_PROPERTY_KEY));
  if (!contentRegister || typeof contentRegister.value !== 'string') {
    return null;
  }
  return {
    contentRegister: /** @type {{ eventId: import('../../utils/EventId.ts').EventId|null, value: string }} */ (contentRegister),
    mimeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_MIME_PROPERTY_KEY)) || null,
    sizeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_SIZE_PROPERTY_KEY)) || null,
  };
}

/**
 * Looks up the current edge attachment registers directly from materialized state.
 *
 * @param {import('../JoinReducer.ts').WarpStateV5} state
 * @param {VisibleEdgeRef} edge
 * @returns {{ contentRegister: { eventId: import('../../utils/EventId.ts').EventId|null, value: string }, mimeRegister: { eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null, sizeRegister: { eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null }|null}
 */
function getEdgeContentRegisters(state, edge) {
  const edgeKey = edgeKeyFromRef(edge);
  if (!state.edgeAlive.contains(edgeKey)) {
    return null;
  }
  if (!state.nodeAlive.contains(edge.from) || !state.nodeAlive.contains(edge.to)) {
    return null;
  }

  const birthEvent = state.edgeBirthEvent?.get(edgeKey);
  /**
   * Reads an edge property register filtered by the edge birth event.
   *
   * @param {string} propKey - the property key to look up
   * @returns {{ eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null} the register or null
   */
  function getRegister(propKey) {
    return visibleEdgeRegister(
      state.prop.get(encodeEdgePropKey(edge.from, edge.to, edge.label, propKey)),
      birthEvent,
    );
  }
  const contentRegister = getRegister(CONTENT_PROPERTY_KEY);
  if (!contentRegister || typeof contentRegister.value !== 'string') {
    return null;
  }

  return {
    contentRegister: /** @type {{ eventId: import('../../utils/EventId.ts').EventId|null, value: string }} */ (contentRegister),
    mimeRegister: getRegister(CONTENT_MIME_PROPERTY_KEY),
    sizeRegister: getRegister(CONTENT_SIZE_PROPERTY_KEY),
  };
}

/**
 * Reads the value of an attachment sibling if it shares the same lineage.
 *
 * @param {import('../../utils/EventId.ts').EventId|null|undefined} contentEventId - event ID of the content register
 * @param {{ eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null|undefined} register - the sibling register
 * @returns {unknown} the sibling value, or null if lineage mismatch
 */
function readAttachmentSiblingValue(contentEventId, register) {
  if (!isSameAttachmentLineage(contentEventId, register?.eventId)) {
    return null;
  }
  return register?.value ?? null;
}

/**
 * Coerces a value to a MIME string or returns null.
 *
 * @param {unknown} value - the value to coerce
 * @returns {string|null} the MIME string or null
 */
function coerceMime(value) {
  return typeof value === 'string' ? value : null;
}

/**
 * Coerces a value to a non-negative integer size or returns null.
 *
 * @param {unknown} value - the value to coerce
 * @returns {number|null} the size or null
 */
function coerceSize(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Extracts structured content metadata from attachment sibling properties.
 *
 * @param {{ eventId: import('../../utils/EventId.ts').EventId|null, value: string }} contentRegister
 * @param {{ eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null} mimeRegister
 * @param {{ eventId: import('../../utils/EventId.ts').EventId|null, value: unknown }|null} sizeRegister
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
 *
 * @param {Record<string, unknown>} bag - the property bag
 * @returns {Record<string, unknown>} a shallow copy
 */
function cloneBag(bag) {
  return { ...bag };
}

/**
 * Shallow-clones content metadata or returns null.
 *
 * @param {ContentMeta|null|undefined} meta - the metadata to clone
 * @returns {ContentMeta|null} a copy or null
 */
function cloneMeta(meta) {
  return meta ? { ...meta } : null;
}

/**
 * Shallow-clones an array of neighbor entries.
 *
 * @param {NeighborEntry[]} entries - the neighbor entries to clone
 * @returns {NeighborEntry[]} cloned entries
 */
function cloneNeighbors(entries) {
  return entries.map((entry) => ({ ...entry }));
}

/**
 * Creates a map of node ID to empty property bags for population.
 *
 * @param {string[]} nodeIds - the visible node IDs
 * @returns {Map<string, Record<string, unknown>>} node property index
 */
function createNodePropIndex(nodeIds) {
  return new Map(
    nodeIds.map((nodeId) => [nodeId, /** @type {Record<string, unknown>} */ (Object.create(null))]),
  );
}

/**
 * Creates a map of edge key to empty property bags for population.
 *
 * @param {VisibleEdgeRef[]} edges - the visible edge references
 * @returns {Map<string, Record<string, unknown>>} edge property index
 */
function createEdgePropIndex(edges) {
  return new Map(
    edges.map((edge) => [edgeKeyFromRef(edge), /** @type {Record<string, unknown>} */ (Object.create(null))]),
  );
}

/**
 * Builds outgoing and incoming neighbor indexes from visible nodes and edges.
 *
 * @param {string[]} nodeIds - the visible node IDs
 * @param {VisibleEdgeRef[]} edges - the visible edge references
 * @returns {{ outgoingByNode: StateReaderContext['outgoingByNode'], incomingByNode: StateReaderContext['incomingByNode'] }} neighbor maps
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
 * Populates node and edge property indexes from materialized state registers.
 *
 * @param {import('../JoinReducer.ts').WarpStateV5} state - the materialized state
 * @param {{ visibleNodeIds: Set<string>, nodePropsById: Map<string, Record<string, unknown>>, edgePropsByKey: Map<string, Record<string, unknown>> }} indexes - the indexes to populate
 * @returns {void}
 */
function populateVisibleProps(state, indexes) {
  const { visibleNodeIds, nodePropsById, edgePropsByKey } = indexes;
  for (const [propKey, register] of state.prop) {
    if (!isEdgePropKey(propKey)) {
      const { nodeId, propKey: key } = decodePropKey(propKey);
      if (visibleNodeIds.has(nodeId)) {
        /** @type {Record<string, unknown>} */ (nodePropsById.get(nodeId))[key] = register.value;
      }
      continue;
    }

    const decoded = decodeEdgePropKey(propKey);
    const edge = { from: decoded.from, to: decoded.to, label: decoded.label };
    const edgeKey = edgeKeyFromRef(edge);
    const props = edgePropsByKey.get(edgeKey);
    const birthEvent = state.edgeBirthEvent?.get(edgeKey);
    if (props === undefined || (birthEvent !== undefined && register.eventId !== null && register.eventId !== undefined && compareEventIds(register.eventId, birthEvent) < 0)) {
      continue;
    }
    props[decoded.propKey] = register.value;
  }
}

/**
 * Creates visible edge views with cloned property bags.
 *
 * @param {VisibleEdgeRef[]} edges - the visible edge references
 * @param {Map<string, Record<string, unknown>>} edgePropsByKey - the edge property index
 * @returns {VisibleEdgeView[]} edge views with props
 */
function createVisibleEdges(edges, edgePropsByKey) {
  return edges.map((edge) => ({
    ...edge,
    props: cloneBag(/** @type {Record<string, unknown>} */ (edgePropsByKey.get(edgeKeyFromRef(edge)))),
  }));
}

/**
 * Builds a content metadata index for all visible nodes.
 *
 * @param {import('../JoinReducer.ts').WarpStateV5} state - the materialized state
 * @param {string[]} nodeIds - the visible node IDs
 * @returns {Map<string, ContentMeta|null>} node content metadata index
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
 * Builds a content metadata index for all visible edges.
 *
 * @param {import('../JoinReducer.ts').WarpStateV5} state - the materialized state
 * @param {VisibleEdgeRef[]} edges - the visible edge references
 * @returns {Map<string, ContentMeta|null>} edge content metadata index
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
 * Deep-clones the state projection for safe external consumption.
 *
 * @param {StateReaderContext} context - the reader context
 * @returns {{ nodes: string[], edges: Array<{ from: string, to: string, label: string }>, props: Array<{ node: string, key: string, value: unknown }> }} cloned projection
 */
function cloneProjection(context) {
  return {
    nodes: [...context.projection.nodes],
    edges: context.projection.edges.map((edge) => ({ ...edge })),
    props: context.projection.props.map((prop) => ({ ...prop })),
  };
}

/**
 * Checks whether a node is visible in the current state.
 *
 * @param {StateReaderContext} context - the reader context
 * @param {string} nodeId - the node ID to check
 * @returns {boolean} true if the node is visible
 */
function hasVisibleNode(context, nodeId) {
  return context.visibleNodeIds.has(nodeId);
}

/**
 * Returns a copy of all visible node IDs.
 *
 * @param {StateReaderContext} context - the reader context
 * @returns {string[]} visible node IDs
 */
function getVisibleNodes(context) {
  return [...context.projection.nodes];
}

/**
 * Returns cloned visible edge views with properties.
 *
 * @param {StateReaderContext} context - the reader context
 * @returns {VisibleEdgeView[]} visible edges
 */
function getVisibleEdges(context) {
  return context.edges.map((edge) => ({ ...edge, props: cloneBag(edge.props) }));
}

/**
 * Returns cloned properties for a visible node, or null if not visible.
 *
 * @param {StateReaderContext} context - the reader context
 * @param {string} nodeId - the node ID
 * @returns {Record<string, unknown>|null} properties or null
 */
function getVisibleNodeProps(context, nodeId) {
  if (!hasVisibleNode(context, nodeId)) {
    return null;
  }
  return cloneBag(/** @type {Record<string, unknown>} */ (context.nodePropsById.get(nodeId)));
}

/**
 * Returns cloned properties for a visible edge, or null if not found.
 *
 * @param {StateReaderContext} context - the reader context
 * @param {VisibleEdgeRef} edge - the edge reference
 * @returns {Record<string, unknown>|null} properties or null
 */
function getVisibleEdgeProps(context, edge) {
  const props = context.edgePropsByKey.get(edgeKeyFromRef(edge));
  return props ? cloneBag(props) : null;
}

/**
 * Returns visible neighbors for a node, optionally filtered by direction and label.
 *
 * @param {StateReaderContext} context - the reader context
 * @param {string} nodeId - the node ID
 * @param {{ direction?: 'outgoing'|'incoming'|'both', edgeLabel?: string }} [options] - filter options
 * @returns {NeighborEntry[]} neighbor entries
 */
function getVisibleNeighbors(context, nodeId, options = {}) {
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

/**
 * Returns cloned content metadata for a visible node, or null.
 *
 * @param {StateReaderContext} context - the reader context
 * @param {string} nodeId - the node ID
 * @returns {ContentMeta|null} content metadata or null
 */
function getVisibleNodeContentMeta(context, nodeId) {
  if (!hasVisibleNode(context, nodeId)) {
    return null;
  }
  return cloneMeta(context.nodeContentMetaById.get(nodeId));
}

/**
 * Returns cloned content metadata for a visible edge, or null.
 *
 * @param {StateReaderContext} context - the reader context
 * @param {VisibleEdgeRef} edge - the edge reference
 * @returns {ContentMeta|null} content metadata or null
 */
function getVisibleEdgeContentMeta(context, edge) {
  return cloneMeta(context.edgeContentMetaByKey.get(edgeKeyFromRef(edge)));
}

/**
 * Inspects a visible node, returning its props, neighbors, and content metadata.
 *
 * @param {StateReaderContext} context - the reader context
 * @param {string} nodeId - the node ID to inspect
 * @returns {{ nodeId: string, props: Record<string, unknown>, outgoing: NeighborEntry[], incoming: NeighborEntry[], content: ContentMeta|null }|null} inspection result or null
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
 * Assembles the frozen reader API from a pre-built context.
 *
 * @param {StateReaderContext} context - the reader context
 * @returns {import('../../../../index.js').VisibleStateReaderV5} frozen reader
 */
function buildReaderApi(context) {
  /** @type {import('../../../../index.js').VisibleStateReaderV5} */
  const reader = {
    project() {
      return cloneProjection(context);
    },
    hasNode(nodeId) {
      return hasVisibleNode(context, nodeId);
    },
    getNodes() {
      return getVisibleNodes(context);
    },
    getEdges() {
      return getVisibleEdges(context);
    },
    getNodeProps(nodeId) {
      return getVisibleNodeProps(context, nodeId);
    },
    getEdgeProps(from, to, label) {
      return getVisibleEdgeProps(context, { from, to, label });
    },
    neighbors(nodeId, direction, edgeLabel) {
      return getVisibleNeighbors(context, nodeId, {
        ...(direction !== undefined ? { direction } : {}),
        ...(edgeLabel !== undefined ? { edgeLabel } : {}),
      });
    },
    getNodeContentMeta(nodeId) {
      return getVisibleNodeContentMeta(context, nodeId);
    },
    getEdgeContentMeta(from, to, label) {
      return getVisibleEdgeContentMeta(context, { from, to, label });
    },
    inspectNode(nodeId) {
      return inspectVisibleNode(context, nodeId);
    },
  };
  return Object.freeze(reader);
}

/**
 * Builds the full reader context from materialized state, including all indexes.
 *
 * @param {import('../JoinReducer.ts').WarpStateV5} state - the materialized state
 * @returns {StateReaderContext} the reader context
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
 * @param {import('../JoinReducer.ts').WarpStateV5} state
 * @returns {import('../../../../index.js').VisibleStateReaderV5}
 */
export function createStateReaderV5(state) {
  return buildReaderApi(buildReaderContext(state));
}
