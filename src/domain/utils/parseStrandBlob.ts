/**
 * Utilities for parsing strand descriptor blobs stored as Git refs.
 *
 * @module parseStrandBlob
 */

import { textDecode } from './bytes.ts';
import StrandError from '../errors/StrandError.ts';

/**
 * Checks whether a value is a non-null, non-array plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks whether a value is a plain object whose values are all strings.
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * Throws a StrandError if the condition is false.
 */
function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new StrandError(message, { code: 'E_STRAND_CORRUPT' });
  }
}

/**
 * Validates that a string field is present and non-empty.
 */
function assertNonEmptyString(value: unknown, message: string): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  invariant(typeof value === 'string' && value.length > 0, message);
}

/**
 * Validates that a field is null, undefined, or a string.
 */
function validateNullableString(value: unknown, message: string): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  invariant(
    value === null || value === undefined || typeof value === 'string',
    message,
  );
}

/**
 * Validates that a value is a non-negative integer.
 */
function validateNonNegativeInteger(value: unknown, message: string): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  invariant(
    typeof value === 'number' && Number.isInteger(value) && value >= 0,
    message,
  );
}

/**
 * Validates that a value is an array of strings.
 */
function validateStringArray(value: unknown, message: string): void { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  invariant(
    Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string'), // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    message,
  );
}

/**
 * Validates the top-level identity and timestamp fields of a strand descriptor.
 */
function validateTopLevelFields(obj: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  invariant(obj['schemaVersion'] === 1, `Corrupted ${label}: unsupported schemaVersion`);
  assertNonEmptyString(obj['strandId'], `Corrupted ${label}: missing strandId`);
  assertNonEmptyString(obj['graphName'], `Corrupted ${label}: missing graphName`);
  assertNonEmptyString(obj['createdAt'], `Corrupted ${label}: missing createdAt`);
  assertNonEmptyString(obj['updatedAt'], `Corrupted ${label}: missing updatedAt`);
  validateNullableString(obj['owner'], `Corrupted ${label}: owner must be string|null`);
  validateNullableString(obj['scope'], `Corrupted ${label}: scope must be string|null`);
}

/**
 * Validates the lease sub-object of a strand descriptor.
 */
function validateLease(obj: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const { lease: rawLease } = obj;
  invariant(isPlainObject(rawLease), `Corrupted ${label}: missing lease object`);
  validateNullableString(rawLease['expiresAt'], `Corrupted ${label}: lease.expiresAt must be string|null`);
}

/**
 * Validates the coordinate version and frontier fields of a base observation.
 */
function validateBaseObservationFields(baseObservation: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  assertNonEmptyString(
    baseObservation['coordinateVersion'],
    `Corrupted ${label}: missing baseObservation.coordinateVersion`,
  );
  invariant(
    isStringRecord(baseObservation['frontier']),
    `Corrupted ${label}: baseObservation.frontier must be a string record`,
  );
  assertNonEmptyString(
    baseObservation['frontierDigest'],
    `Corrupted ${label}: missing baseObservation.frontierDigest`,
  );
}

/**
 * Validates the baseObservation sub-object of a strand descriptor.
 */
function validateBaseObservation(obj: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const { baseObservation } = obj;
  invariant(isPlainObject(baseObservation), `Corrupted ${label}: missing baseObservation object`);
  validateBaseObservationFields(baseObservation, label);

  const { lamportCeiling } = baseObservation;
  invariant(
    lamportCeiling === null ||
      lamportCeiling === undefined ||
      (typeof lamportCeiling === 'number' && Number.isInteger(lamportCeiling) && lamportCeiling >= 0),
    `Corrupted ${label}: baseObservation.lamportCeiling must be a non-negative integer or null`,
  );
}

/**
 * Validates the overlay sub-object of a strand descriptor.
 */
function validateOverlay(obj: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const { overlay } = obj;
  invariant(isPlainObject(overlay), `Corrupted ${label}: missing overlay object`);
  assertNonEmptyString(overlay['overlayId'], `Corrupted ${label}: missing overlay.overlayId`);
  assertNonEmptyString(overlay['kind'], `Corrupted ${label}: missing overlay.kind`);
  validateNullableString(overlay['headPatchSha'], `Corrupted ${label}: overlay.headPatchSha must be string|null`);
  validateNonNegativeInteger(overlay['patchCount'], `Corrupted ${label}: overlay.patchCount must be a non-negative integer`);
  invariant(
    overlay['writable'] === undefined || typeof overlay['writable'] === 'boolean',
    `Corrupted ${label}: overlay.writable must be boolean when provided`,
  );
}

/**
 * Validates the materialization sub-object of a strand descriptor.
 */
