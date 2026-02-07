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

import { orsetElements, orsetContains } from '../crdt/ORSet.js';
import { decodeEdgeKey, decodePropKey, isEdgePropKey } from './JoinReducer.js';

/**
 * Tests whether a string matches a glob-style pattern.
 *
 * @param {string} pattern - Glob pattern (e.g. 'user:*', '*:admin', '*')
 * @param {string} str - The string to test
 * @returns {boolean} True if the string matches the pattern
 */
function matchGlob(pattern, str) {
  if (pattern === '*') {
    return true;
  }
  if (!pattern.includes('*')) {
    return pattern === str;
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
  return regex.test(str);
}

/**
 * Computes the set of property keys visible under an observer config.
 *
 * @param {Map<string, *>} allNodeProps - Map of propKey -> placeholder
 * @param {string[]|undefined} expose - Whitelist of property keys
 * @param {string[]|undefined} redact - Blacklist of property keys
 * @returns {Set<string>} Visible property keys
 */
function visiblePropKeys(allNodeProps, expose, redact) {
  const redactSet = redact && redact.length > 0 ? new Set(redact) : null;
  const exposeSet = expose && expose.length > 0 ? new Set(expose) : null;

  const keys = new Set();
  for (const key of allNodeProps.keys()) {
    if (redactSet && redactSet.has(key)) {
      continue;
    }
    if (exposeSet && !exposeSet.has(key)) {
      continue;
    }
    keys.add(key);
  }
  return keys;
}

/**
 * Collects node property keys from state for a given node.
 *
 * @param {*} state - WarpStateV5 materialized state
 * @param {string} nodeId - The node ID
 * @returns {Map<string, boolean>} Map of propKey -> true
 */
function collectNodePropKeys(state, nodeId) {
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

/** @returns {{ cost: 0, breakdown: { nodeLoss: 0, edgeLoss: 0, propLoss: 0 } }} */
function zeroCost() {
  return { cost: 0, breakdown: { nodeLoss: 0, edgeLoss: 0, propLoss: 0 } };
}

/**
 * Counts how many items in `source` are absent from `targetSet`.
 *
 * @param {Array|Set} source - Source collection
 * @param {Set} targetSet - Target set to test against
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
 * @param {*} state - WarpStateV5
 * @param {Set<string>} nodesASet - Nodes visible to A
 * @param {Set<string>} nodesBSet - Nodes visible to B
 * @returns {number} edgeLoss fraction
 */
function computeEdgeLoss(state, nodesASet, nodesBSet) {
  const allEdges = [...orsetElements(state.edgeAlive)];
  const edgesA = [];
  const edgesBSet = new Set();

  for (const edgeKey of allEdges) {
    const { from, to } = decodeEdgeKey(edgeKey);
    if (!orsetContains(state.nodeAlive, from) || !orsetContains(state.nodeAlive, to)) {
      continue;
    }
    if (nodesASet.has(from) && nodesASet.has(to)) {
      edgesA.push(edgeKey);
    }
    if (nodesBSet.has(from) && nodesBSet.has(to)) {
      edgesBSet.add(edgeKey);
    }
  }

  return countMissing(edgesA, edgesBSet) / Math.max(edgesA.length, 1);
}

/**
 * Counts lost properties for a single node between two observer configs.
 *
 * @param {Map<string, boolean>} nodeProps - Property keys for the node
 * @param {{ configA: Object, configB: Object, nodeInB: boolean }} opts
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
 * @param {*} state - WarpStateV5
 * @param {{ nodesA: string[], nodesBSet: Set<string>, configA: Object, configB: Object }} opts
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
 * @param {Object} configA - Observer configuration for A
 * @param {string} configA.match - Glob pattern for visible nodes
 * @param {string[]} [configA.expose] - Property keys to include
 * @param {string[]} [configA.redact] - Property keys to exclude
 * @param {Object} configB - Observer configuration for B
 * @param {string} configB.match - Glob pattern for visible nodes
 * @param {string[]} [configB.expose] - Property keys to include
 * @param {string[]} [configB.redact] - Property keys to exclude
 * @param {*} state - WarpStateV5 materialized state
 * @returns {{ cost: number, breakdown: { nodeLoss: number, edgeLoss: number, propLoss: number } }}
 */
export function computeTranslationCost(configA, configB, state) {
  if (!configA || typeof configA.match !== 'string' ||
      !configB || typeof configB.match !== 'string') {
    throw new Error('configA.match and configB.match must be strings');
  }
  const allNodes = [...orsetElements(state.nodeAlive)];
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
