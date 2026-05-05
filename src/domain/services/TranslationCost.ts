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

import { decodeEdgeKey, decodePropKey, isEdgePropKey } from './KeyCodec.ts';
import { matchGlob } from '../utils/matchGlob.ts';
import QueryError from '../errors/QueryError.ts';
import type WarpState from './state/WarpState.ts';

/**
 * Computes the set of property keys visible under an observer config.
 */
function visiblePropKeys(
  allNodeProps: Map<string, unknown>, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  expose: string[] | undefined,
  redact: string[] | undefined,
): Set<string> {
  const redactSet = toFilterSet(redact);
  const exposeSet = toFilterSet(expose);
  return filterPropKeys(allNodeProps, exposeSet, redactSet);
}

/**
 * Converts an optional array to a Set for O(1) lookups, or null if empty/absent.
 */
function toFilterSet(list: string[] | undefined): Set<string> | null {
  return Array.isArray(list) && list.length > 0 ? new Set(list) : null;
}

/**
 * Filters property keys through expose/redact sets.
 */
function filterPropKeys(
  allNodeProps: Map<string, unknown>, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  exposeSet: Set<string> | null,
  redactSet: Set<string> | null,
): Set<string> {
  const keys = new Set<string>();
  for (const key of allNodeProps.keys()) {
    if (isKeyVisible(key, exposeSet, redactSet)) {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Determines whether a property key passes expose/redact filters.
 */
function isKeyVisible(key: string, exposeSet: Set<string> | null, redactSet: Set<string> | null): boolean {
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
 */
function collectNodePropKeys(state: WarpState, nodeId: string): Map<string, boolean> {
  const props = new Map<string, boolean>();
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
 */
function zeroCost(): { cost: 0; breakdown: { nodeLoss: 0; edgeLoss: 0; propLoss: 0 } } {
  return { cost: 0, breakdown: { nodeLoss: 0, edgeLoss: 0, propLoss: 0 } };
}

/**
 * Counts how many items in `source` are absent from `targetSet`.
 */
function countMissing(source: Array<string> | Set<string>, targetSet: Set<string>): number {
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
 */
function computeEdgeLoss(state: WarpState, nodesASet: Set<string>, nodesBSet: Set<string>): number {
  const { edgesA, edgesBSet } = classifyEdges(state, nodesASet, nodesBSet);
  return countMissing(edgesA, edgesBSet) / Math.max(edgesA.length, 1);
}

/**
 * Classifies alive edges into A-visible and B-visible buckets.
 */
function classifyEdges(
  state: WarpState,
  nodesASet: Set<string>,
  nodesBSet: Set<string>,
): { edgesA: string[]; edgesBSet: Set<string> } {
  const aliveEdges = filterAliveEdges(state);
  const edgesA = filterEdgesForNodeSet(aliveEdges, nodesASet);
  const edgesBSet = new Set(filterEdgesForNodeSet(aliveEdges, nodesBSet));
  return { edgesA, edgesBSet };
}

/**
 * Filters alive edges to those where both endpoints belong to a given node set.
 */
function filterEdgesForNodeSet(
  edges: Array<{ edgeKey: string; from: string; to: string }>,
  nodeSet: Set<string>,
): string[] {
  const result: string[] = [];
  for (const { edgeKey, from, to } of edges) {
    if (nodeSet.has(from) && nodeSet.has(to)) {
      result.push(edgeKey);
    }
  }
  return result;
}

/**
 * Filters edges to only those whose both endpoints are alive, returning decoded keys.
 */
function filterAliveEdges(state: WarpState): Array<{ edgeKey: string; from: string; to: string }> {
  const result: Array<{ edgeKey: string; from: string; to: string }> = [];
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
 */
function areBothEndpointsAlive(state: WarpState, from: string, to: string): boolean {
  return state.nodeAlive.contains(from) && state.nodeAlive.contains(to);
}

interface ObserverConfig {
  match: string | string[];
  expose?: string[];
  redact?: string[];
}

/**
 * Counts lost properties for a single node between two observer configs.
 */
function countNodePropLoss(
  nodeProps: Map<string, boolean>,
  opts: { configA: ObserverConfig; configB: ObserverConfig; nodeInB: boolean },
): { propsInA: number; lostProps: number } {
  const propsA = visiblePropKeys(nodeProps, opts.configA.expose, opts.configA.redact);
  if (!opts.nodeInB) {
    return { propsInA: propsA.size, lostProps: propsA.size };
  }
  const propsB = visiblePropKeys(nodeProps, opts.configB.expose, opts.configB.redact);
  return { propsInA: propsA.size, lostProps: countMissing(propsA, propsB) };
}

/**
 * Computes property loss across all A-visible nodes.
 */
function computePropLoss(
  state: WarpState,
  opts: { nodesA: string[]; nodesBSet: Set<string>; configA: ObserverConfig; configB: ObserverConfig },
): number {
  let totalPropsInA = 0;
  let totalLostProps = 0;

  for (const nodeId of opts.nodesA) {
    const nodeProps = collectNodePropKeys(state, nodeId);
    if (nodeProps.size === 0) {
      continue;
    }
    const { propsInA, lostProps } = countNodePropLoss(
      nodeProps,
      { configA: opts.configA, configB: opts.configB, nodeInB: opts.nodesBSet.has(nodeId) },
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
 * @param configA - Observer configuration for A
 * @param configB - Observer configuration for B
 * @param state - WarpState materialized state
 * @returns Cost and breakdown
 */
export function computeTranslationCost(
  configA: ObserverConfig,
  configB: ObserverConfig,
  state: WarpState,
): { cost: number; breakdown: { nodeLoss: number; edgeLoss: number; propLoss: number } } {
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
 * @throws {QueryError} If either config is missing or has an invalid match
 */
function validateObserverConfigs(configA: unknown, configB: unknown): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (!isValidMatchConfig(configA) || !isValidMatchConfig(configB)) {
    throw new QueryError(
      'configA.match and configB.match must be non-empty strings or non-empty arrays of strings',
      { code: 'E_TRANSLATION_COST_INVALID_MATCH' },
    );
  }
}

/**
 * Checks whether a config has a valid match property (non-empty string or string[]).
 */
function isValidMatchConfig(config: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (config === null || config === undefined || typeof config !== 'object') {
    return false;
  }
  const m = (config as { match?: unknown }).match; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return isValidMatch(m);
}

/**
 * Checks whether a match value is a non-empty string or non-empty string array.
 */
function isValidMatch(m: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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
 */
function isString(value: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return typeof value === 'string';
}