function validateMaterialization(obj: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const { materialization } = obj;
  invariant(
    isPlainObject(materialization) && materialization['cacheAuthority'] === 'derived',
    `Corrupted ${label}: invalid materialization metadata`,
  );
}

/**
 * Validates a single read overlay entry within the braid sub-object.
 */
function validateBraidOverlayEntry(overlay: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  assertNonEmptyString(overlay['strandId'], `Corrupted ${label}: braid.readOverlays[].strandId must be a string`);
  assertNonEmptyString(overlay['overlayId'], `Corrupted ${label}: braid.readOverlays[].overlayId must be a string`);
  assertNonEmptyString(overlay['kind'], `Corrupted ${label}: braid.readOverlays[].kind must be a string`);
  validateNullableString(overlay['headPatchSha'], `Corrupted ${label}: braid.readOverlays[].headPatchSha must be string|null`);
  validateNonNegativeInteger(overlay['patchCount'], `Corrupted ${label}: braid.readOverlays[].patchCount must be a non-negative integer`);
}

/**
 * Validates the optional braid sub-object of a strand descriptor.
 */
function validateBraid(obj: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (obj['braid'] === undefined) {
    return;
  }
  const { braid } = obj;
  invariant(isPlainObject(braid), `Corrupted ${label}: braid must be an object when provided`);
  const { readOverlays } = braid;
  invariant(
    Array.isArray(readOverlays),
    `Corrupted ${label}: braid.readOverlays must be an array when braid is present`,
  );
  for (const rawOverlay of readOverlays) {
    invariant(isPlainObject(rawOverlay), `Corrupted ${label}: braid.readOverlays entries must be objects`);
    validateBraidOverlayEntry(rawOverlay, label);
  }
}

/**
 * Validates a single intent entry within the intent queue.
 */
function validateIntentEntry(intent: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  assertNonEmptyString(intent['intentId'], `Corrupted ${label}: intentQueue.intents[].intentId must be a string`);
  assertNonEmptyString(intent['enqueuedAt'], `Corrupted ${label}: intentQueue.intents[].enqueuedAt must be a string`);
  invariant(isPlainObject(intent['patch']), `Corrupted ${label}: intentQueue.intents[].patch must be an object`);
  if (intent['reads'] !== undefined) {
    validateStringArray(intent['reads'], `Corrupted ${label}: intentQueue.intents[].reads must be a string array when provided`);
  }
  if (intent['writes'] !== undefined) {
    validateStringArray(intent['writes'], `Corrupted ${label}: intentQueue.intents[].writes must be a string array when provided`);
  }
  if (intent['contentBlobOids'] !== undefined) {
    validateStringArray(intent['contentBlobOids'], `Corrupted ${label}: intentQueue.intents[].contentBlobOids must be a string array when provided`);
  }
}

/**
 * Validates the optional intentQueue sub-object of a strand descriptor.
 */
function validateIntentQueue(obj: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (obj['intentQueue'] === undefined) {
    return;
  }
  const { intentQueue: queue } = obj;
  invariant(isPlainObject(queue), `Corrupted ${label}: intentQueue must be an object when provided`);
  invariant(
    typeof queue['nextIntentSeq'] === 'number' &&
      Number.isInteger(queue['nextIntentSeq']) &&
      queue['nextIntentSeq'] > 0,
    `Corrupted ${label}: intentQueue.nextIntentSeq must be a positive integer`,
  );
  const { intents } = queue;
  invariant(Array.isArray(intents), `Corrupted ${label}: intentQueue.intents must be an array`);
  for (const rawIntent of intents) {
    invariant(isPlainObject(rawIntent), `Corrupted ${label}: intentQueue.intents entries must be objects`);
    validateIntentEntry(rawIntent, label);
  }
}

/**
 * Validates a single rejected counterfactual entry within a tick.
 */
function validateRejectedCounterfactual(rejected: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  assertNonEmptyString(rejected['intentId'], `Corrupted ${label}: evolution.lastTick.rejected[].intentId must be a string`);
  assertNonEmptyString(rejected['reason'], `Corrupted ${label}: evolution.lastTick.rejected[].reason must be a string`);
  validateStringArray(rejected['conflictsWith'], `Corrupted ${label}: evolution.lastTick.rejected[].conflictsWith must be a string array`);
  validateStringArray(rejected['reads'], `Corrupted ${label}: evolution.lastTick.rejected[].reads must be a string array`);
  validateStringArray(rejected['writes'], `Corrupted ${label}: evolution.lastTick.rejected[].writes must be a string array`);
}

/**
 * Validates the lastTick sub-object fields for scalar and array properties.
 */
