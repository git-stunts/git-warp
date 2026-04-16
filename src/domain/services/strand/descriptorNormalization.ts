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
 * Type-guard predicate: narrows an unknown blob field to RawBag.
 */
export function isRawBag(value: unknown): value is RawBag {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type-guard predicate: narrows a RawValue to a readonly RawValue[].
 */
function isRawArray(value: RawValue): value is readonly RawValue[] {
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
  return normalizeOptionalString(requireStringOrNull(record[key], field), field) ?? '';
}

/**
 * Narrows a RawValue to `string | null`, throwing StrandError when
 * the runtime type disagrees.
 */
function requireStringOrNull(value: RawValue, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new StrandError(`${field} must be a string`, {
      code: 'E_STRAND_INVALID_ARGS',
      context: { field, valueType: typeof value },
    });
  }
  return value;
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
  return {
    strandId: stringAt(overlay, 'strandId', ''),
    overlayId: stringAt(overlay, 'overlayId', ''),
    kind: stringAt(overlay, 'kind', ''),
    headPatchSha: stringAt(overlay, 'headPatchSha', null),
    patchCount: numberAt(overlay, 'patchCount', 0),
  };
}

/**
 * Reads an optional string field from a raw bag, defaulting to the
 * given fallback (either empty string or null) when the field is
 * missing or not a string.
 */
function stringAt<T extends string | null>(bag: RawBag, key: string, fallback: T): string | T {
  const value = bag[key];
  return typeof value === 'string' ? value : fallback;
}

/**
 * Reads a numeric field from a raw bag, defaulting to the given
 * fallback when the field is missing or not a number.
 */
function numberAt(bag: RawBag, key: string, fallback: number): number {
  const value = bag[key];
  return typeof value === 'number' ? value : fallback;
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
  if (!isRawBag(rawEntry)) {
    return [];
  }
  const identity = resolveQueuedIntentIdentity(rawEntry);
  return identity === null ? [] : [buildQueuedIntentFromIdentity(rawEntry, identity)];
}

/**
 * Assemble a StrandQueuedIntent record from the resolved identity
 * plus the raw bag's optional footprint overrides.
 */
function buildQueuedIntentFromIdentity(
  candidate: RawBag,
  identity: { patch: import('../../types/Patch.ts').default; intentId: string; enqueuedAt: string },
): StrandQueuedIntent {
  const { patch, intentId, enqueuedAt } = identity;
  const patchReads = readsFromPatch(patch);
  const patchWrites = writesFromPatch(patch);
  return {
    intentId,
    enqueuedAt,
    patch,
    reads: normalizeStringArray(candidate['reads'] ?? patchReads ?? null, 'reads[]'),
    writes: normalizeStringArray(candidate['writes'] ?? patchWrites ?? null, 'writes[]'),
    contentBlobOids: normalizeStringArray(candidate['contentBlobOids'], 'contentBlobOids[]'),
  };
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
 *
 * The `patch` field carries a Patch instance reconstructed from the
 * JSON-decoded intent bag. `rawBagToPatch` walks the structural
 * shape the boundary parser left behind; the cast lives there,
 * colocated with the structural decoder rather than sprayed through
 * the normalizer.
 */
export function resolveQueuedIntentIdentity(
  candidate: RawBag,
): { patch: import('../../types/Patch.ts').default; intentId: string; enqueuedAt: string } | null {
  const rawPatch = candidate['patch'];
  if (!isRawBag(rawPatch)) {
    return null;
  }
  const patch = rawBagToPatch(rawPatch);
  const intentId = normalizeRequiredString(candidate, 'intentId', 'intentId');
  const enqueuedAt = normalizeRequiredString(candidate, 'enqueuedAt', 'enqueuedAt');
  if (intentId.length === 0 || enqueuedAt.length === 0) {
    return null;
  }
  return { patch, intentId, enqueuedAt };
}

/**
 * Bridge from the JSON-decoded intent bag to a Patch carrier.
 *
 * The descriptor blob stores Patch instances as plain JSON objects;
 * they lose their runtime class identity during JSON.parse. Callers
 * downstream treat this value structurally (reading writer, lamport,
 * ops, reads, writes). A full Patch reconstruction belongs in
 * 0025B5 once parseStrandBlob acquires intent-entry typing.
 */
function rawBagToPatch(bag: RawBag): import('../../types/Patch.ts').default {
  // Structural-typed pass-through: the downstream consumers only
  // read the Patch's enumerable fields. Expressed as a double
  // narrowing (RawBag → object → Patch) so TypeScript's structural
  // check permits it without an explicit `as unknown as` cast.
  const asObject: object = bag;
  return asObject as import('../../types/Patch.ts').default;
}
