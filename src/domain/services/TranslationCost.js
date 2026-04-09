/**
 * TranslationCost - MDL-based cost estimation between observer views.
 *
 * Computes the directed cost of translating observer A's view into
 * observer B's view, measuring information loss via Minimum Description
 * Length (MDL) of the translation function.
 *
 * The cost is normalized to [0, 1]:
 *   0 = identical views (no information lost)
 *   1 = completely disjoint views (all information lost)
 *
 * @module domain/services/TranslationCost
 * @see Paper IV, Section 4 -- Directed rulial cost
 */

import { decodeEdgeKey, decodePropKey, isEdgePropKey } from './KeyCodec.js';
import { matchGlob } from '../utils/matchGlob.ts';

/** @typedef {import('./JoinReducer.js').WarpStateV5} WarpStateV5 */

/**
 * Computes the set of property keys visible under an observer config.
 *
 * @param {Map<string, unknown>} allNodeProps - Map of propKey -> placeholder
 * @param {string[]|undefined} expose - Whitelist of property keys
 * @param {string[]|undefined} redact - Blacklist of property keys
 * @returns {Set<string>} Visible property keys
 */
function visiblePropKeys(allNodeProps, expose, redact) {
  const redactSet = toFilterSet(redact);
  const exposeSet = toFilterSet(expose);
  return filterPropKeys(allNodeProps, exposeSet, redactSet);
}

/**
 * Converts an optional array to a Set for O(1) lookups, or null if empty/absent.
 *
 * @param {string[]|undefined} list
 * @returns {Set<string>|null}
 */
function toFilterSet(list) {
  return Array.isArray(list) && list.length > 0 ? new Set(list) : null;
}

/**
 * Filters property keys through expose/redact sets.
 *
 * @param {Map<string, unknown>} allNodeProps
 * @param {Set<string>|null} exposeSet
 * @param {Set<string>|null} redactSet
 * @returns {Set<string>}
 */
