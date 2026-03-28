import QueryError from '../errors/QueryError.js';
import { createORSet, orsetContains } from '../crdt/ORSet.js';
import { vvClone } from '../crdt/VersionVector.js';
import { normalizeRawOp } from './OpNormalizer.js';
import {
  decodeEdgeKey,
  decodeEdgePropKey,
  decodePropKey,
  encodeEdgeKey,
  isEdgePropKey,
} from './KeyCodec.js';

/**
 * @typedef {{
 *   include?: string[],
 *   exclude?: string[]
 * }} VisibleStateScopePrefixFilterV1
 * @typedef {{
 *   nodeIdPrefixes?: VisibleStateScopePrefixFilterV1
 * }} VisibleStateScopeV1
 * @typedef {import('./JoinReducer.js').WarpStateV5} WarpStateV5
 */

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string[]}
 */
function normalizePrefixList(value, field) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new QueryError(`${field} must be an array of non-empty strings`, {
      code: 'invalid_coordinate',
      context: { field, valueType: typeof value },
    });
  }

  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new QueryError(`${field} must contain only non-empty strings`, {
        code: 'invalid_coordinate',
        context: { field, itemType: typeof item },
      });
    }
    normalized.push(item.trim());
  }
  return uniqueSorted(normalized);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {VisibleStateScopePrefixFilterV1|null}
 */
function normalizePrefixFilter(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new QueryError(`${field} must be an object with include/exclude prefix arrays`, {
      code: 'invalid_coordinate',
      context: { field, valueType: typeof value },
    });
  }

  const raw = /** @type {Record<string, unknown>} */ (value);
  const unknownKeys = Object.keys(raw).filter((key) => key !== 'include' && key !== 'exclude');
  if (unknownKeys.length > 0) {
    throw new QueryError(`${field} contains unsupported keys`, {
      code: 'invalid_coordinate',
      context: { field, unknownKeys },
    });
  }

  const include = normalizePrefixList(raw.include, `${field}.include`);
  const exclude = normalizePrefixList(raw.exclude, `${field}.exclude`);
  if (include.length === 0 && exclude.length === 0) {
    return null;
  }
  return { include, exclude };
}

/**
 * Normalizes a substrate-generic visible-state scope.
 *
 * Current v1 scope stays intentionally narrow:
 * - include/exclude node-id prefixes
 *
 * Edges, edge properties, and attachment metadata follow node visibility.
 *
 * @param {unknown} scope
 * @param {string} [field='scope']
 * @returns {VisibleStateScopeV1|null}
 */
export function normalizeVisibleStateScopeV1(scope, field = 'scope') {
  if (scope === undefined || scope === null) {
    return null;
  }
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    throw new QueryError(`${field} must be an object when provided`, {
      code: 'invalid_coordinate',
      context: { field, valueType: typeof scope },
    });
  }

  const raw = /** @type {Record<string, unknown>} */ (scope);
  const unknownKeys = Object.keys(raw).filter((key) => key !== 'nodeIdPrefixes');
  if (unknownKeys.length > 0) {
    throw new QueryError(`${field} contains unsupported keys`, {
      code: 'invalid_coordinate',
      context: { field, unknownKeys },
    });
  }

  const nodeIdPrefixes = normalizePrefixFilter(raw.nodeIdPrefixes, `${field}.nodeIdPrefixes`);
  if (!nodeIdPrefixes) {
    return null;
  }

  return { nodeIdPrefixes };
}

/**
 * @param {string} value
 * @param {VisibleStateScopePrefixFilterV1|null|undefined} rules
 * @returns {boolean}
 */
function matchesPrefixFilter(value, rules) {
  if (!rules) {
    return true;
  }

  const include = Array.isArray(rules.include) ? rules.include : [];
  const exclude = Array.isArray(rules.exclude) ? rules.exclude : [];
  const included = include.length === 0 || include.some((prefix) => value.startsWith(prefix));
  if (!included) {
    return false;
  }
  return !exclude.some((prefix) => value.startsWith(prefix));
}

/**
 * @param {string} nodeId
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {boolean}
 */
export function nodeIdInVisibleStateScope(nodeId, scope) {
  if (!scope) {
    return true;
  }
  return matchesPrefixFilter(nodeId, scope.nodeIdPrefixes ?? null);
}

/**
 * @param {{ from: string, to: string, label: string }} edge
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {boolean}
 */
export function edgeInVisibleStateScope(edge, scope) {
  return nodeIdInVisibleStateScope(edge.from, scope) && nodeIdInVisibleStateScope(edge.to, scope);
}

/**
 * @param {Map<string, Set<string>>} sourceEntries
 * @param {(element: string) => boolean} includeElement
 * @param {Set<string>} tombstones
 * @returns {import('../crdt/ORSet.js').ORSet}
 */
function cloneScopedOrSet(sourceEntries, includeElement, tombstones) {
  const scoped = createORSet();
  scoped.tombstones = new Set(tombstones);
  for (const [element, dots] of sourceEntries.entries()) {
    if (!includeElement(element)) {
      continue;
    }
    scoped.entries.set(element, new Set(dots));
  }
  return scoped;
}

/**
 * @param {WarpStateV5} state
 * @param {VisibleStateScopeV1} scope
 * @returns {Set<string>}
 */
function collectScopedNodeIds(state, scope) {
  const scopedNodeIds = new Set();
  for (const nodeId of state.nodeAlive.entries.keys()) {
    if (orsetContains(state.nodeAlive, nodeId) && nodeIdInVisibleStateScope(nodeId, scope)) {
      scopedNodeIds.add(nodeId);
    }
  }
  return scopedNodeIds;
}

