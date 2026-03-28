/**
 * Query methods for WarpRuntime — pure reads on materialized state.
 *
 * Every function uses `this` bound to a WarpRuntime instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/query.methods
 */

import { orsetContains, orsetElements } from '../crdt/ORSet.js';
import {
  decodePropKey,
  encodePropKey,
  isEdgePropKey,
  decodeEdgePropKey,
  encodeEdgePropKey,
  encodeEdgeKey,
  decodeEdgeKey,
  CONTENT_PROPERTY_KEY,
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from '../services/KeyCodec.js';
import { compareEventIds } from '../utils/EventId.js';
import { cloneStateV5 } from '../services/JoinReducer.js';
import { createImmutableWarpStateV5 } from '../services/ImmutableSnapshot.js';
import QueryBuilder from '../services/QueryBuilder.js';
import Observer from '../services/Observer.js';
import Worldline from '../services/Worldline.js';
import { computeTranslationCost } from '../services/TranslationCost.js';
import { computeStateHashV5 } from '../services/StateSerializerV5.js';

/**
 * @typedef {{
 *   source?: {
 *     kind: 'live',
 *     ceiling?: number|null
 *   } | {
 *     kind: 'coordinate',
 *     frontier: Map<string, string>|Record<string, string>,
 *     ceiling?: number|null
 *   } | {
 *     kind: 'working_set',
 *     workingSetId: string,
 *     ceiling?: number|null
 *   }
 * }} ObserverOptions
 */

/**
 * @param {ObserverOptions['source']|undefined} source
 * @returns {ObserverOptions['source']}
 */
function cloneObserverSource(source) {
  if (!source) {
    return undefined;
  }

  if (source.kind === 'live') {
    return 'ceiling' in source
      ? { kind: 'live', ceiling: source.ceiling ?? null }
      : { kind: 'live' };
  }

  if (source.kind === 'coordinate') {
    return {
      kind: 'coordinate',
      frontier: source.frontier instanceof Map
        ? new Map(source.frontier)
        : { ...source.frontier },
      ceiling: source.ceiling ?? null,
    };
  }

  return {
    kind: 'working_set',
    workingSetId: source.workingSetId,
    ceiling: source.ceiling ?? null,
  };
}

/**
 * @param {import('../WarpRuntime.js').default} graph
 * @returns {Promise<import('../WarpRuntime.js').default>}
 */
async function openDetachedObserverGraph(graph) {
  const GraphClass = /** @type {typeof import('../WarpRuntime.js').default} */ (graph.constructor);
  return await GraphClass.open({
    persistence: graph._persistence,
    graphName: graph._graphName,
    writerId: graph._writerId,
    gcPolicy: graph._gcPolicy,
    checkpointPolicy: graph._checkpointPolicy || undefined,
    autoMaterialize: false,
    onDeleteWithData: graph._onDeleteWithData,
    logger: graph._logger || undefined,
    clock: graph._clock,
    crypto: graph._crypto,
    codec: graph._codec,
    seekCache: graph._seekCache || undefined,
    audit: false,
    blobStorage: graph._blobStorage || undefined,
    patchBlobStorage: graph._patchBlobStorage || undefined,
    trust: graph._trustConfig,
  });
}

/**
 * @param {import('../WarpRuntime.js').default} graph
 * @returns {Promise<{ state: import('../services/JoinReducer.js').WarpStateV5, stateHash: string }>}
 */
async function snapshotCurrentMaterialized(graph) {
  const materialized = await /** @type {{ _materializeGraph: () => Promise<{state: import('../services/JoinReducer.js').WarpStateV5, stateHash: string|null}> }} */ (graph)._materializeGraph();
  return {
    state: cloneStateV5(materialized.state),
    stateHash: /** @type {string} */ (materialized.stateHash),
  };
}

/**
 * @param {import('../WarpRuntime.js').default} graph
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @returns {Promise<{ state: import('../services/JoinReducer.js').WarpStateV5, stateHash: string }>}
 */
async function snapshotReturnedState(graph, state) {
  const stateHash = await computeStateHashV5(state, {
    crypto: graph._crypto,
    codec: graph._codec,
  });
  return {
    state: cloneStateV5(state),
    stateHash,
  };
}

/**
 * @param {import('../WarpRuntime.js').default} graph
 * @param {ObserverOptions|undefined} options
 * @returns {Promise<{ state: import('../services/JoinReducer.js').WarpStateV5, stateHash: string }>}
 */
async function resolveObserverSnapshot(graph, options) {
  const source = options?.source;
  if (!source) {
    await graph._ensureFreshState();
    return await snapshotCurrentMaterialized(graph);
  }

  if (source.kind === 'live') {
    const detached = await openDetachedObserverGraph(graph);
    const state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (await detached.materialize({
      ceiling: source.ceiling ?? null,
    }));
    return await snapshotReturnedState(detached, state);
  }

  if (source.kind === 'coordinate') {
    const detached = await openDetachedObserverGraph(graph);
    const state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (await detached.materializeCoordinate({
      frontier: source.frontier,
      ceiling: source.ceiling ?? null,
    }));
    return await snapshotReturnedState(detached, state);
  }

  if (source.kind === 'working_set') {
    const detached = await openDetachedObserverGraph(graph);
    const state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (await detached.materializeWorkingSet(source.workingSetId, {
      ceiling: source.ceiling ?? null,
    }));
    return await snapshotReturnedState(detached, state);
  }

  throw new Error(`unknown observer source kind: ${/** @type {{ kind?: unknown }} */ (source).kind}`);
}

/**
 * Checks if a node exists in the materialized graph state.
 *
 * **Requires a cached state.** Call materialize() first if not already cached.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} nodeId - The node ID to check
 * @returns {Promise<boolean>} True if the node exists in the materialized state
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 * @throws {import('../errors/QueryError.js').default} If cached state is dirty (code: `E_STALE_STATE`)
 */
export async function hasNode(nodeId) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  return orsetContains(s.nodeAlive, nodeId);
}