function filterPropKeys(allNodeProps, exposeSet, redactSet) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const key of allNodeProps.keys()) {
    if (isKeyVisible(key, exposeSet, redactSet)) {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Determines whether a property key passes expose/redact filters.
 *
 * @param {string} key
 * @param {Set<string>|null} exposeSet
 * @param {Set<string>|null} redactSet
 * @returns {boolean}
 */
function isKeyVisible(key, exposeSet, redactSet) {
  if (redactSet !== null && redactSet.has(key)) {
    return false;
  }
  if (exposeSet !== null && !exposeSet.has(key)) {
    return false;
  }
  return true;
}

/**
 * Collects node property keys from state for a given node.
 *
 * @param {WarpStateV5} state - WarpStateV5 materialized state
 * @param {string} nodeId - The node ID
 * @returns {Map<string, boolean>} Map of propKey -> true
 */
function collectNodePropKeys(state, nodeId) {
  /** @type {Map<string, boolean>} */
  const props = new Map();
  for (const [propKey] of state.prop) {
    if (isEdgePropKey(propKey)) {
      continue;
    }
    const decoded = decodePropKey(propKey);
    if (decoded.nodeId === nodeId) {
      props.set(decoded.propKey, true);
    }
  }
  return props;
}

// Weights for MDL cost components
const NODE_WEIGHT = 0.5;
const EDGE_WEIGHT = 0.3;
const PROP_WEIGHT = 0.2;

/**
 * Returns a zero-cost result indicating identical views.
 *
 * @returns {{ cost: 0, breakdown: { nodeLoss: 0, edgeLoss: 0, propLoss: 0 } }}
 */
function zeroCost() {
  return { cost: 0, breakdown: { nodeLoss: 0, edgeLoss: 0, propLoss: 0 } };
}

/**
 * Counts how many items in `source` are absent from `targetSet`.
 *
 * @param {Array<string>|Set<string>} source - Source collection
 * @param {Set<string>} targetSet - Target set to test against
 * @returns {number}
 */
function countMissing(source, targetSet) {
  let count = 0;
  for (const item of source) {
    if (!targetSet.has(item)) {
      count++;
    }
  }
  return count;
}

/**
 * Computes edge loss between two observer node sets.
 *
 * @param {WarpStateV5} state
 * @param {Set<string>} nodesASet - Nodes visible to A
 * @param {Set<string>} nodesBSet - Nodes visible to B
 * @returns {number} edgeLoss fraction
 */
function computeEdgeLoss(state, nodesASet, nodesBSet) {
  const { edgesA, edgesBSet } = classifyEdges(state, nodesASet, nodesBSet);
  return countMissing(edgesA, edgesBSet) / Math.max(edgesA.length, 1);
}

/**
 * Classifies alive edges into A-visible and B-visible buckets.
 *
 * @param {WarpStateV5} state
 * @param {Set<string>} nodesASet
 * @param {Set<string>} nodesBSet
 * @returns {{ edgesA: string[], edgesBSet: Set<string> }}
 */
function classifyEdges(state, nodesASet, nodesBSet) {
  const aliveEdges = filterAliveEdges(state);
  const edgesA = filterEdgesForNodeSet(aliveEdges, nodesASet);
  const edgesBSet = new Set(filterEdgesForNodeSet(aliveEdges, nodesBSet));
  return { edgesA, edgesBSet };
}

/**
 * Filters alive edges to those where both endpoints belong to a given node set.
 *
 * @param {Array<{ edgeKey: string, from: string, to: string }>} edges
 * @param {Set<string>} nodeSet
 * @returns {string[]}
 */
function filterEdgesForNodeSet(edges, nodeSet) {
  /** @type {string[]} */
  const result = [];
  for (const { edgeKey, from, to } of edges) {
    if (nodeSet.has(from) && nodeSet.has(to)) {
      result.push(edgeKey);
    }
  }
  return result;
}

/**
 * Filters edges to only those whose both endpoints are alive, returning decoded keys.
 *
 * @param {WarpStateV5} state
 * @returns {Array<{ edgeKey: string, from: string, to: string }>}
 */
function filterAliveEdges(state) {
  /** @type {Array<{ edgeKey: string, from: string, to: string }>} */
  const result = [];
  for (const edgeKey of state.edgeAlive.elements()) {
    const { from, to } = decodeEdgeKey(edgeKey);
    if (areBothEndpointsAlive(state, from, to)) {
      result.push({ edgeKey, from, to });
    }
  }
  return result;
}

/**
 * Checks whether both endpoints of an edge are alive in the graph state.
 *
 * @param {WarpStateV5} state
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function areBothEndpointsAlive(state, from, to) {
  return state.nodeAlive.contains(from) && state.nodeAlive.contains(to);
}

/**
 * Counts lost properties for a single node between two observer configs.
 *
 * @param {Map<string, boolean>} nodeProps - Property keys for the node
 * @param {{ configA: {expose?: string[], redact?: string[]}, configB: {expose?: string[], redact?: string[]}, nodeInB: boolean }} opts
 * @returns {{ propsInA: number, lostProps: number }}
 */
function countNodePropLoss(nodeProps, { configA, configB, nodeInB }) {
  const propsA = visiblePropKeys(nodeProps, configA.expose, configA.redact);
  if (!nodeInB) {
    return { propsInA: propsA.size, lostProps: propsA.size };
  }
  const propsB = visiblePropKeys(nodeProps, configB.expose, configB.redact);
  return { propsInA: propsA.size, lostProps: countMissing(propsA, propsB) };
}

/**
 * Computes property loss across all A-visible nodes.
 *
 * @param {WarpStateV5} state - WarpStateV5
 * @param {{ nodesA: string[], nodesBSet: Set<string>, configA: {expose?: string[], redact?: string[]}, configB: {expose?: string[], redact?: string[]} }} opts
 * @returns {number} propLoss fraction
 */
function computePropLoss(state, { nodesA, nodesBSet, configA, configB }) {
  let totalPropsInA = 0;
  let totalLostProps = 0;

  for (const nodeId of nodesA) {
    const nodeProps = collectNodePropKeys(state, nodeId);
    if (nodeProps.size === 0) {
      continue;
    }
    const { propsInA, lostProps } = countNodePropLoss(
      nodeProps, { configA, configB, nodeInB: nodesBSet.has(nodeId) }
    );
    totalPropsInA += propsInA;
    totalLostProps += lostProps;
  }

  return totalLostProps / Math.max(totalPropsInA, 1);
}

/**
 * Computes the directed MDL translation cost from observer A to observer B.
 *
 * The cost measures how much information is lost when translating from
 * A's view to B's view. It is asymmetric: cost(A->B) != cost(B->A) in general.
 *
 * @param {{ match: string|string[], expose?: string[], redact?: string[] }} configA - Observer configuration for A
 * @param {{ match: string|string[], expose?: string[], redact?: string[] }} configB - Observer configuration for B
 * @param {WarpStateV5} state - WarpStateV5 materialized state
 * @returns {{ cost: number, breakdown: { nodeLoss: number, edgeLoss: number, propLoss: number } }}
 */
export function computeTranslationCost(configA, configB, state) {
  validateObserverConfigs(configA, configB);
  const allNodes = state.nodeAlive.elements();
  const nodesA = allNodes.filter((id) => matchGlob(configA.match, id));

  if (nodesA.length === 0) {
    return zeroCost();
  }

  const nodesASet = new Set(nodesA);
  const nodesBSet = new Set(allNodes.filter((id) => matchGlob(configB.match, id)));

  const nodeLoss = countMissing(nodesA, nodesBSet) / Math.max(nodesA.length, 1);
  const edgeLoss = computeEdgeLoss(state, nodesASet, nodesBSet);
  const propLoss = computePropLoss(state, { nodesA, nodesBSet, configA, configB });
  const cost = NODE_WEIGHT * nodeLoss + EDGE_WEIGHT * edgeLoss + PROP_WEIGHT * propLoss;

  return { cost, breakdown: { nodeLoss, edgeLoss, propLoss } };
}

/**
 * Validates that both observer configs have a non-empty match property.
 *
 * @param {{ match: string|string[] }} configA
 * @param {{ match: string|string[] }} configB
 * @throws {Error} If either config is missing or has an invalid match
 */
function validateObserverConfigs(configA, configB) {
  if (!isValidMatchConfig(configA) || !isValidMatchConfig(configB)) {
    throw new Error('configA.match and configB.match must be non-empty strings or non-empty arrays of strings');
  }
}

/**
 * Checks whether a config has a valid match property (non-empty string or string[]).
 *
 * @param {unknown} config
 * @returns {boolean}
 */
function isValidMatchConfig(config) {
  if (config === null || config === undefined || typeof config !== 'object') {
    return false;
  }
  const m = /** @type {{match?: unknown}} */ (config).match;
  return isValidMatch(m);
}

/**
 * Checks whether a match value is a non-empty string or non-empty string array.
 *
 * @param {unknown} m
 * @returns {boolean}
 */
function isValidMatch(m) {
  if (typeof m === 'string') {
    return true;
  }
  if (!Array.isArray(m) || m.length === 0) {
    return false;
  }
  return m.every(isString);
}

/**
 * Checks whether a value is a string.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isString(value) {
  return typeof value === 'string';
}
