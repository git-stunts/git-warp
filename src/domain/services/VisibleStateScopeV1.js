import QueryError from '../errors/QueryError.js';
import { createORSet, orsetContains } from '../crdt/ORSet.js';
import { vvClone } from '../crdt/VersionVector.js';
import WarpStateV5 from './WarpStateV5.js';
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
 */

/**
 * Deduplicates and sorts string values.
 *
 * @param {string[]} values
 * @returns {string[]}
 */
function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

/**
 * Validates that a single item is a non-empty string, throwing if not.
 *
 * @param {unknown} item
 * @param {string} field
 * @returns {string}
 */
function validatePrefixItem(item, field) {
  if (typeof item !== 'string' || item.trim().length === 0) {
    throw new QueryError(`${field} must contain only non-empty strings`, {
      code: 'invalid_coordinate',
      context: { field, itemType: typeof item },
    });
  }
  return item.trim();
}

/**
 * Normalizes a value expected to be a list of non-empty string prefixes.
 *
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
    normalized.push(validatePrefixItem(item, field));
  }
  return uniqueSorted(normalized);
}

/**
 * Throws if the value is not a plain object (excludes arrays and primitives).
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {Record<string, unknown>}
 */
function assertPlainObject(value, field) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new QueryError(`${field} must be an object with include/exclude prefix arrays`, {
      code: 'invalid_coordinate',
      context: { field, valueType: typeof value },
    });
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * Throws if the raw object contains keys other than the allowed set.
 *
 * @param {Record<string, unknown>} raw
 * @param {string[]} allowed
 * @param {string} field
 */
function rejectUnknownKeys(raw, allowed, field) {
  const allowedSet = new Set(allowed);
  const unknownKeys = Object.keys(raw).filter((key) => !allowedSet.has(key));
  if (unknownKeys.length > 0) {
    throw new QueryError(`${field} contains unsupported keys`, {
      code: 'invalid_coordinate',
      context: { field, unknownKeys },
    });
  }
}

/**
 * Normalizes a prefix filter object with optional include/exclude arrays.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {VisibleStateScopePrefixFilterV1|null}
 */
function normalizePrefixFilter(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = assertPlainObject(value, field);
  rejectUnknownKeys(raw, ['include', 'exclude'], field);

  const include = normalizePrefixList(raw['include'], `${field}.include`);
  const exclude = normalizePrefixList(raw['exclude'], `${field}.exclude`);
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
  const raw = assertPlainObject(scope, `${field} must be an object when provided`);
  rejectUnknownKeys(raw, ['nodeIdPrefixes'], field);

  const nodeIdPrefixes = normalizePrefixFilter(raw['nodeIdPrefixes'], `${field}.nodeIdPrefixes`);
  if (nodeIdPrefixes === null) {
    return null;
  }

  return { nodeIdPrefixes };
}

/**
 * Tests whether a value matches the include prefix list (empty means include all).
 *
 * @param {string} value
 * @param {string[]} include
 * @returns {boolean}
 */
function matchesInclude(value, include) {
  return include.length === 0 || include.some((prefix) => value.startsWith(prefix));
}

/**
 * Tests whether a value is excluded by the exclude prefix list.
 *
 * @param {string} value
 * @param {string[]} exclude
 * @returns {boolean}
 */
function matchesExclude(value, exclude) {
  return exclude.some((prefix) => value.startsWith(prefix));
}

/**
 * Extracts the include list from prefix filter rules, defaulting to empty.
 *
 * @param {VisibleStateScopePrefixFilterV1} rules
 * @returns {string[]}
 */
function extractIncludeList(rules) {
  return Array.isArray(rules.include) ? rules.include : [];
}

/**
 * Extracts the exclude list from prefix filter rules, defaulting to empty.
 *
 * @param {VisibleStateScopePrefixFilterV1} rules
 * @returns {string[]}
 */
function extractExcludeList(rules) {
  return Array.isArray(rules.exclude) ? rules.exclude : [];
}

/**
 * Tests whether a value matches include/exclude prefix rules.
 *
 * @param {string} value
 * @param {VisibleStateScopePrefixFilterV1|null|undefined} rules
 * @returns {boolean}
 */
function matchesPrefixFilter(value, rules) {
  if (rules === null || rules === undefined) {
    return true;
  }
  return matchesInclude(value, extractIncludeList(rules)) && !matchesExclude(value, extractExcludeList(rules));
}

/**
 * Tests whether a node ID falls within the visible state scope.
 *
 * @param {string} nodeId
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {boolean}
 */
export function nodeIdInVisibleStateScope(nodeId, scope) {
  if (scope === null || scope === undefined) {
    return true;
  }
  return matchesPrefixFilter(nodeId, scope.nodeIdPrefixes ?? null);
}

/**
 * Tests whether both endpoints of an edge fall within the visible state scope.
 *
 * @param {{ from: string, to: string, label: string }} edge
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {boolean}
 */
export function edgeInVisibleStateScope(edge, scope) {
  return nodeIdInVisibleStateScope(edge.from, scope) && nodeIdInVisibleStateScope(edge.to, scope);
}

/**
 * Clones an ORSet, keeping only elements that pass the inclusion predicate.
 *
 * @param {Map<string, Set<string>>} sourceEntries
 * @param {(element: string) => boolean} includeElement
 * @param {Set<string>} tombstones
 * @returns {import('../crdt/ORSet.js').ORSet}
 */
function cloneScopedOrSet(sourceEntries, includeElement, tombstones) {
  const scoped = createORSet();
  scoped.tombstones = new Set(tombstones);
  for (const [element, dots] of sourceEntries.entries()) {
    if (includeElement(element)) {
      scoped.entries.set(element, new Set(dots));
    }
  }
  return scoped;
}