/**
 * Gets all properties for a node from the materialized state.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} nodeId - The node ID to get properties for
 * @returns {Promise<Record<string, unknown>|null>} Object of property key → value, or null if node doesn't exist
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getNodeProps(nodeId) {
  await this._ensureFreshState();

  // ── Indexed fast path (positive results only; stale index falls through) ──
  if (this._propertyReader && this._logicalIndex?.isAlive(nodeId)) {
    try {
      const record = await this._propertyReader.getNodeProps(nodeId);
      if (record !== null) {
        return record;
      }
      // null → index has no data for this node; fall through to linear scan
    } catch {
      // Fall through to linear scan on index read failures.
    }
  }

  // ── Linear scan fallback ─────────────────────────────────────────────
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);

  if (!orsetContains(s.nodeAlive, nodeId)) {
    return null;
  }

  /** @type {Record<string, unknown>} */
  const props = Object.create(null);
  for (const [propKey, register] of s.prop) {
    const decoded = decodePropKey(propKey);
    if (decoded.nodeId === nodeId) {
      props[decoded.propKey] = register.value;
    }
  }

  return props;
}

/**
 * Gets all properties for an edge from the materialized state.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @returns {Promise<Record<string, unknown>|null>} Object of property key → value, or null if edge doesn't exist
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getEdgeProps(from, to, label) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);

  const edgeKey = encodeEdgeKey(from, to, label);
  if (!orsetContains(s.edgeAlive, edgeKey)) {
    return null;
  }

  if (!orsetContains(s.nodeAlive, from) ||
      !orsetContains(s.nodeAlive, to)) {
    return null;
  }

  const birthEvent = s.edgeBirthEvent?.get(edgeKey);

  /** @type {Record<string, unknown>} */
  const props = Object.create(null);
  for (const [propKey, register] of s.prop) {
    if (!isEdgePropKey(propKey)) {
      continue;
    }
    const decoded = decodeEdgePropKey(propKey);
    if (decoded.from === from && decoded.to === to && decoded.label === label) {
      if (birthEvent && register.eventId && compareEventIds(register.eventId, birthEvent) < 0) {
        continue;
      }
      props[decoded.propKey] = register.value;
    }
  }

  return props;
}

