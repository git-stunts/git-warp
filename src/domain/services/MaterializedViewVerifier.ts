/**
 * Verify helpers for MaterializedViewService.
 *
 * Provides deterministic sampling and adjacency-based ground-truth
 * comparison to confirm that a LogicalIndex is consistent with WarpState.
 *
 * @module domain/services/MaterializedViewVerifier
 */

import { decodeEdgeKey } from './KeyCodec.js';
import type WarpState from './state/WarpState.ts';
import type { LogicalIndex } from './index/logicalIndexHelpers.ts';

// ── Public types ──────────────────────────────────────────────────────────────

export interface VerifyError {
  nodeId: string;
  direction: string;
  expected: string[];
  actual: string[];
}

export interface VerifyResult {
  passed: number;
  failed: number;
  errors: VerifyError[];
  seed: number;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface AdjacencyEntry {
  neighborId: string;
  label: string;
}

type AdjacencyMap = Map<string, AdjacencyEntry[]>;

interface GroundTruth {
  outgoing: AdjacencyMap;
  incoming: AdjacencyMap;
}

// ── PRNG ──────────────────────────────────────────────────────────────────────

/**
 * Mulberry32 PRNG — deterministic 32-bit generator from a seed.
 *
 * mulberry32 is a fast 32-bit PRNG by Tommy Ettinger. The magic constants
 * (0x6D2B79F5, shifts 15/13/16) are part of the published algorithm.
 * See: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 */
function mulberry32(seed: number): () => number {
  let t = (seed | 0) + 0x6D2B79F5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Selects a deterministic sample of nodes using a seeded PRNG.
 *
 * @param allNodes - All candidate node IDs.
 * @param sampleRate - Fraction of nodes to select (>0 and <=1).
 * @param seed - PRNG seed for determinism.
 */
function sampleNodes(allNodes: string[], sampleRate: number, seed: number): string[] {
  if (sampleRate >= 1) {
    return allNodes;
  }
  if (sampleRate <= 0 || allNodes.length === 0) {
    return [];
  }
  const rng = mulberry32(seed);
  const sampled = allNodes.filter(() => rng() < sampleRate);
  // When the initial sample is empty (e.g., graph has fewer nodes than
  // sample size), fall back to using all available nodes.
  if (sampled.length === 0) {
    sampled.push(allNodes[Math.floor(rng() * allNodes.length)] as string);
  }
  return sampled;
}

// ── Ground-truth adjacency ────────────────────────────────────────────────────

function pushAdjacencyEntry(map: AdjacencyMap, key: string, entry: AdjacencyEntry): void {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  list.push(entry);
}

/**
 * Builds adjacency maps from state for ground-truth verification.
 */
function buildGroundTruthAdjacency(state: WarpState): GroundTruth {
  const outgoing: AdjacencyMap = new Map();
  const incoming: AdjacencyMap = new Map();

  for (const edgeKey of state.edgeAlive.elements()) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (!state.nodeAlive.contains(from) || !state.nodeAlive.contains(to)) {
      continue;
    }
    pushAdjacencyEntry(outgoing, from, { neighborId: to, label });
    pushAdjacencyEntry(incoming, to, { neighborId: from, label });
  }

  return { outgoing, incoming };
}

// ── Comparison helpers ────────────────────────────────────────────────────────

/**
 * Canonicalizes neighbor edges into deterministic, label-aware signatures.
 */
function canonicalizeNeighborSignatures(edges: AdjacencyEntry[]): string[] {
  const byNeighbor = new Map<string, string[]>();
  for (const { neighborId, label } of edges) {
    let labels = byNeighbor.get(neighborId);
    if (!labels) {
      labels = [];
      byNeighbor.set(neighborId, labels);
    }
    labels.push(label);
  }
  const signatures: string[] = [];
  for (const [neighborId, labels] of byNeighbor) {
    signatures.push(JSON.stringify([neighborId, labels.slice().sort()]));
  }
  signatures.sort();
  return signatures;
}

/**
 * Compares bitmap index neighbors against ground-truth adjacency for one node.
 */
function compareNodeDirection(params: {
  nodeId: string;
  direction: string;
  logicalIndex: LogicalIndex;
  truthMap: AdjacencyMap;
}): VerifyError | null {
  const { nodeId, direction, logicalIndex, truthMap } = params;
  const bitmapEdges = logicalIndex.getEdges(nodeId, direction);
  const actual = canonicalizeNeighborSignatures(bitmapEdges);
  const expected = canonicalizeNeighborSignatures(truthMap.get(nodeId) ?? []);

  if (actual.length !== expected.length) {
    return { nodeId, direction, expected, actual };
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      return { nodeId, direction, expected, actual };
    }
  }
  return null;
}

interface VerifyCtx {
  truth: GroundTruth;
  acc: { passed: number; errors: VerifyError[] };
}

function verifyOneNode(nodeId: string, logicalIndex: LogicalIndex, ctx: VerifyCtx): void {
  if (!logicalIndex.isAlive(nodeId)) {
    ctx.acc.errors.push({ nodeId, direction: 'alive', expected: ['true'], actual: ['false'] });
    return;
  }
  for (const direction of ['out', 'in']) {
    const truthMap = direction === 'out' ? ctx.truth.outgoing : ctx.truth.incoming;
    const err = compareNodeDirection({ nodeId, direction, logicalIndex, truthMap });
    if (err) {
      ctx.acc.errors.push(err);
    } else {
      ctx.acc.passed++;
    }
  }
}

function verifySampledNodes(
  sampled: string[],
  logicalIndex: LogicalIndex,
  truth: GroundTruth,
): { passed: number; errors: VerifyError[] } {
  const acc = { passed: 0, errors: [] as VerifyError[] };
  const ctx: VerifyCtx = { truth, acc };
  for (const nodeId of sampled) {
    verifyOneNode(nodeId, logicalIndex, ctx);
  }
  return acc;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface VerifyIndexParams {
  state: WarpState;
  logicalIndex: LogicalIndex;
  options?: { seed?: number; sampleRate?: number };
}

/**
 * Verifies index integrity by sampling alive nodes and comparing
 * bitmap neighbor queries against adjacency-based ground truth.
 */
export function verifyIndex({ state, logicalIndex, options = {} }: VerifyIndexParams): VerifyResult {
  // eslint-disable-next-line no-restricted-syntax -- legacy: use seeded PRNG (tracked in backlog)
  const seed = options.seed ?? (Math.random() * 0x7FFFFFFF >>> 0);
  const sampleRate = options.sampleRate ?? 0.1;
  const allNodes = [...state.nodeAlive.elements()].sort();
  const sampled = sampleNodes(allNodes, sampleRate, seed);
  const truth = buildGroundTruthAdjacency(state);

  const { passed, errors } = verifySampledNodes(sampled, logicalIndex, truth);
  return { passed, failed: errors.length, errors, seed };
}
