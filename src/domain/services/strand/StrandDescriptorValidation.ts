/**
 * StrandDescriptorValidation — pure normalization and validation
 * helpers for strand lifecycle operations.
 *
 * Extracted from StrandService free functions. No host access.
 */

import StrandError from '../../errors/StrandError.ts';
import { validateWriterId } from '../../utils/RefLayout.ts';
import { generateWriterId } from '../../utils/WriterId.ts';
import { normalizeOptionalString, compareStrings } from './strandShared.ts';

/** Convert a frontier Map to a sorted plain object. */
export function frontierToRecord(frontier: Map<string, string>): Record<string, string> {
  return Object.fromEntries(
    [...frontier.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  );
}

/** Validate a Lamport ceiling, returning null for absent values. */
export function normalizeLamportCeiling(value: number | null | undefined): number | null {
  if (value === undefined || value === null) { return null; }
  if (!Number.isInteger(value) || value < 0) {
    throw new StrandError('lamportCeiling must be a non-negative integer or null', {
      code: 'E_STRAND_COORDINATE_INVALID',
      context: { lamportCeiling: value },
    });
  }
  return value;
}

/** Validate a lease expiration as ISO-8601, returning null for absent values. */
export function normalizeLeaseExpiresAt(value: string | null | undefined): string | null {
  if (value === undefined || value === null) { return null; }
  if (typeof value !== 'string') {
    throw new StrandError('leaseExpiresAt must be a string', {
      code: 'E_STRAND_INVALID_ARGS',
      context: { valueType: typeof value },
    });
  }
  if (!Number.isFinite(globalThis.Date.parse(value))) {
    throw new StrandError('leaseExpiresAt must be a valid ISO-8601 timestamp', {
      code: 'E_STRAND_INVALID_ARGS',
      context: { leaseExpiresAt: value },
    });
  }
  return value;
}

/** Validate an optional writable flag, returning null for absent values. */
export function normalizeWritable(value: boolean | null | undefined): boolean | null {
  if (value === undefined || value === null) { return null; }
  if (typeof value !== 'boolean') {
    throw new StrandError('writable must be boolean when provided', {
      code: 'E_STRAND_INVALID_ARGS',
      context: { field: 'writable', valueType: typeof value },
    });
  }
  return value;
}

/** Resolve a strand ID, generating a fresh one if not provided. */
export function resolveStrandId(strandId: string | undefined | null): string {
  if (strandId !== undefined && strandId !== null) {
    try {
      validateWriterId(strandId);
      return strandId;
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${(err instanceof Error) ? err.message : String(err)}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
      });
    }
  }
  const fresh = generateWriterId().replace(/^w_/, 'ws_');
  validateWriterId(fresh);
  return fresh;
}

/** Check whether two frontier records have identical sorted key-value pairs. */
export function frontierRecordsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const l = Object.entries(left).sort(([a], [b]) => compareStrings(a, b));
  const r = Object.entries(right).sort(([a], [b]) => compareStrings(a, b));
  if (l.length !== r.length) { return false; }
  return l.every(([lk, lv], i) => {
    const re = r[i];
    return re !== undefined && lk === re[0] && lv === re[1];
  });
}

/** Normalized create options. */
export type NormalizedCreateOptions = {
  strandId: string;
  lamportCeiling: number | null;
  owner: string | null;
  scope: string | null;
  leaseExpiresAt: string | null;
};

/** Normalize raw create options into validated form. */
export function normalizeCreateOptions(options: {
  strandId?: string;
  lamportCeiling?: number | null;
  owner?: string | null;
  scope?: string | null;
  leaseExpiresAt?: string | null;
}): NormalizedCreateOptions {
  return {
    strandId: resolveStrandId(options.strandId),
    lamportCeiling: normalizeLamportCeiling(options.lamportCeiling),
    owner: normalizeOptionalString(options.owner, 'owner'),
    scope: normalizeOptionalString(options.scope, 'scope'),
    leaseExpiresAt: normalizeLeaseExpiresAt(options.leaseExpiresAt),
  };
}

/** Check whether a patch touches a given entity in its reads or writes. */
export function patchTouchesEntity(patch: { reads?: string[]; writes?: string[] }, entityId: string): boolean {
  if (patch.reads !== undefined && patch.reads.includes(entityId)) { return true; }
  if (patch.writes !== undefined && patch.writes.includes(entityId)) { return true; }
  return false;
}

function rejectSelfBraid(id: string, selfStrandId: string): void {
  if (id === selfStrandId) {
    throw new StrandError('A strand cannot braid with itself', {
      code: 'E_STRAND_BRAID_SELF',
      context: { strandId: selfStrandId },
    });
  }
}

function deduplicateIds(ids: string[], selfStrandId: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const n = normalizeOptionalString(id, 'braidedStrandIds[]');
    if (n === null || seen.has(n)) { continue; }
    rejectSelfBraid(n, selfStrandId);
    seen.add(n);
    result.push(n);
  }
  return result;
}

/** Normalize and validate braided strand IDs. */
export function normalizeBraidedStrandIds(ids: string[] | undefined, selfStrandId: string): string[] {
  if (!Array.isArray(ids) || ids.length === 0) { return []; }
  return deduplicateIds(ids, selfStrandId);
}
