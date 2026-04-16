/**
 * Module-level normalization helpers shared by StrandDescriptorStore.
 *
 * The strand descriptor parser (`parseStrandBlob`) validates identity
 * and coordinate fields but leaves `intentQueue` and `evolution`
 * trailing fields as unvalidated `[key: string]: unknown`. This module
 * is the boundary decoder that converts those raw trailing bags into
 * the typed strand model (StrandIntentQueue, StrandEvolution, etc.).
 *
 * Only two type-guard predicates carry `unknown` — that is the local
 * boundary surface. Everything downstream is typed.
 *
 * @module domain/services/strand/descriptorNormalization
 */

import StrandError from '../../errors/StrandError.ts';
import { compareStrings, normalizeOptionalString, normalizeStringArray } from './strandShared.ts';
import type { StrandDescriptor } from '../../utils/parseStrandBlob.ts';

// ── Raw blob shape (type-guard narrowed) ─────────────────────────────────────

/**
 * Recursive hashable shape produced by JSON-decoded blob fields. The
 * strand descriptor blob was already JSON-parsed; the trailing
 * `intentQueue`/`evolution` fields carry values of this shape even
 * though parseStrandBlob leaves them typed as unknown.
 */
export type RawValue =
  | string
  | number
  | boolean
  | null
  | readonly RawValue[]
  | RawBag
  | undefined;

/**
 * A plain-object bag produced by JSON decode. Used as the post-
 * narrowing structural type for the trailing descriptor fields.
 */
export type RawBag = { readonly [key: string]: RawValue };

/**
 * Type-guard predicate: narrows unknown → RawBag.
 */
