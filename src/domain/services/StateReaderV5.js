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
  const contentRegister = state.prop.get(encodePropKey(nodeId, CONTENT_PROPERTY_KEY));
  if (!contentRegister || typeof contentRegister.value !== 'string') {
    return null;
  }
  return {
    contentRegister: /** @type {{ eventId: import('../utils/EventId.js').EventId|null, value: string }} */ (contentRegister),
    mimeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_MIME_PROPERTY_KEY)) || null,
    sizeRegister: state.prop.get(encodePropKey(nodeId, CONTENT_SIZE_PROPERTY_KEY)) || null,
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
  if (!orsetContains(state.edgeAlive, edgeKey)) {
    return null;
  }
  if (!orsetContains(state.nodeAlive, edge.from) || !orsetContains(state.nodeAlive, edge.to)) {
    return null;
  }

  const birthEvent = state.edgeBirthEvent?.get(edgeKey);
  /**
   * @param {string} propKey
   * @returns {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null}
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
    contentRegister: /** @type {{ eventId: import('../utils/EventId.js').EventId|null, value: string }} */ (contentRegister),
    mimeRegister: getRegister(CONTENT_MIME_PROPERTY_KEY),
    sizeRegister: getRegister(CONTENT_SIZE_PROPERTY_KEY),
  };
}

/**
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
 * @param {unknown} value
 * @returns {string|null}
 */
function coerceMime(value) {
  return typeof value === 'string' ? value : null;
}

/**
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
 * @param {Record<string, unknown>} bag
 * @returns {Record<string, unknown>}
 */
function cloneBag(bag) {
  return { ...bag };
}

/**
 * @param {ContentMeta|null|undefined} meta
 * @returns {ContentMeta|null}
 */
function cloneMeta(meta) {
  return meta ? { ...meta } : null;
}

/**
 * @param {NeighborEntry[]} entries
 * @returns {NeighborEntry[]}
 */
function cloneNeighbors(entries) {
  return entries.map((entry) => ({ ...entry }));
}

/**
 * @param {string[]} nodeIds
 * @returns {Map<string, Record<string, unknown>>}
 */
function createNodePropIndex(nodeIds) {
  return new Map(
    nodeIds.map((nodeId) => [nodeId, /** @type {Record<string, unknown>} */ (Object.create(null))]),
  );
}

/**
 * @param {VisibleEdgeRef[]} edges
 * @returns {Map<string, Record<string, unknown>>}
 */
function createEdgePropIndex(edges) {
  return new Map(
    edges.map((edge) => [edgeKeyFromRef(edge), /** @type {Record<string, unknown>} */ (Object.create(null))]),
  );
}

/**
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
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {{ visibleNodeIds: Set<string>, nodePropsById: Map<string, Record<string, unknown>>, edgePropsByKey: Map<string, Record<string, unknown>> }} indexes
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
    if (!props || (birthEvent && register.eventId && compareEventIds(register.eventId, birthEvent) < 0)) {
      continue;
    }
    props[decoded.propKey] = register.value;
  }
}

/**
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
 * @param {StateReaderContext} context
 * @param {string} nodeId
 * @returns {boolean}
 */
function hasVisibleNode(context, nodeId) {
  return context.visibleNodeIds.has(nodeId);
}

/**
 * @param {StateReaderContext} context
 * @returns {string[]}
 */
function getVisibleNodes(context) {
  return [...context.projection.nodes];
}

/**
 * @param {StateReaderContext} context
 * @returns {VisibleEdgeView[]}
 */
function getVisibleEdges(context) {
  return context.edges.map((edge) => ({ ...edge, props: cloneBag(edge.props) }));
}

/**
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
 * @param {StateReaderContext} context
 * @param {VisibleEdgeRef} edge
 * @returns {Record<string, unknown>|null}
 */
function getVisibleEdgeProps(context, edge) {
  const props = context.edgePropsByKey.get(edgeKeyFromRef(edge));
  return props ? cloneBag(props) : null;
}

/**
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
 * @param {StateReaderContext} context
 * @param {VisibleEdgeRef} edge
 * @returns {ContentMeta|null}
 */
function getVisibleEdgeContentMeta(context, edge) {
  return cloneMeta(context.edgeContentMetaByKey.get(edgeKeyFromRef(edge)));
}

/**
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
 * @param {StateReaderContext} context
 * @returns {import('../../../index.js').VisibleStateReaderV5}
 */
function buildReaderApi(context) {
  /** @type {import('../../../index.js').VisibleStateReaderV5} */
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
