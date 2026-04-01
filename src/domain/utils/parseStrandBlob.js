/**
 * Utilities for parsing strand descriptor blobs stored as Git refs.
 *
 * @module parseStrandBlob
 */

import { textDecode } from './bytes.js';
import StrandError from '../errors/StrandError.js';

/**
 * Checks whether a value is a non-null, non-array plain object.
 * @param {unknown} value - The value to test
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks whether a value is a plain object whose values are all strings.
 * @param {unknown} value - The value to test
 * @returns {value is Record<string, string>}
 */
function isStringRecord(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * Throws a StrandError if the condition is false.
 * @param {boolean} condition - The condition to assert
 * @param {string} message - Error message when condition fails
 * @returns {void}
 */
function invariant(condition, message) {
  if (!condition) {
    throw new StrandError(message, { code: 'E_STRAND_CORRUPT' });
  }
}

/**
 * Validates that a string field is present and non-empty.
 * @param {unknown} value - The value to validate
 * @param {string} message - Error message on failure
 * @returns {void}
 */
function assertNonEmptyString(value, message) {
  invariant(typeof value === 'string' && value.length > 0, message);
}

/**
 * Validates that a field is null, undefined, or a string.
 * @param {unknown} value - The value to validate
 * @param {string} message - Error message on failure
 * @returns {void}
 */
function validateNullableString(value, message) {
  invariant(
    value === null || value === undefined || typeof value === 'string',
    message,
  );
}

/**
 * Validates that a value is a non-negative integer.
 * @param {unknown} value - The value to validate
 * @param {string} message - Error message on failure
 * @returns {void}
 */
function validateNonNegativeInteger(value, message) {
  invariant(
    typeof value === 'number' && Number.isInteger(value) && value >= 0,
    message,
  );
}

/**
 * Validates that a value is an array of strings.
 * @param {unknown} value - The value to validate
 * @param {string} message - Error message on failure
 * @returns {void}
 */
function validateStringArray(value, message) {
  invariant(
    Array.isArray(value) && value.every((entry) => typeof entry === 'string'),
    message,
  );
}

/**
 * Validates the top-level identity and timestamp fields of a strand descriptor.
 * @param {Record<string, unknown>} obj - The parsed descriptor object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateTopLevelFields(obj, label) {
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
 * @param {Record<string, unknown>} obj - The parsed descriptor object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateLease(obj, label) {
  invariant(isPlainObject(obj['lease']), `Corrupted ${label}: missing lease object`);
  const { lease: rawLease } = obj;
  const lease = /** @type {Record<string, unknown>} */ (rawLease);
  validateNullableString(lease['expiresAt'], `Corrupted ${label}: lease.expiresAt must be string|null`);
}

/**
 * Validates the coordinate version and frontier fields of a base observation.
 * @param {Record<string, unknown>} baseObservation - The base observation object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateBaseObservationFields(baseObservation, label) {
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
 * @param {Record<string, unknown>} obj - The parsed descriptor object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateBaseObservation(obj, label) {
  invariant(isPlainObject(obj['baseObservation']), `Corrupted ${label}: missing baseObservation object`);
  const { baseObservation: rawBaseObs } = obj;
  const baseObservation = /** @type {Record<string, unknown>} */ (rawBaseObs);
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
 * @param {Record<string, unknown>} obj - The parsed descriptor object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateOverlay(obj, label) {
  invariant(isPlainObject(obj['overlay']), `Corrupted ${label}: missing overlay object`);
  const { overlay: rawOverlay } = obj;
  const overlay = /** @type {Record<string, unknown>} */ (rawOverlay);
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
 * @param {Record<string, unknown>} obj - The parsed descriptor object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateMaterialization(obj, label) {
  invariant(
    isPlainObject(obj['materialization']) && obj['materialization']['cacheAuthority'] === 'derived',
    `Corrupted ${label}: invalid materialization metadata`,
  );
}

/**
 * Validates a single read overlay entry within the braid sub-object.
 * @param {Record<string, unknown>} overlay - The overlay entry to validate
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateBraidOverlayEntry(overlay, label) {
  assertNonEmptyString(overlay['strandId'], `Corrupted ${label}: braid.readOverlays[].strandId must be a string`);
  assertNonEmptyString(overlay['overlayId'], `Corrupted ${label}: braid.readOverlays[].overlayId must be a string`);
  assertNonEmptyString(overlay['kind'], `Corrupted ${label}: braid.readOverlays[].kind must be a string`);
  validateNullableString(overlay['headPatchSha'], `Corrupted ${label}: braid.readOverlays[].headPatchSha must be string|null`);
  validateNonNegativeInteger(overlay['patchCount'], `Corrupted ${label}: braid.readOverlays[].patchCount must be a non-negative integer`);
}

/**
 * Validates the optional braid sub-object of a strand descriptor.
 * @param {Record<string, unknown>} obj - The parsed descriptor object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateBraid(obj, label) {
  if (obj['braid'] === undefined) {
    return;
  }
  invariant(isPlainObject(obj['braid']), `Corrupted ${label}: braid must be an object when provided`);
  const { braid: rawBraid } = obj;
  const braid = /** @type {Record<string, unknown>} */ (rawBraid);
  const { readOverlays } = braid;
  invariant(
    Array.isArray(readOverlays),
    `Corrupted ${label}: braid.readOverlays must be an array when braid is present`,
  );
  for (const rawOverlay of /** @type {unknown[]} */ (readOverlays)) {
    invariant(isPlainObject(rawOverlay), `Corrupted ${label}: braid.readOverlays entries must be objects`);
    validateBraidOverlayEntry(/** @type {Record<string, unknown>} */ (rawOverlay), label);
  }
}

