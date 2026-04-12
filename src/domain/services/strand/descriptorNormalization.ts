/**
 * Module-level normalization helpers shared by StrandDescriptorStore.
 *
 * @module domain/services/strand/descriptorNormalization
 */

import { compareStrings, normalizeOptionalString, normalizeStringArray } from './strandShared.js';
import type { StrandDescriptor } from '../../utils/parseStrandBlob.ts';

export type StrandReadOverlayDescriptor = {
  strandId: string;
  overlayId: string;
  kind: string;
  headPatchSha: string | null;
  patchCount: number;
};

const READ_OVERLAY_FIELDS = [
  'strandId',
  'overlayId',
  'kind',
  'headPatchSha',
  'patchCount',
] as const;

/**
 * Narrow an unknown value to a plain record, returning null when the shape does not match.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Normalize a raw integer into a positive sequence number with fallback.
 */
export function normalizePositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}

/**
 * Normalize a raw integer into a non-negative count with fallback.
 */
export function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fallback;
}

/**
 * Normalize one required string field from a record, defaulting to empty string.
 */
export function normalizeRequiredString(
  record: Record<string, unknown>,
  key: string,
  field: string,
): string {
  return normalizeOptionalString(record[key] as string | null | undefined, field) ?? '';
}

/**
 * Coerce an unknown value into a sorted array of read-overlay descriptors.
 */
export function normalizeReadOverlays(value: unknown): StrandReadOverlayDescriptor[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[])
    .map((entry) => {
      const overlay = entry as Record<string, unknown>;
      return {
        strandId: overlay['strandId'] as string,
        overlayId: overlay['overlayId'] as string,
        kind: overlay['kind'] as string,
        headPatchSha: (overlay['headPatchSha'] ?? null) as string | null,
        patchCount: overlay['patchCount'] as number,
      };
    })
    .sort((left, right) => compareStrings(left.strandId, right.strandId));
}

/**
 * Check whether two read-overlay arrays are structurally identical.
 */
export function readOverlaysEqual(
  left: StrandReadOverlayDescriptor[],
  right: StrandReadOverlayDescriptor[],
): boolean {
  return (
    left.length === right.length &&
    left.every((overlay, index) => readOverlayEqual(overlay, right[index]))
  );
}

/**
 * Check whether two read-overlay descriptors are structurally identical.
 */
export function readOverlayEqual(
  overlay: StrandReadOverlayDescriptor,
  candidate: StrandReadOverlayDescriptor | undefined,
): boolean {
  if (candidate === null || candidate === undefined) {
    return false;
  }
  return READ_OVERLAY_FIELDS.every((field) => overlay[field] === candidate[field]);
}

/**
 * Return true if descriptor overlay metadata matches the expected values.
 */
export function overlayMetadataMatches(
  descriptor: StrandDescriptor & { overlay: { writable: boolean } },
  expected: { headPatchSha: string | null; patchCount: number; writable: boolean },
): boolean {
  return (
    descriptor.overlay.headPatchSha === expected.headPatchSha &&
    descriptor.overlay.patchCount === expected.patchCount &&
    descriptor.overlay.writable === expected.writable
  );
}

// ── Types referenced in normalization ────────────────────────────────────────

export type StrandRejectedCounterfactual = {
  intentId: string;
  reason: string;
  conflictsWith: string[];
  reads: string[];
  writes: string[];
};

export type StrandTickRecord = {
  tickId: string;
  strandId: string;
  tickIndex: number;
  createdAt: string;
  drainedIntentCount: number;
  admittedIntentIds: string[];
  rejected: StrandRejectedCounterfactual[];
  baseOverlayHeadPatchSha: string | null;
  overlayHeadPatchSha: string | null;
  overlayPatchShas: string[];
};

export type StrandQueuedIntent = {
  intentId: string;
  enqueuedAt: string;
  patch: import('../../types/Patch.ts').default;
  reads: string[];
  writes: string[];
  contentBlobOids: string[];
};

export type StrandIntentQueue = {
  nextIntentSeq: number;
  intents: StrandQueuedIntent[];
};

export type StrandEvolution = {
  tickCount: number;
  lastTick: StrandTickRecord | null;
};

// ── Normalization functions that were previously methods on the class ────────

/**
 * Coerce an unknown value into a validated intent queue with sequence counter.
 */
export function normalizeIntentQueue(
  value: unknown,
  normalizeQueuedIntentsFn: (value: unknown) => StrandQueuedIntent[],
): StrandIntentQueue {
  const record = asRecord(value);
  if (record === null) {
    return { nextIntentSeq: 1, intents: [] };
  }
  return {
    nextIntentSeq: normalizePositiveInteger(record['nextIntentSeq'], 1),
    intents: normalizeQueuedIntentsFn(record['intents']),
  };
}

