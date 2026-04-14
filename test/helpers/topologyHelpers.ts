/**
 * Topology test helpers for creating WarpState-compatible graph states.
 *
 * These helpers produce states that are structurally identical to what
 * JoinReducer/materialize produce, using ORSets for node/edge liveness,
 * LWW for properties, and VersionVector for the observed frontier.
 *
 * @module test/helpers/topologyHelpers
 */

import { createEmptyState, applyOpV2 } from '../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import { EventId } from '../../src/domain/utils/EventId.ts';

/**
 * Creates a WarpState-compatible state representing a circular graph of n nodes.
 *
 * Nodes are named "n0", "n1", ..., "n{n-1}".
 * Edges: n0->n1, n1->n2, ..., n{n-2}->n{n-1}, n{n-1}->n0.
 * All edges use the label "edge".
 *
 * @param {number} n - Number of nodes (must be >= 2)
 * @returns {import('../../src/domain/services/JoinReducer.ts').WarpState}
 */
export function createCircular(n) {
  if (!Number.isInteger(n) || n < 2) {
    throw new Error('createCircular requires n >= 2');
  }

  const state = createEmptyState();
  const writer = 'topo';
  const sha = 'a'.repeat(40);
  let lamport = 1;
  let opIdx = 0;

  // Add nodes
  for (let i = 0; i < n; i++) {
    const nodeId = `n${i}`;
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  // Add edges: n0->n1, n1->n2, ..., n{n-1}->n0
  for (let i = 0; i < n; i++) {
    const from = `n${i}`;
    const to = `n${(i + 1) % n}`;
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label: 'edge', dot }, eventId);
    lamport++;
  }

  return state;
}

/**
 * Creates a WarpState-compatible state representing a diamond-shaped graph.
 *
 * Shape:
 * ```
 *     A
 *    / \
 *   B   C
 *    \ /
 *     D
 * ```
 *
 * Nodes: A, B, C, D
 * Edges: A->B, A->C, B->D, C->D (all with label "edge")
 *
 * @returns {import('../../src/domain/services/JoinReducer.ts').WarpState}
 */
export function createDiamond() {
  const state = createEmptyState();
  const writer = 'topo';
  const sha = 'a'.repeat(40);
  let lamport = 1;
  let opIdx = 0;

  const nodes = ['A', 'B', 'C', 'D'];
  const edges = [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
    { from: 'C', to: 'D' },
  ];

  // Add nodes
  for (const nodeId of nodes) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  // Add edges
  for (const { from, to } of edges) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label: 'edge', dot }, eventId);
    lamport++;
  }

  return state;
}
