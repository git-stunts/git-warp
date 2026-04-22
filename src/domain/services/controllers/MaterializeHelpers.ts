/**
 * MaterializeHelpers — pure functions for materialization pipelines.
 *
 * No host access. No ports. No side effects.
 */

import { createImmutableValue, createImmutableWarpState } from '../ImmutableSnapshot.ts';
import { QueryError } from '../../warp/_internal.ts';
import { decodeEdgeKey } from '../KeyCodec.ts';
import type WarpState from '../state/WarpState.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import StateSession from '../../orset/session/StateSession.ts';
import {
  collectAliveNodeSetFromSession,
  collectVisibleEdgesFromSession,
} from '../state/SessionVisibleGraph.ts';

// ── Public state freezing ───────────────────────────────────────────

/** Wraps materialized state in a frozen defensive copy. */
export function freezePublicState(state: WarpState): WarpState {
  return createImmutableWarpState(state);
}

/** Wraps state+receipts in a frozen result. */
export function freezeWithReceipts(state: WarpState, receipts: TickReceipt[]): { state: WarpState; receipts: TickReceipt[] } {
  return Object.freeze({
    state: freezePublicState(state),
    receipts: createImmutableValue(receipts),
  });
}

// ── Input normalization ─────────────────────────────────────────────

/** Validates and normalizes an explicit Lamport ceiling. */
export function normalizeExplicitCeiling(ceiling: number | null | undefined): number | null {
  if (ceiling === undefined || ceiling === null) {
    return null;
  }
  if (!Number.isInteger(ceiling) || ceiling < 0) {
    throw new QueryError('ceiling must be a non-negative integer or null', {
      code: 'E_QUERY_COORDINATE_INVALID',
      context: { ceiling },
    });
  }
  return ceiling;
}

/** Checks whether two frontier maps are structurally equal. */
export function frontiersEqual(a: Map<string, string> | null, b: Map<string, string>): boolean {
  if (a === null || a.size !== b.size) {
    return false;
  }
  for (const [writerId, sha] of b) {
    if (a.get(writerId) !== sha) {
      return false;
    }
  }
  return true;
}

function validateFrontierEntry(writerId: string, tipSha: string): void {
  if (writerId.length === 0 || tipSha.length === 0) {
    throw new QueryError('frontier entries must be non-empty string pairs', {
      code: 'E_QUERY_COORDINATE_INVALID',
      context: { writerId, tipSha },
    });
  }
}

function frontierEntries(input: Map<string, string> | Record<string, string>): Array<[string, string]> {
  if (input instanceof Map) {
    return [...input.entries()];
  }
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return Object.entries(input);
  }
  throw new QueryError('frontier must be a Map or string record', {
    code: 'E_QUERY_COORDINATE_INVALID',
    context: { frontierType: typeof input },
  });
}

/** Normalizes a frontier input to a sorted Map. */
export function normalizeFrontierInput(input: Map<string, string> | Record<string, string>): Map<string, string> {
  const entries = frontierEntries(input);
  for (const [writerId, tipSha] of entries) {
    validateFrontierEntry(writerId, tipSha);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return new Map(entries);
}

// ── Lamport tracking ────────────────────────────────────────────────

/** Finds the maximum lamport tick in a patch list. */
export function maxLamportInPatches(patches: Array<{ patch: { lamport?: number } }>): number {
  let max = 0;
  for (const { patch } of patches) {
    const tick = patch.lamport ?? 0;
    if (tick > max) { max = tick; }
  }
  return max;
}

// ── Adjacency building ──────────────────────────────────────────────

type NeighborEdge = { neighborId: string; label: string };
export type MaterializeAdjacency = {
  outgoing: Map<string, NeighborEdge[]>;
  incoming: Map<string, NeighborEdge[]>;
};

function ensureList(map: Map<string, NeighborEdge[]>, key: string): NeighborEdge[] {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  return list;
}

function sortNeighborList(list: NeighborEdge[]): void {
  list.sort((a, b) => {
    if (a.neighborId !== b.neighborId) {
      return a.neighborId < b.neighborId ? -1 : 1;
    }
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });
}

/** Builds a deterministic adjacency map from the alive edge set. */
export function buildAdjacency(state: WarpState): MaterializeAdjacency {
  const outgoing = new Map<string, NeighborEdge[]>();
  const incoming = new Map<string, NeighborEdge[]>();

  for (const edgeKey of state.edgeAlive.elements()) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (!state.nodeAlive.contains(from)) { continue; }
    if (!state.nodeAlive.contains(to)) { continue; }
    ensureList(outgoing, from).push({ neighborId: to, label });
    ensureList(incoming, to).push({ neighborId: from, label });
  }

  for (const list of outgoing.values()) { sortNeighborList(list); }
  for (const list of incoming.values()) { sortNeighborList(list); }
  return { outgoing, incoming };
}

/** Builds a deterministic adjacency map from session-backed alive sets. */
export async function buildAdjacencyFromSession(
  session: StateSession,
): Promise<MaterializeAdjacency> {
  const outgoing = new Map<string, NeighborEdge[]>();
  const incoming = new Map<string, NeighborEdge[]>();
  const aliveNodes = await collectAliveNodeSetFromSession(session);
  const visibleEdges = await collectVisibleEdgesFromSession(session, aliveNodes);

  for (const edge of visibleEdges) {
    ensureList(outgoing, edge.from).push({
      neighborId: edge.to,
      label: edge.label,
    });
    ensureList(incoming, edge.to).push({
      neighborId: edge.from,
      label: edge.label,
    });
  }

  for (const list of outgoing.values()) { sortNeighborList(list); }
  for (const list of incoming.values()) { sortNeighborList(list); }
  return { outgoing, incoming };
}