/**
 * Converts NeighborEdge[] to the query-method shape with a direction tag.
 *
 * @param {Array<{neighborId: string, label: string}>} edges
 * @param {'outgoing' | 'incoming'} dir
 * @returns {Array<{nodeId: string, label: string, direction: 'outgoing' | 'incoming'}>}
 */
function tagDirection(edges, dir) {
  return edges.map((e) => ({ nodeId: e.neighborId, label: e.label, direction: dir }));
}

/**
 * Gets neighbors of a node from the materialized state.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} nodeId - The node ID to get neighbors for
 * @param {'outgoing' | 'incoming' | 'both'} [direction='both'] - Edge direction to follow
 * @param {string} [edgeLabel] - Optional edge label filter
 * @returns {Promise<Array<{nodeId: string, label: string, direction: 'outgoing' | 'incoming'}>>} Array of neighbor info
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function neighbors(nodeId, direction = 'both', edgeLabel = undefined) {
  await this._ensureFreshState();

  // ── Indexed fast path (only when node is in index; stale falls through) ──
  const provider = this._materializedGraph?.provider;
  if (provider && this._logicalIndex?.isAlive(nodeId)) {
    try {
      const opts = edgeLabel ? { labels: new Set([edgeLabel]) } : undefined;
      return await _indexedNeighbors(provider, nodeId, direction, opts);
    } catch {
      // Fall through to linear scan on index/provider failures.
    }
  }

  // ── Linear scan fallback ─────────────────────────────────────────────
  return _linearNeighbors(/** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState), nodeId, direction, edgeLabel);
}

/**
 * Indexed neighbor lookup using BitmapNeighborProvider.
 *
 * @param {import('../../ports/NeighborProviderPort.js').default} provider
 * @param {string} nodeId
 * @param {'outgoing' | 'incoming' | 'both'} direction
 * @param {import('../../ports/NeighborProviderPort.js').NeighborOptions} [opts]
 * @returns {Promise<Array<{nodeId: string, label: string, direction: 'outgoing' | 'incoming'}>>}
 */
async function _indexedNeighbors(provider, nodeId, direction, opts) {
  if (direction === 'both') {
    const [outEdges, inEdges] = await Promise.all([
      provider.getNeighbors(nodeId, 'out', opts),
      provider.getNeighbors(nodeId, 'in', opts),
    ]);
    return [...tagDirection(outEdges, 'outgoing'), ...tagDirection(inEdges, 'incoming')];
  }
  const dir = direction === 'outgoing' ? 'out' : 'in';
  const edges = await provider.getNeighbors(nodeId, dir, opts);
  const tag = direction === 'outgoing' ? /** @type {const} */ ('outgoing') : /** @type {const} */ ('incoming');
  return tagDirection(edges, tag);
}

/**
 * Linear-scan neighbor lookup from raw CRDT state.
 *
 * @param {import('../services/JoinReducer.js').WarpStateV5} cachedState
 * @param {string} nodeId
 * @param {'outgoing' | 'incoming' | 'both'} direction
 * @param {string} [edgeLabel]
 * @returns {Array<{nodeId: string, label: string, direction: 'outgoing' | 'incoming'}>}
 */
function _linearNeighbors(cachedState, nodeId, direction, edgeLabel) {
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (cachedState);
  /** @type {Array<{nodeId: string, label: string, direction: 'outgoing' | 'incoming'}>} */
  const result = [];
  const checkOut = direction === 'outgoing' || direction === 'both';
  const checkIn = direction === 'incoming' || direction === 'both';

  for (const edgeKey of orsetElements(s.edgeAlive)) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (edgeLabel !== undefined && label !== edgeLabel) {
      continue;
    }
    if (checkOut && from === nodeId && orsetContains(s.nodeAlive, to)) {
      result.push({ nodeId: to, label, direction: /** @type {const} */ ('outgoing') });
    }
    if (checkIn && to === nodeId && orsetContains(s.nodeAlive, from)) {
      result.push({ nodeId: from, label, direction: /** @type {const} */ ('incoming') });
    }
  }

  return result;
}