/**
 * Coerce an unknown value into a validated evolution record with tick count.
 */
export function normalizeEvolution(
  value: unknown,
  normalizeLastTickFn: (lastTick: Record<string, unknown> | null) => StrandTickRecord | null,
): StrandEvolution {
  const record = asRecord(value);
  if (record === null) {
    return { tickCount: 0, lastTick: null };
  }
  return {
    tickCount: normalizeNonNegativeInteger(record['tickCount'], 0),
    lastTick: normalizeLastTickFn(asRecord(record['lastTick'])),
  };
}

/**
 * Parse an unknown array into validated rejected-counterfactual records.
 */
export function normalizeRejectedCounterfactuals(value: unknown): StrandRejectedCounterfactual[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[]).map((rawEntry) => {
    const candidate = asRecord(rawEntry) ?? {};
    return {
      intentId: normalizeRequiredString(candidate, 'intentId', 'intentId'),
      reason: normalizeRequiredString(candidate, 'reason', 'reason'),
      conflictsWith: normalizeStringArray(candidate['conflictsWith'], 'conflictsWith[]'),
      reads: normalizeStringArray(candidate['reads'], 'reads[]'),
      writes: normalizeStringArray(candidate['writes'], 'writes[]'),
    };
  });
}

/**
 * Validate and normalize a raw last-tick record into a typed tick record.
 */
export function normalizeLastTick(lastTick: Record<string, unknown> | null): StrandTickRecord | null {
  if (!lastTick) {
    return null;
  }
  return {
    tickId: normalizeRequiredString(lastTick, 'tickId', 'tickId'),
    strandId: normalizeRequiredString(lastTick, 'strandId', 'strandId'),
    tickIndex: normalizeNonNegativeInteger(lastTick['tickIndex'], 0),
    createdAt: normalizeRequiredString(lastTick, 'createdAt', 'createdAt'),
    drainedIntentCount: normalizeNonNegativeInteger(lastTick['drainedIntentCount'], 0),
    admittedIntentIds: normalizeStringArray(lastTick['admittedIntentIds'], 'admittedIntentIds[]'),
    rejected: normalizeRejectedCounterfactuals(lastTick['rejected']),
    baseOverlayHeadPatchSha: normalizeOptionalString(
      lastTick['baseOverlayHeadPatchSha'] as string | null | undefined,
      'baseOverlayHeadPatchSha',
    ),
    overlayHeadPatchSha: normalizeOptionalString(
      lastTick['overlayHeadPatchSha'] as string | null | undefined,
      'overlayHeadPatchSha',
    ),
    overlayPatchShas: normalizeStringArray(lastTick['overlayPatchShas'], 'overlayPatchShas[]'),
  };
}

/**
 * Parse one queued-intent entry, dropping malformed records.
 */
export function normalizeQueuedIntentEntry(rawEntry: unknown): StrandQueuedIntent[] {
  const candidate = asRecord(rawEntry);
  if (candidate === null) {
    return [];
  }
  const identity = resolveQueuedIntentIdentity(candidate);
  if (identity === null) {
    return [];
  }
  const { patch, intentId, enqueuedAt } = identity;
  return [{
    intentId,
    enqueuedAt,
    patch,
    reads: normalizeStringArray(candidate['reads'] ?? (patch as { reads?: unknown }).reads, 'reads[]'),
    writes: normalizeStringArray(candidate['writes'] ?? (patch as { writes?: unknown }).writes, 'writes[]'),
    contentBlobOids: normalizeStringArray(candidate['contentBlobOids'], 'contentBlobOids[]'),
  }];
}

/**
 * Parse and validate an unknown array into typed queued intents, discarding malformed entries.
 */
export function normalizeQueuedIntents(value: unknown): StrandQueuedIntent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[])
    .flatMap((rawEntry) => normalizeQueuedIntentEntry(rawEntry))
    .sort((left, right) => compareStrings(left.intentId, right.intentId));
}

/**
 * Resolve the required identity fields for one queued-intent record.
 */
export function resolveQueuedIntentIdentity(
  candidate: Record<string, unknown>,
): { patch: import('../../types/Patch.ts').default; intentId: string; enqueuedAt: string } | null {
  const patch = candidate['patch'] as import('../../types/Patch.ts').default | undefined;
  const intentId = normalizeRequiredString(candidate, 'intentId', 'intentId');
  const enqueuedAt = normalizeRequiredString(candidate, 'enqueuedAt', 'enqueuedAt');
  if (patch === undefined || intentId.length === 0 || enqueuedAt.length === 0) {
    return null;
  }
  return { patch, intentId, enqueuedAt };
}
