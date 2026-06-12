/**
 * compareVisibleState — public entry point for visible-state comparison.
 *
 * Orchestrates readers, delta collection, and summary assembly.
 * All heavy lifting lives in diffKeys, diffProperties, and diffStructure.
 *
 * @module domain/services/comparison/VisibleStateComparison
 */

import type { VisibleStateComparison } from '../../types/CoordinateComparison.ts';
import type WarpState from '../state/WarpState.ts';
import { createStateReader } from '../state/StateReader.ts';
import { summarizeReader, collectNodeProperties, collectEdgeProperties } from './diffKeys.ts';
import { compareNodePropertyMaps, compareEdgePropertyMaps } from './diffProperties.ts';
import {
  buildNodeDelta,
  buildEdgeDelta,
  hasVisibleStateChanges,
  normalizeTargetId,
  buildTargetComparison,
} from './diffStructure.ts';

const VISIBLE_STATE_COMPARISON_VERSION = 'visible-state-compare/v1';

// ── Summary builders ─────────────────────────────────────────────────────────

/**
 * Builds the node/edge counts portion of the comparison summary.
 */
function buildTopologySummary(
  nodeDelta: { added: string[]; removed: string[] },
  edgeDelta: { added: Array<unknown>; removed: Array<unknown> }, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
): {
  nodes: { added: number; removed: number };
  edges: { added: number; removed: number };
} {
  return {
    nodes: {
      added: nodeDelta.added.length,
      removed: nodeDelta.removed.length,
    },
    edges: {
      added: edgeDelta.added.length,
      removed: edgeDelta.removed.length,
    },
  };
}

/**
 * Builds the property counts portion of the comparison summary.
 */
function buildPropertySummary(
  nodePropertyDelta: { added: Array<unknown>; removed: Array<unknown>; changed: Array<unknown> }, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  edgePropertyDelta: { added: Array<unknown>; removed: Array<unknown>; changed: Array<unknown> }, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
): {
  nodeProperties: { added: number; removed: number; changed: number };
  edgeProperties: { added: number; removed: number; changed: number };
} {
  return {
    nodeProperties: {
      added: nodePropertyDelta.added.length,
      removed: nodePropertyDelta.removed.length,
      changed: nodePropertyDelta.changed.length,
    },
    edgeProperties: {
      added: edgePropertyDelta.added.length,
      removed: edgePropertyDelta.removed.length,
      changed: edgePropertyDelta.changed.length,
    },
  };
}

type ReaderSummary = ReturnType<typeof summarizeReader>;

/**
 * Assembles the full comparison summary from left/right summaries and deltas.
 */
function buildComparisonSummary(params: {
  leftSummary: ReaderSummary;
  rightSummary: ReaderSummary;
  nodeDelta: { added: string[]; removed: string[] };
  edgeDelta: { added: Array<unknown>; removed: Array<unknown> }; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  nodePropertyDelta: { added: Array<unknown>; removed: Array<unknown>; changed: Array<unknown> }; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  edgePropertyDelta: { added: Array<unknown>; removed: Array<unknown>; changed: Array<unknown> }; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}): VisibleStateComparison['summary'] {
  const { leftSummary, rightSummary, nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta } = params;
  return {
    left: leftSummary,
    right: rightSummary,
    ...buildTopologySummary(nodeDelta, edgeDelta),
    ...buildPropertySummary(nodePropertyDelta, edgePropertyDelta),
  };
}

// ── Delta collection ─────────────────────────────────────────────────────────

/**
 * Collects all deltas between two readers (nodes, edges, properties).
 */
function collectAllDeltas(
  leftReader: ReturnType<typeof createStateReader>,
  rightReader: ReturnType<typeof createStateReader>,
): {
  nodeDelta: ReturnType<typeof buildNodeDelta>;
  edgeDelta: ReturnType<typeof buildEdgeDelta>;
  nodePropertyDelta: ReturnType<typeof compareNodePropertyMaps>;
  edgePropertyDelta: ReturnType<typeof compareEdgePropertyMaps>;
} {
  return {
    nodeDelta: buildNodeDelta(leftReader, rightReader),
    edgeDelta: buildEdgeDelta(leftReader, rightReader),
    nodePropertyDelta: compareNodePropertyMaps(
      collectNodeProperties(leftReader),
      collectNodeProperties(rightReader),
    ),
    edgePropertyDelta: compareEdgePropertyMaps(
      collectEdgeProperties(leftReader),
      collectEdgeProperties(rightReader),
    ),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

type AllDeltas = ReturnType<typeof collectAllDeltas>;

type AssembleParams = {
  deltas: AllDeltas;
  leftSummary: ReaderSummary;
  rightSummary: ReaderSummary;
  target: ReturnType<typeof buildTargetComparison>;
};

function assembleResult({ deltas, leftSummary, rightSummary, target }: AssembleParams): VisibleStateComparison {
  const { nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta } = deltas;
  const changed = hasVisibleStateChanges({ nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta });
  return {
    comparisonVersion: VISIBLE_STATE_COMPARISON_VERSION,
    changed,
    summary: buildComparisonSummary({ leftSummary, rightSummary, nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta }),
    nodes: nodeDelta,
    edges: edgeDelta,
    nodeProperties: nodePropertyDelta,
    edgeProperties: edgePropertyDelta,
    ...(target !== undefined ? { target } : {}),
  };
}

/**
 * Compares two materialized states using only their visible substrate truth.
 *
 * The comparison remains reducer-agnostic and application-blind:
 * - visible node deltas
 * - visible edge deltas
 * - visible node-property deltas
 * - visible edge-property deltas
 * - optional node-local target diff helper
 */
export function compareVisibleState(
  leftState: WarpState,
  rightState: WarpState,
  options: { targetId?: string | null } = {},
): VisibleStateComparison {
  const leftReader = createStateReader(leftState);
  const rightReader = createStateReader(rightState);
  return assembleResult({
    deltas: collectAllDeltas(leftReader, rightReader),
    leftSummary: summarizeReader(leftReader),
    rightSummary: summarizeReader(rightReader),
    target: buildTargetComparison(leftReader, rightReader, normalizeTargetId(options.targetId)),
  });
}