/**
 * Collects node IDs that are alive and within the given scope.
 *
 * @param {WarpStateV5} state
 * @param {VisibleStateScopeV1} scope
 * @returns {Set<string>}
 */
function collectScopedNodeIds(state, scope) {
  /** @type {Set<string>} */
  const scopedNodeIds = new Set();
  for (const nodeId of state.nodeAlive.entries.keys()) {
    if (orsetContains(state.nodeAlive, nodeId) && nodeIdInVisibleStateScope(nodeId, scope)) {
      scopedNodeIds.add(nodeId);
    }
  }
  return scopedNodeIds;
}

/**
 * Collects edge keys whose both endpoints are in the scoped node set.
 *
 * @param {WarpStateV5} state
 * @param {Set<string>} scopedNodeIds
 * @returns {Set<string>}
 */
function collectScopedEdgeKeys(state, scopedNodeIds) {
  /** @type {Set<string>} */
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
 * Collects property registers belonging to scoped nodes or scoped edges.
 *
 * @param {WarpStateV5} state
 * @param {Set<string>} scopedNodeIds
 * @param {Set<string>} scopedEdgeKeys
 * @returns {Map<string, import('../crdt/LWW.js').LWWRegister<unknown>>}
 */
function collectScopedProps(state, scopedNodeIds, scopedEdgeKeys) {
  /** @type {Map<string, import('../crdt/LWW.js').LWWRegister<unknown>>} */
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
 * Collects birth events for edges whose keys are in the scoped set.
 *
 * @param {WarpStateV5} state
 * @param {Set<string>} scopedEdgeKeys
 * @returns {Map<string, import('../utils/EventId.js').EventId>}
 */
function collectScopedEdgeBirthEvents(state, scopedEdgeKeys) {
  /** @type {Map<string, import('../utils/EventId.js').EventId>} */
  const scopedEdgeBirthEvent = new Map();
  for (const [edgeKey, eventId] of state.edgeBirthEvent.entries()) {
    if (scopedEdgeKeys.has(edgeKey)) {
      scopedEdgeBirthEvent.set(edgeKey, eventId);
    }
  }
  return scopedEdgeBirthEvent;
}

/**
 * Projects a full materialized state down to only the nodes/edges/props in scope.
 *
 * @param {WarpStateV5} state
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {WarpStateV5}
 */
export function scopeMaterializedStateV5(state, scope) {
  if (scope === null || scope === undefined) {
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

  return new WarpStateV5({
    nodeAlive: scopedNodeAlive,
    edgeAlive: scopedEdgeAlive,
    prop: collectScopedProps(state, scopedNodeIds, scopedEdgeKeys),
    observedFrontier: vvClone(state.observedFrontier),
    edgeBirthEvent: collectScopedEdgeBirthEvents(state, scopedEdgeKeys),
  });
}

/**
 * Tests whether a node-targeted op affects the given scope.
 *
 * @param {Record<string, unknown>} op
 * @param {VisibleStateScopeV1} scope
 * @returns {boolean}
 */
function nodeOpAffectsScope(op, scope) {
  return typeof op['node'] === 'string' && nodeIdInVisibleStateScope(op['node'], scope);
}

/**
 * Tests whether an edge-targeted op affects the given scope.
 *
 * @param {Record<string, unknown>} op
 * @param {VisibleStateScopeV1} scope
 * @returns {boolean}
 */
function edgeOpAffectsScope(op, scope) {
  return typeof op['from'] === 'string'
    && typeof op['to'] === 'string'
    && edgeInVisibleStateScope(
      {
        from: op['from'],
        to: op['to'],
        label: typeof op['label'] === 'string' ? op['label'] : '',
      },
      scope,
    );
}

const NODE_SCOPED_OP_TYPES = new Set(['NodeAdd', 'NodeRemove', 'NodePropSet']);
const EDGE_SCOPED_OP_TYPES = new Set(['EdgeAdd', 'EdgeRemove', 'EdgePropSet']);

/**
 * Tests whether a normalized op with a known type affects the visible scope.
 *
 * @param {Record<string, unknown>} normalized
 * @param {VisibleStateScopeV1} scope
 * @returns {boolean}
 */
function normalizedOpAffectsScope(normalized, scope) {
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
 * Returns true if the op value is not a usable object for scope analysis.
 *
 * @param {unknown} op
 * @returns {boolean}
 */
function isUnscopableOp(op) {
  return op === null || op === undefined || typeof op !== 'object';
}

/**
 * Tests whether a single op affects any element within the visible scope.
 *
 * @param {unknown} op
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {boolean}
 */
function opAffectsScope(op, scope) {
  if (scope === null || scope === undefined) {
    return true;
  }
  if (isUnscopableOp(op)) {
    return true;
  }

  const normalized = /** @type {Record<string, unknown>} */ (
    normalizeRawOp(/** @type {import('../types/WarpTypesV2.js').RawOpV2 | { type: string }} */ (op))
  );
  return normalizedOpAffectsScope(normalized, scope);
}

/**
 * Tests whether a patch contains at least one op that affects the scope.
 *
 * @param {import('../types/WarpTypesV2.js').PatchV2} patch
 * @param {VisibleStateScopeV1|null|undefined} scope
 * @returns {boolean}
 */
function patchAffectsScope(patch, scope) {
  if (scope === null || scope === undefined) {
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
  if (scope === null || scope === undefined) {
    return entries;
  }
  return entries.filter(({ patch }) => patchAffectsScope(patch, scope));
}