/**
 * Validates a single intent entry within the intent queue.
 * @param {Record<string, unknown>} intent - The intent entry to validate
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateIntentEntry(intent, label) {
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
 * @param {Record<string, unknown>} obj - The parsed descriptor object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateIntentQueue(obj, label) {
  if (obj['intentQueue'] === undefined) {
    return;
  }
  invariant(isPlainObject(obj['intentQueue']), `Corrupted ${label}: intentQueue must be an object when provided`);
  const queue = /** @type {Record<string, unknown>} */ (obj['intentQueue']);
  invariant(
    typeof queue['nextIntentSeq'] === 'number' &&
      Number.isInteger(queue['nextIntentSeq']) &&
      queue['nextIntentSeq'] > 0,
    `Corrupted ${label}: intentQueue.nextIntentSeq must be a positive integer`,
  );
  invariant(Array.isArray(queue['intents']), `Corrupted ${label}: intentQueue.intents must be an array`);
  for (const rawIntent of /** @type {unknown[]} */ (queue['intents'])) {
    invariant(isPlainObject(rawIntent), `Corrupted ${label}: intentQueue.intents entries must be objects`);
    validateIntentEntry(/** @type {Record<string, unknown>} */ (rawIntent), label);
  }
}

/**
 * Validates a single rejected counterfactual entry within a tick.
 * @param {Record<string, unknown>} rejected - The rejected entry to validate
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateRejectedCounterfactual(rejected, label) {
  assertNonEmptyString(rejected['intentId'], `Corrupted ${label}: evolution.lastTick.rejected[].intentId must be a string`);
  assertNonEmptyString(rejected['reason'], `Corrupted ${label}: evolution.lastTick.rejected[].reason must be a string`);
  validateStringArray(rejected['conflictsWith'], `Corrupted ${label}: evolution.lastTick.rejected[].conflictsWith must be a string array`);
  validateStringArray(rejected['reads'], `Corrupted ${label}: evolution.lastTick.rejected[].reads must be a string array`);
  validateStringArray(rejected['writes'], `Corrupted ${label}: evolution.lastTick.rejected[].writes must be a string array`);
}

/**
 * Validates the lastTick sub-object fields for scalar and array properties.
 * @param {Record<string, unknown>} lastTick - The lastTick object to validate
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateLastTickFields(lastTick, label) {
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
 * @param {Record<string, unknown>} lastTick - The lastTick object to validate
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateLastTick(lastTick, label) {
  validateLastTickFields(lastTick, label);
  invariant(Array.isArray(lastTick['rejected']), `Corrupted ${label}: evolution.lastTick.rejected must be an array`);
  for (const rawRejected of /** @type {unknown[]} */ (lastTick['rejected'])) {
    invariant(isPlainObject(rawRejected), `Corrupted ${label}: evolution.lastTick.rejected entries must be objects`);
    validateRejectedCounterfactual(/** @type {Record<string, unknown>} */ (rawRejected), label);
  }
}

/**
 * Validates the optional evolution sub-object of a strand descriptor.
 * @param {Record<string, unknown>} obj - The parsed descriptor object
 * @param {string} label - Human-readable label for error messages
 * @returns {void}
 */
function validateEvolution(obj, label) {
  if (obj['evolution'] === undefined) {
    return;
  }
  invariant(isPlainObject(obj['evolution']), `Corrupted ${label}: evolution must be an object when provided`);
  const { evolution: rawEvolution } = obj;
  const evolution = /** @type {Record<string, unknown>} */ (rawEvolution);
  validateNonNegativeInteger(evolution['tickCount'], `Corrupted ${label}: evolution.tickCount must be a non-negative integer`);
  if (evolution['lastTick'] === undefined || evolution['lastTick'] === null) {
    return;
  }
  invariant(isPlainObject(evolution['lastTick']), `Corrupted ${label}: evolution.lastTick must be an object when provided`);
  validateLastTick(/** @type {Record<string, unknown>} */ (evolution['lastTick']), label);
}

/**
 * Parses and validates a strand descriptor blob.
 *
 * The blob must contain UTF-8 JSON for the v1 descriptor shape. Unknown fields
 * are preserved, but the core identity and coordinate fields must be valid.
 *
 * @param {Uint8Array} buf - Raw blob bytes to parse
 * @param {string} label - Human-readable label for error messages
 * @returns {{
 *   schemaVersion: number,
 *   strandId: string,
 *   graphName: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   owner: string|null,
 *   scope: string|null,
 *   lease: { expiresAt: string|null },
 *   baseObservation: {
 *     coordinateVersion: string,
 *     frontier: Record<string, string>,
 *     frontierDigest: string,
 *     lamportCeiling: number|null
 *   },
 *   overlay: {
 *     overlayId: string,
 *     kind: string,
 *     headPatchSha: string|null,
 *     patchCount: number,
 *     writable?: boolean
 *   },
 *   braid?: {
 *     readOverlays: Array<{
 *       strandId: string,
 *       overlayId: string,
 *       kind: string,
 *       headPatchSha: string|null,
 *       patchCount: number
 *     }>
 *   },
 *   materialization: {
 *     cacheAuthority: 'derived'
 *   },
 *   [key: string]: unknown
 * }}
 */
export function parseStrandBlob(buf, label) {
  /** @type {unknown} */
  let obj;
  try {
    obj = JSON.parse(textDecode(buf));
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

  return /** @type {ReturnType<typeof parseStrandBlob>} */ (obj);
}