/**
 * Returns a defensive copy of the current materialized state.
 *
 * @this {import('../WarpRuntime.js').default}
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5 | null>}
 */
export async function getStateSnapshot() {
  if (!this._cachedState && !this._autoMaterialize) {
    return null;
  }
  await this._ensureFreshState();
  if (!this._cachedState) {
    return null;
  }
  return createImmutableWarpStateV5(/** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState));
}

/**
 * Gets all visible nodes in the materialized state.
 *
 * @this {import('../WarpRuntime.js').default}
 * @returns {Promise<string[]>} Array of node IDs
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getNodes() {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  return [...orsetElements(s.nodeAlive)];
}

/**
 * Gets all visible edges in the materialized state.
 *
 * @this {import('../WarpRuntime.js').default}
 * @returns {Promise<Array<{from: string, to: string, label: string, props: Record<string, unknown>}>>} Array of edge info
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getEdges() {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);

  const edgePropsByKey = new Map();
  for (const [propKey, register] of s.prop) {
    if (!isEdgePropKey(propKey)) {
      continue;
    }
    const decoded = decodeEdgePropKey(propKey);
    const ek = encodeEdgeKey(decoded.from, decoded.to, decoded.label);

    const birthEvent = s.edgeBirthEvent?.get(ek);
    if (birthEvent && register.eventId && compareEventIds(register.eventId, birthEvent) < 0) {
      continue;
    }

    let bag = edgePropsByKey.get(ek);
    if (!bag) {
      bag = Object.create(null);
      edgePropsByKey.set(ek, bag);
    }
    bag[decoded.propKey] = register.value;
  }

  const edges = [];
  for (const edgeKey of orsetElements(s.edgeAlive)) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (orsetContains(s.nodeAlive, from) &&
        orsetContains(s.nodeAlive, to)) {
      const props = edgePropsByKey.get(edgeKey) || Object.create(null);
      edges.push({ from, to, label, props });
    }
  }
  return edges;
}

/**
 * Returns the number of property entries in the materialized state.
 *
 * @this {import('../WarpRuntime.js').default}
 * @returns {Promise<number>} Number of property entries
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getPropertyCount() {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  return s.prop.size;
}

/**
 * Creates a fluent query builder for the logical graph.
 *
 * @this {import('../WarpRuntime.js').default}
 * @returns {import('../services/QueryBuilder.js').default} A fluent query builder
 */
export function query() {
  return new QueryBuilder(this);
}

/**
 * Creates a first-class worldline handle over a pinned read source.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {ObserverOptions} [options]
 * @returns {import('../services/Worldline.js').default}
 */
export function worldline(options = undefined) {
  return new Worldline({
    graph: this,
    source: cloneObserverSource(options?.source) || { kind: 'live' },
  });
}

const DEFAULT_OBSERVER_NAME = 'observer';

/**
 * @param {string|{ match: string|string[], expose?: string[], redact?: string[] }} nameOrConfig
 * @param {{ match: string|string[], expose?: string[], redact?: string[] }|ObserverOptions|undefined} configOrOptions
 * @param {ObserverOptions|undefined} maybeOptions
 * @returns {{ name: string, config: { match: string|string[], expose?: string[], redact?: string[] }|undefined, options: ObserverOptions|undefined }}
 */
function normalizeObserverArgs(nameOrConfig, configOrOptions, maybeOptions) {
  if (typeof nameOrConfig === 'string') {
    return {
      name: nameOrConfig,
      config: /** @type {{ match: string|string[], expose?: string[], redact?: string[] }|undefined} */ (configOrOptions),
      options: maybeOptions,
    };
  }

  return {
    name: DEFAULT_OBSERVER_NAME,
    config: nameOrConfig,
    options: /** @type {ObserverOptions|undefined} */ (configOrOptions),
  };
}

/**
 * Creates a read-only observer over the current materialized state.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string|{ match: string|string[], expose?: string[], redact?: string[] }} nameOrConfig
 *   Observer name or observer configuration
 * @param {{ match: string|string[], expose?: string[], redact?: string[] }|ObserverOptions} [configOrOptions]
 *   Observer configuration when a name is supplied, otherwise observer options
 * @param {ObserverOptions} [maybeOptions] - Optional pinned read source
 * @returns {Promise<import('../services/Observer.js').default>} A read-only observer
 */
export async function observer(nameOrConfig, configOrOptions = undefined, maybeOptions = undefined) {
  const { name, config, options } = normalizeObserverArgs(nameOrConfig, configOrOptions, maybeOptions);
  /** @param {unknown} m */
  const isValidMatch = (m) => typeof m === 'string' || (Array.isArray(m) && m.length > 0 && m.every(/** @param {unknown} i */ i => typeof i === 'string'));
  if (!config || !isValidMatch(config.match)) {
    throw new Error('observer config.match must be a non-empty string or non-empty array of strings');
  }
  const snapshot = await resolveObserverSnapshot(this, options);
  return new Observer({
    name,
    config,
    graph: this,
    snapshot,
    source: cloneObserverSource(options?.source) || { kind: 'live' },
  });
}

/**
 * Computes the directed MDL translation cost from observer A to observer B.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {{ match: string|string[], expose?: string[], redact?: string[] }} configA - Observer configuration for A
 * @param {{ match: string|string[], expose?: string[], redact?: string[] }} configB - Observer configuration for B
 * @returns {Promise<{cost: number, breakdown: {nodeLoss: number, edgeLoss: number, propLoss: number}}>}
 */
export async function translationCost(configA, configB) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  return computeTranslationCost(configA, configB, s);
}

/**
 * Returns true when two registers were written in the same patch lineage.
 *
 * Content metadata is stored in sibling properties, so the read path only
 * treats `_content.mime` / `_content.size` as current when they come from the
 * same patch as the live `_content` reference. This prevents stale metadata
 * from surviving a later manual `_content` rewrite.
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
 * Looks up the current node attachment registers directly from materialized state.
 *
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
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
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @param {string} from
 * @param {string} to
 * @param {string} label
 * @returns {{ contentRegister: { eventId: import('../utils/EventId.js').EventId|null, value: string }, mimeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null, sizeRegister: { eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null }|null}
 */
function getEdgeContentRegisters(state, from, to, label) {
  const edgeKey = encodeEdgeKey(from, to, label);
  if (!orsetContains(state.edgeAlive, edgeKey)) {
    return null;
  }
  if (!orsetContains(state.nodeAlive, from) || !orsetContains(state.nodeAlive, to)) {
    return null;
  }
  const birthEvent = state.edgeBirthEvent?.get(edgeKey);
  const contentRegister = visibleEdgeRegister(
    state.prop.get(encodeEdgePropKey(from, to, label, CONTENT_PROPERTY_KEY)),
    birthEvent,
  );
  if (!contentRegister || typeof contentRegister.value !== 'string') {
    return null;
  }
  return {
    contentRegister: /** @type {{ eventId: import('../utils/EventId.js').EventId|null, value: string }} */ (contentRegister),
    mimeRegister: visibleEdgeRegister(
      state.prop.get(encodeEdgePropKey(from, to, label, CONTENT_MIME_PROPERTY_KEY)),
      birthEvent,
    ),
    sizeRegister: visibleEdgeRegister(
      state.prop.get(encodeEdgePropKey(from, to, label, CONTENT_SIZE_PROPERTY_KEY)),
      birthEvent,
    ),
  };
}

/**
 * Extracts structured content metadata from a property bag.
 *
 * Historical graphs may only have `_content`, and manual `_content` rewrites
 * can outlive older sibling metadata fields. In those cases `mime` and `size`
 * return as null until the content is re-attached through the metadata-aware
 * APIs.
 *
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: string }} contentRegister
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null} mimeRegister
 * @param {{ eventId: import('../utils/EventId.js').EventId|null, value: unknown }|null} sizeRegister
 * @returns {{ oid: string, mime: string|null, size: number|null }|null}
 */
function extractContentMeta(contentRegister, mimeRegister, sizeRegister) {
  const sizeValue = isSameAttachmentLineage(contentRegister.eventId, sizeRegister?.eventId)
    ? sizeRegister?.value
    : null;
  const mimeValue = isSameAttachmentLineage(contentRegister.eventId, mimeRegister?.eventId)
    ? mimeRegister?.value
    : null;
  const size =
    typeof sizeValue === 'number' && Number.isInteger(sizeValue) && sizeValue >= 0
      ? sizeValue
      : null;
  return {
    oid: contentRegister.value,
    mime: typeof mimeValue === 'string' ? mimeValue : null,
    size,
  };
}

/**
 * Gets the content blob OID for a node, or null if none is attached.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} nodeId - The node ID to check
 * @returns {Promise<string|null>} Hex blob OID or null
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getContentOid(nodeId) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  const registers = getNodeContentRegisters(s, nodeId);
  return registers?.contentRegister.value ?? null;
}

/**
 * Gets structured content metadata for a node attachment, or null if none is attached.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} nodeId - The node ID to check
 * @returns {Promise<{ oid: string, mime: string|null, size: number|null }|null>} Content metadata or null
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getContentMeta(nodeId) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  const registers = getNodeContentRegisters(s, nodeId);
  return registers
    ? extractContentMeta(registers.contentRegister, registers.mimeRegister, registers.sizeRegister)
    : null;
}

/**
 * Gets the content blob for a node, or null if none is attached.
 *
 * Returns the raw bytes from `readBlob()`. Consumers wanting text
 * should decode the result with `new TextDecoder().decode(buf)`.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} nodeId - The node ID to get content for
 * @returns {Promise<Uint8Array|null>} Content bytes or null
 * @throws {import('../errors/PersistenceError.js').default} If the referenced
 *   blob OID is not in the object store (code: `E_MISSING_OBJECT`), such as
 *   after repository corruption, aggressive GC, or a partial clone missing the
 *   blob object.
 */
export async function getContent(nodeId) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  const registers = getNodeContentRegisters(s, nodeId);
  if (!registers) {
    return null;
  }
  const { value: oid } = registers.contentRegister;
  if (this._blobStorage) {
    return await this._blobStorage.retrieve(oid);
  }
  return await this._persistence.readBlob(oid);
}