function validateLastTickFields(lastTick: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  assertNonEmptyString(lastTick['tickId'], `Corrupted ${label}: evolution.lastTick.tickId must be a string`);
  validateNonNegativeInteger(lastTick['tickIndex'], `Corrupted ${label}: evolution.lastTick.tickIndex must be a non-negative integer`);
  assertNonEmptyString(lastTick['createdAt'], `Corrupted ${label}: evolution.lastTick.createdAt must be a string`);
  validateNonNegativeInteger(lastTick['drainedIntentCount'], `Corrupted ${label}: evolution.lastTick.drainedIntentCount must be a non-negative integer`);
  validateStringArray(lastTick['admittedIntentIds'], `Corrupted ${label}: evolution.lastTick.admittedIntentIds must be a string array`);
  validateStringArray(lastTick['overlayPatchShas'], `Corrupted ${label}: evolution.lastTick.overlayPatchShas must be a string array`);
  validateNullableString(lastTick['baseOverlayHeadPatchSha'], `Corrupted ${label}: evolution.lastTick.baseOverlayHeadPatchSha must be string|null`);
  validateNullableString(lastTick['overlayHeadPatchSha'], `Corrupted ${label}: evolution.lastTick.overlayHeadPatchSha must be string|null`);
}

/**
 * Validates the lastTick sub-object of an evolution block.
 */
function validateLastTick(lastTick: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  validateLastTickFields(lastTick, label);
  const { rejected } = lastTick;
  invariant(Array.isArray(rejected), `Corrupted ${label}: evolution.lastTick.rejected must be an array`);
  for (const rawRejected of rejected) {
    invariant(isPlainObject(rawRejected), `Corrupted ${label}: evolution.lastTick.rejected entries must be objects`);
    validateRejectedCounterfactual(rawRejected, label);
  }
}

/**
 * Validates the optional evolution sub-object of a strand descriptor.
 */
function validateEvolution(obj: Record<string, unknown>, label: string): void { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (obj['evolution'] === undefined) {
    return;
  }
  const { evolution } = obj;
  invariant(isPlainObject(evolution), `Corrupted ${label}: evolution must be an object when provided`);
  validateNonNegativeInteger(evolution['tickCount'], `Corrupted ${label}: evolution.tickCount must be a non-negative integer`);
  const { lastTick } = evolution;
  if (lastTick === undefined || lastTick === null) {
    return;
  }
  invariant(isPlainObject(lastTick), `Corrupted ${label}: evolution.lastTick must be an object when provided`);
  validateLastTick(lastTick, label);
}

/** Return type of parseStrandBlob — the validated v1 strand descriptor. */
export interface StrandDescriptor {
  readonly schemaVersion: number;
  readonly strandId: string;
  readonly graphName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly owner: string | null;
  readonly scope: string | null;
  readonly lease: { readonly expiresAt: string | null };
  readonly baseObservation: {
    readonly coordinateVersion: string;
    readonly frontier: Record<string, string>;
    readonly frontierDigest: string;
    readonly lamportCeiling: number | null;
  };
  readonly overlay: {
    readonly overlayId: string;
    readonly kind: string;
    readonly headPatchSha: string | null;
    readonly patchCount: number;
    readonly writable?: boolean;
  };
  readonly braid?: {
    readonly readOverlays: ReadonlyArray<{
      readonly strandId: string;
      readonly overlayId: string;
      readonly kind: string;
      readonly headPatchSha: string | null;
      readonly patchCount: number;
    }>;
  };
  readonly materialization: {
    readonly cacheAuthority: 'derived';
  };
  readonly [key: string]: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Parses and validates a strand descriptor blob.
 *
 * The blob must contain UTF-8 JSON for the v1 descriptor shape. Unknown fields
 * are preserved, but the core identity and coordinate fields must be valid.
 */
export function parseStrandBlob(buf: Uint8Array, label: string): StrandDescriptor {
  let obj: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  try {
    obj = JSON.parse(textDecode(buf)); // nosemgrep: ts-no-json-parse-in-core -- 0025B
  } catch {
    throw new StrandError(`Corrupted ${label}: blob is not valid JSON`, { code: 'E_STRAND_CORRUPT' });
  }

  if (!isPlainObject(obj)) {
    throw new StrandError(`Corrupted ${label}: expected a JSON object`, { code: 'E_STRAND_CORRUPT' });
  }

  validateTopLevelFields(obj, label);
  validateLease(obj, label);
  validateBaseObservation(obj, label);
  validateOverlay(obj, label);
  validateBraid(obj, label);
  validateIntentQueue(obj, label);
  validateEvolution(obj, label);
  validateMaterialization(obj, label);

  return obj as StrandDescriptor;
}