function isRawBag(value: unknown): value is RawBag {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type-guard predicate: narrows unknown → readonly RawValue[].
 */
function isRawArray(value: unknown): value is readonly RawValue[] {
  return Array.isArray(value);
}

// ── Read-overlay descriptor ─────────────────────────────────────────────────

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
 * Narrow an unknown blob value to a RawBag, returning null when the
 * shape does not match. This is the single boundary entry point
 * where `unknown` crosses into typed code.
 */
export function asRecord(value: unknown): RawBag | null {
  if (!isRawBag(value)) {
    return null;
  }
  return value;
}

/**
 * Narrow a RawValue to a positive integer, else fallback.
 */
function narrowPositiveInt(value: RawValue, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Narrow a RawValue to a non-negative integer, else fallback.
 */
function narrowNonNegativeInt(value: RawValue, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Typed normalizer: narrows a RawValue to a positive integer, else
 * returns the fallback. Public surface kept for backward
 * compatibility with the prior helper name.
 */
export function normalizePositiveInteger(value: RawValue, fallback: number): number {
  return narrowPositiveInt(value, fallback);
}

/**
 * Typed normalizer: narrows a RawValue to a non-negative integer,
 * else returns the fallback.
 */
export function normalizeNonNegativeInteger(value: RawValue, fallback: number): number {
  return narrowNonNegativeInt(value, fallback);
}

/**
 * Normalize a required string field out of a raw bag. Rejects with
 * a StrandError when the value is present but not a string.
 * Preserves the defensive boundary contract that existed before
 * cycle 0025B3 tightened the TS types.
 */
export function normalizeRequiredString(
  record: RawBag,
  key: string,
  field: string,
): string {
  const value = record[key];
  if (value === undefined || value === null) {
    return normalizeOptionalString(null, field) ?? '';
  }
  if (typeof value !== 'string') {
    throw new StrandError(`${field} must be a string`, {
      code: 'E_STRAND_INVALID_ARGS',
      context: { field, valueType: typeof value },
    });
  }
  return normalizeOptionalString(value, field) ?? '';
}

/**
 * Coerce a raw value into a sorted array of read-overlay descriptors.
 */
export function normalizeReadOverlays(value: RawValue): StrandReadOverlayDescriptor[] {
  if (!isRawArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOverlayFromRaw(entry))
    .sort((left, right) => compareStrings(left.strandId, right.strandId));
}

function readOverlayFromRaw(entry: RawValue): StrandReadOverlayDescriptor {
  const overlay: RawBag = isRawBag(entry) ? entry : {};
  const strandId = typeof overlay['strandId'] === 'string' ? overlay['strandId'] : '';
  const overlayId = typeof overlay['overlayId'] === 'string' ? overlay['overlayId'] : '';
  const kind = typeof overlay['kind'] === 'string' ? overlay['kind'] : '';
  const headPatchSha = typeof overlay['headPatchSha'] === 'string' ? overlay['headPatchSha'] : null;
  const patchCount = typeof overlay['patchCount'] === 'number' ? overlay['patchCount'] : 0;
  return { strandId, overlayId, kind, headPatchSha, patchCount };
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

// ── Typed strand model returned by normalization ─────────────────────────────

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

// ── Normalization functions ──────────────────────────────────────────────────

/**
 * Coerce a raw value into a validated intent queue with sequence counter.
 */
export function normalizeIntentQueue(
  value: RawValue,
  normalizeQueuedIntentsFn: (value: RawValue) => StrandQueuedIntent[],
): StrandIntentQueue {
  const record = isRawBag(value) ? value : null;
  if (record === null) {
    return { nextIntentSeq: 1, intents: [] };
  }
  return {
    nextIntentSeq: narrowPositiveInt(record['nextIntentSeq'], 1),
    intents: normalizeQueuedIntentsFn(record['intents']),
  };
}

/**
 * Coerce a raw value into a validated evolution record with tick count.
 */
export function normalizeEvolution(
  value: RawValue,
  normalizeLastTickFn: (lastTick: RawBag | null) => StrandTickRecord | null,
): StrandEvolution {
  const record = isRawBag(value) ? value : null;
  if (record === null) {
    return { tickCount: 0, lastTick: null };
  }
  const lastTickRaw = record['lastTick'];
  const lastTickBag = isRawBag(lastTickRaw) ? lastTickRaw : null;
  return {
    tickCount: narrowNonNegativeInt(record['tickCount'], 0),
    lastTick: normalizeLastTickFn(lastTickBag),
  };
}

/**
 * Parse a raw array into validated rejected-counterfactual records.
 */
export function normalizeRejectedCounterfactuals(value: RawValue): StrandRejectedCounterfactual[] {
  if (!isRawArray(value)) {
    return [];
  }
  return value.map((rawEntry) => {
    const candidate: RawBag = isRawBag(rawEntry) ? rawEntry : {};
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
export function normalizeLastTick(lastTick: RawBag | null): StrandTickRecord | null {
  if (!lastTick) {
    return null;
  }
  const baseOverlayHeadPatchSha = typeof lastTick['baseOverlayHeadPatchSha'] === 'string'
    ? lastTick['baseOverlayHeadPatchSha']
    : null;
  const overlayHeadPatchSha = typeof lastTick['overlayHeadPatchSha'] === 'string'
    ? lastTick['overlayHeadPatchSha']
    : null;
  return {
    tickId: normalizeRequiredString(lastTick, 'tickId', 'tickId'),
    strandId: normalizeRequiredString(lastTick, 'strandId', 'strandId'),
    tickIndex: narrowNonNegativeInt(lastTick['tickIndex'], 0),
    createdAt: normalizeRequiredString(lastTick, 'createdAt', 'createdAt'),
    drainedIntentCount: narrowNonNegativeInt(lastTick['drainedIntentCount'], 0),
    admittedIntentIds: normalizeStringArray(lastTick['admittedIntentIds'], 'admittedIntentIds[]'),
    rejected: normalizeRejectedCounterfactuals(lastTick['rejected']),
    baseOverlayHeadPatchSha: normalizeOptionalString(baseOverlayHeadPatchSha, 'baseOverlayHeadPatchSha'),
    overlayHeadPatchSha: normalizeOptionalString(overlayHeadPatchSha, 'overlayHeadPatchSha'),
    overlayPatchShas: normalizeStringArray(lastTick['overlayPatchShas'], 'overlayPatchShas[]'),
  };
}

/**
 * Parse one queued-intent entry, dropping malformed records.
 */
export function normalizeQueuedIntentEntry(rawEntry: RawValue): StrandQueuedIntent[] {
  const candidate = isRawBag(rawEntry) ? rawEntry : null;
  if (candidate === null) {
    return [];
  }
  const identity = resolveQueuedIntentIdentity(candidate);
  if (identity === null) {
    return [];
  }
  const { patch, intentId, enqueuedAt } = identity;
  const patchReads = readsFromPatch(patch);
  const patchWrites = writesFromPatch(patch);
  return [{
    intentId,
    enqueuedAt,
    patch,
    reads: normalizeStringArray(candidate['reads'] ?? patchReads ?? null, 'reads[]'),
    writes: normalizeStringArray(candidate['writes'] ?? patchWrites ?? null, 'writes[]'),
    contentBlobOids: normalizeStringArray(candidate['contentBlobOids'], 'contentBlobOids[]'),
  }];
}

function readsFromPatch(patch: import('../../types/Patch.ts').default): readonly string[] | null {
  return Array.isArray(patch.reads) ? patch.reads : null;
}

function writesFromPatch(patch: import('../../types/Patch.ts').default): readonly string[] | null {
  return Array.isArray(patch.writes) ? patch.writes : null;
}

/**
 * Parse and validate a raw array into typed queued intents, discarding malformed entries.
 */
export function normalizeQueuedIntents(value: RawValue): StrandQueuedIntent[] {
  if (!isRawArray(value)) {
    return [];
  }
  return value
    .flatMap((rawEntry) => normalizeQueuedIntentEntry(rawEntry))
    .sort((left, right) => compareStrings(left.intentId, right.intentId));
}

/**
 * Resolve the required identity fields for one queued-intent record.
 * Returns null when required identity fields are missing.
 */
export function resolveQueuedIntentIdentity(
  candidate: RawBag,
): { patch: import('../../types/Patch.ts').default; intentId: string; enqueuedAt: string } | null {
  const rawPatch = candidate['patch'];
  if (!isRawBag(rawPatch)) {
    return null;
  }
  // The patch inside the intent bag is a constructed Patch instance
  // that travels as a plain JSON-decoded object. A richer structural
  // guard belongs in 0025B5 once parseStrandBlob gets intent-entry
  // typing. The 'as unknown as' is tracked under the 0025A casts
  // manifest.
  const patch = rawPatch as unknown as import('../../types/Patch.ts').default;
  const intentId = normalizeRequiredString(candidate, 'intentId', 'intentId');
  const enqueuedAt = normalizeRequiredString(candidate, 'enqueuedAt', 'enqueuedAt');
  if (intentId.length === 0 || enqueuedAt.length === 0) {
    return null;
  }
  return { patch, intentId, enqueuedAt };
}