/**
 * Gets the content blob OID for an edge, or null if none is attached.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @returns {Promise<string|null>} Hex blob OID or null
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getEdgeContentOid(from, to, label) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  const registers = getEdgeContentRegisters(s, from, to, label);
  return registers?.contentRegister.value ?? null;
}

/**
 * Gets structured content metadata for an edge attachment, or null if none is attached.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @returns {Promise<{ oid: string, mime: string|null, size: number|null }|null>} Content metadata or null
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getEdgeContentMeta(from, to, label) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  const registers = getEdgeContentRegisters(s, from, to, label);
  return registers
    ? extractContentMeta(registers.contentRegister, registers.mimeRegister, registers.sizeRegister)
    : null;
}

/**
 * Gets the content blob for an edge, or null if none is attached.
 *
 * Returns the raw bytes from `readBlob()`. Consumers wanting text
 * should decode the result with `new TextDecoder().decode(buf)`.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @returns {Promise<Uint8Array|null>} Content bytes or null
 * @throws {import('../errors/PersistenceError.js').default} If the referenced
 *   blob OID is not in the object store (code: `E_MISSING_OBJECT`), such as
 *   after repository corruption, aggressive GC, or a partial clone missing the
 *   blob object.
 */
export async function getEdgeContent(from, to, label) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  const registers = getEdgeContentRegisters(s, from, to, label);
  if (!registers) {
    return null;
  }
  const { value: oid } = registers.contentRegister;
  if (this._blobStorage) {
    return await this._blobStorage.retrieve(oid);
  }
  return await this._persistence.readBlob(oid);
}
