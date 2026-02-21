/**
 * Query methods for WarpGraph — pure reads on materialized state.
 *
 * Every function uses `this` bound to a WarpGraph instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/query.methods
 */

import { orsetContains, orsetElements } from '../crdt/ORSet.js';
import { decodePropKey, isEdgePropKey, decodeEdgePropKey, encodeEdgeKey, decodeEdgeKey, CONTENT_PROPERTY_KEY } from '../services/KeyCodec.js';
import { compareEventIds } from '../utils/EventId.js';
import { cloneStateV5 } from '../services/JoinReducer.js';
import QueryBuilder from '../services/QueryBuilder.js';
import ObserverView from '../services/ObserverView.js';
import { computeTranslationCost } from '../services/TranslationCost.js';

/**
 * Checks if a node exists in the materialized graph state.
 *
 * **Requires a cached state.** Call materialize() first if not already cached.
 *
 * @this {import('../WarpGraph.js').default}
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
 * @this {import('../WarpGraph.js').default}
 * @param {string} nodeId - The node ID to get properties for
 * @returns {Promise<Map<string, unknown>|null>} Map of property key → value, or null if node doesn't exist
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getNodeProps(nodeId) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);

  if (!orsetContains(s.nodeAlive, nodeId)) {
    return null;
  }

  const props = new Map();
  for (const [propKey, register] of s.prop) {
    const decoded = decodePropKey(propKey);
    if (decoded.nodeId === nodeId) {
      props.set(decoded.propKey, register.value);
    }
  }

  return props;
}

/**
 * Gets all properties for an edge from the materialized state.
 *
 * @this {import('../WarpGraph.js').default}
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
  const props = {};
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
 * Gets neighbors of a node from the materialized state.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} nodeId - The node ID to get neighbors for
 * @param {'outgoing' | 'incoming' | 'both'} [direction='both'] - Edge direction to follow
 * @param {string} [edgeLabel] - Optional edge label filter
 * @returns {Promise<Array<{nodeId: string, label: string, direction: 'outgoing' | 'incoming'}>>} Array of neighbor info
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function neighbors(nodeId, direction = 'both', edgeLabel = undefined) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);

  /** @type {Array<{nodeId: string, label: string, direction: 'outgoing' | 'incoming'}>} */
  const result = [];

  for (const edgeKey of orsetElements(s.edgeAlive)) {
    const { from, to, label } = decodeEdgeKey(edgeKey);

    if (edgeLabel !== undefined && label !== edgeLabel) {
      continue;
    }

    if ((direction === 'outgoing' || direction === 'both') && from === nodeId) {
      if (orsetContains(s.nodeAlive, to)) {
        result.push({ nodeId: to, label, direction: /** @type {const} */ ('outgoing') });
      }
    }

    if ((direction === 'incoming' || direction === 'both') && to === nodeId) {
      if (orsetContains(s.nodeAlive, from)) {
        result.push({ nodeId: from, label, direction: /** @type {const} */ ('incoming') });
      }
    }
  }

  return result;
}

/**
 * Returns a defensive copy of the current materialized state.
 *
 * @this {import('../WarpGraph.js').default}
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
  return cloneStateV5(/** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState));
}

/**
 * Gets all visible nodes in the materialized state.
 *
 * @this {import('../WarpGraph.js').default}
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
 * @this {import('../WarpGraph.js').default}
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
      bag = {};
      edgePropsByKey.set(ek, bag);
    }
    bag[decoded.propKey] = register.value;
  }

  const edges = [];
  for (const edgeKey of orsetElements(s.edgeAlive)) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (orsetContains(s.nodeAlive, from) &&
        orsetContains(s.nodeAlive, to)) {
      const props = edgePropsByKey.get(edgeKey) || {};
      edges.push({ from, to, label, props });
    }
  }
  return edges;
}

/**
 * Returns the number of property entries in the materialized state.
 *
 * @this {import('../WarpGraph.js').default}
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
 * @this {import('../WarpGraph.js').default}
 * @returns {import('../services/QueryBuilder.js').default} A fluent query builder
 */
