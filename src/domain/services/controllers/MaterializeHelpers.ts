/**
 * MaterializeHelpers — pure functions for materialization pipelines.
 *
 * No host access. No ports. No side effects.
 */

import { createImmutableValue, createImmutableWarpState } from '../ImmutableSnapshot.js';
import { QueryError } from '../../warp/_internal.ts';
import type WarpState from '../state/WarpState.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';

/** Wraps materialized state in a frozen defensive copy. */
export function freezePublicState(state: WarpState): WarpState {
  return createImmutableWarpState(state);
}

/** Wraps state+receipts in a frozen result. */
export function freezeWithReceipts(state: WarpState, receipts: TickReceipt[]): { state: WarpState; receipts: TickReceipt[] } {
  return Object.freeze({
    state: freezePublicState(state),
    receipts: createImmutableValue(receipts) as TickReceipt[],
  });
}

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
  if (!a || a.size !== b.size) {
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
  if (typeof writerId !== 'string' || writerId.length === 0) {
    throw new QueryError('frontier entries must be non-empty string pairs', {
      code: 'E_QUERY_COORDINATE_INVALID',
      context: { writerId, tipSha },
    });
  }
  if (typeof tipSha !== 'string' || tipSha.length === 0) {
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
  const sorted = entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return new Map(sorted);
}

/** Finds the maximum lamport tick in a patch list. */
export function maxLamportInPatches(patches: Array<{ patch: { lamport?: number } }>): number {
  let max = 0;
  for (const { patch } of patches) {
    const tick = patch.lamport ?? 0;
    if (tick > max) { max = tick; }
  }
  return max;
}