/**
 * @param {WarpStateV5} state
 * @param {Set<string>} scopedNodeIds
 * @returns {Set<string>}
 */
function collectScopedEdgeKeys(state, scopedNodeIds) {
  const scopedEdgeKeys = new Set();
  for (const edgeKey of state.edgeAlive.entries.keys()) {
    if (!orsetContains(state.edgeAlive, edgeKey)) {
      continue;
    }
    const edge = decodeEdgeKey(edgeKey);
    if (scopedNodeIds.has(edge.from) && scopedNodeIds.has(edge.to)) {
      scopedEdgeKeys.add(edgeKey);
    }
  }
  return scopedEdgeKeys;
}

/**
 * @param {WarpStateV5} state
 * @param {Set<string>} scopedNodeIds
 * @param {Set<string>} scopedEdgeKeys
 * @returns {Map<string, import('../crdt/LWW.js').LWWRegister<unknown>>}
 */
function collectScopedProps(state, scopedNodeIds, scopedEdgeKeys) {
  const scopedProps = new Map();
  for (const [propKey, register] of state.prop.entries()) {
    if (isEdgePropKey(propKey)) {
      const edgeProp = decodeEdgePropKey(propKey);
      const edgeKey = encodeEdgeKey(edgeProp.from, edgeProp.to, edgeProp.label);
      if (scopedEdgeKeys.has(edgeKey)) {
        scopedProps.set(propKey, register);
      }
      continue;
    }

    const { nodeId } = decodePropKey(propKey);
    if (scopedNodeIds.has(nodeId)) {
      scopedProps.set(propKey, register);
    }
  }
  return scopedProps;
}

/**
 * @param {WarpStateV5} state
 * @param {Set<string>} scopedEdgeKeys
 * @returns {Map<string, import('../utils/EventId.js').EventId>}
 */
function collectScopedEdgeBirthEvents(state, scopedEdgeKeys) {
  const scopedEdgeBirthEvent = new Map();
  for (const [edgeKey, eventId] of state.edgeBirthEvent.entries()) {
    if (scopedEdgeKeys.has(edgeKey)) {
      scopedEdgeBirthEvent.set(edgeKey, eventId);
    }
  }
  return scopedEdgeBirthEvent;
}

/**
 * @param {WarpStateV5} state
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {WarpStateV5}
 */
export function scopeMaterializedStateV5(state, scope) {
  if (!scope) {
    return state;
  }

  const scopedNodeIds = collectScopedNodeIds(state, scope);
  const scopedNodeAlive = cloneScopedOrSet(
    state.nodeAlive.entries,
    (nodeId) => scopedNodeIds.has(nodeId),
    state.nodeAlive.tombstones,
  );
  const scopedEdgeKeys = collectScopedEdgeKeys(state, scopedNodeIds);
  const scopedEdgeAlive = cloneScopedOrSet(
    state.edgeAlive.entries,
    (edgeKey) => scopedEdgeKeys.has(edgeKey),
    state.edgeAlive.tombstones,
  );

  return {
    nodeAlive: scopedNodeAlive,
    edgeAlive: scopedEdgeAlive,
    prop: collectScopedProps(state, scopedNodeIds, scopedEdgeKeys),
    observedFrontier: vvClone(state.observedFrontier),
    edgeBirthEvent: collectScopedEdgeBirthEvents(state, scopedEdgeKeys),
  };
}

/**
 * @param {Record<string, unknown>} op
 * @param {VisibleStateScopeV1} scope
 * @returns {boolean}
 */
function nodeOpAffectsScope(op, scope) {
  return typeof op.node === 'string' && nodeIdInVisibleStateScope(op.node, scope);
}

/**
 * @param {Record<string, unknown>} op
 * @param {VisibleStateScopeV1} scope
 * @returns {boolean}
 */
function edgeOpAffectsScope(op, scope) {
  return typeof op.from === 'string'
    && typeof op.to === 'string'
    && edgeInVisibleStateScope(
      {
        from: op.from,
        to: op.to,
        label: typeof op.label === 'string' ? op.label : '',
      },
      scope,
    );
}

const NODE_SCOPED_OP_TYPES = new Set(['NodeAdd', 'NodeRemove', 'NodePropSet']);
const EDGE_SCOPED_OP_TYPES = new Set(['EdgeAdd', 'EdgeRemove', 'EdgePropSet']);

/**
 * @param {unknown} op
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {boolean}
 */
function opAffectsScope(op, scope) {
  if (!scope) {
    return true;
  }
  if (!op || typeof op !== 'object') {
    return true;
  }

  const normalized = /** @type {Record<string, unknown>} */ (
    normalizeRawOp(/** @type {import('../types/WarpTypesV2.js').RawOpV2 | { type: string }} */ (op))
  );
  const { type } = normalized;
  if (NODE_SCOPED_OP_TYPES.has(/** @type {string} */ (type))) {
    return nodeOpAffectsScope(normalized, scope);
  }
  if (EDGE_SCOPED_OP_TYPES.has(/** @type {string} */ (type))) {
    return edgeOpAffectsScope(normalized, scope);
  }
  return type !== 'BlobValue';
}

/**
 * @param {import('../types/WarpTypesV2.js').PatchV2} patch
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {boolean}
 */
function patchAffectsScope(patch, scope) {
  if (!scope) {
    return true;
  }
  const ops = Array.isArray(patch?.ops) ? patch.ops : [];
  return ops.some((op) => opAffectsScope(op, scope));
}

/**
 * Filters patch entries down to patches with at least one in-scope op.
 *
 * @param {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>} entries
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>}
 */
export function scopePatchEntriesV1(entries, scope) {
  if (!scope) {
    return entries;
  }
  return entries.filter(({ patch }) => patchAffectsScope(patch, scope));
}