export function query() {
  return new QueryBuilder(this);
}

/**
 * Creates a read-only observer view of the current materialized state.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} name - Observer name
 * @param {Object} config - Observer configuration
 * @param {string} config.match - Glob pattern for visible nodes
 * @param {string[]} [config.expose] - Property keys to include
 * @param {string[]} [config.redact] - Property keys to exclude
 * @returns {Promise<import('../services/ObserverView.js').default>} A read-only observer view
 */
export async function observer(name, config) {
  if (!config || typeof config.match !== 'string') {
    throw new Error('observer config.match must be a string');
  }
  await this._ensureFreshState();
  return new ObserverView({ name, config, graph: this });
}

/**
 * Computes the directed MDL translation cost from observer A to observer B.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {Object} configA - Observer configuration for A
 * @param {string} configA.match - Glob pattern for visible nodes
 * @param {string[]} [configA.expose] - Property keys to include
 * @param {string[]} [configA.redact] - Property keys to exclude
 * @param {Object} configB - Observer configuration for B
 * @param {string} configB.match - Glob pattern for visible nodes
 * @param {string[]} [configB.expose] - Property keys to include
 * @param {string[]} [configB.redact] - Property keys to exclude
 * @returns {Promise<{cost: number, breakdown: {nodeLoss: number, edgeLoss: number, propLoss: number}}>}
 */
export async function translationCost(configA, configB) {
  await this._ensureFreshState();
  const s = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState);
  return computeTranslationCost(configA, configB, s);
}

/**
 * Gets the content blob OID for a node, or null if none is attached.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} nodeId - The node ID to check
 * @returns {Promise<string|null>} Hex blob OID or null
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getContentOid(nodeId) {
  const props = await getNodeProps.call(this, nodeId);
  if (!props) {
    return null;
  }
  // getNodeProps returns a Map — use .get() for property access
  const oid = props.get(CONTENT_PROPERTY_KEY);
  return (typeof oid === 'string') ? oid : null;
}

/**
 * Gets the content blob for a node, or null if none is attached.
 *
 * Returns the raw Buffer from `readBlob()`. Consumers wanting text
 * should call `.toString('utf8')` on the result.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} nodeId - The node ID to get content for
 * @returns {Promise<Buffer|null>} Content buffer or null
 * @throws {Error} If the referenced blob OID is not in the object store
 *   (e.g., garbage-collected despite anchoring). Callers should handle this
 *   if operating on repos with aggressive GC or partial clones.
 */
export async function getContent(nodeId) {
  const oid = await getContentOid.call(this, nodeId);
  if (!oid) {
    return null;
  }
  return await this._persistence.readBlob(oid);
}

/**
 * Gets the content blob OID for an edge, or null if none is attached.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @returns {Promise<string|null>} Hex blob OID or null
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 */
export async function getEdgeContentOid(from, to, label) {
  const props = await getEdgeProps.call(this, from, to, label);
  if (!props) {
    return null;
  }
  // getEdgeProps returns a plain object — use bracket access
  const oid = props[CONTENT_PROPERTY_KEY];
  return (typeof oid === 'string') ? oid : null;
}

/**
 * Gets the content blob for an edge, or null if none is attached.
 *
 * Returns the raw Buffer from `readBlob()`. Consumers wanting text
 * should call `.toString('utf8')` on the result.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @returns {Promise<Buffer|null>} Content buffer or null
 * @throws {Error} If the referenced blob OID is not in the object store
 *   (e.g., garbage-collected despite anchoring). Callers should handle this
 *   if operating on repos with aggressive GC or partial clones.
 */
export async function getEdgeContent(from, to, label) {
  const oid = await getEdgeContentOid.call(this, from, to, label);
  if (!oid) {
    return null;
  }
  return await this._persistence.readBlob(oid);
}
