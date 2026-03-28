/**
 * Utilities for parsing strand descriptor blobs stored as Git refs.
 *
 * @module parseStrandBlob
 */

import { textDecode } from './bytes.js';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, string>}
 */
function isStringRecord(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {void}
 */
function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} label
 * @returns {void}
 */
function validateTopLevelFields(obj, label) {
  invariant(obj.schemaVersion === 1, `Corrupted ${label}: unsupported schemaVersion`);
  invariant(typeof obj.strandId === 'string' && obj.strandId.length > 0, `Corrupted ${label}: missing strandId`);
  invariant(typeof obj.graphName === 'string' && obj.graphName.length > 0, `Corrupted ${label}: missing graphName`);
  invariant(typeof obj.createdAt === 'string' && obj.createdAt.length > 0, `Corrupted ${label}: missing createdAt`);
  invariant(typeof obj.updatedAt === 'string' && obj.updatedAt.length > 0, `Corrupted ${label}: missing updatedAt`);
  invariant(obj.owner === null || obj.owner === undefined || typeof obj.owner === 'string', `Corrupted ${label}: owner must be string|null`);
  invariant(obj.scope === null || obj.scope === undefined || typeof obj.scope === 'string', `Corrupted ${label}: scope must be string|null`);
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} label
 * @returns {void}
 */
function validateLease(obj, label) {
  invariant(isPlainObject(obj.lease), `Corrupted ${label}: missing lease object`);
  const { lease: rawLease } = obj;
  const lease = /** @type {Record<string, unknown>} */ (rawLease);
  invariant(
    lease.expiresAt === null ||
      lease.expiresAt === undefined ||
      typeof lease.expiresAt === 'string',
    `Corrupted ${label}: lease.expiresAt must be string|null`,
  );
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} label
 * @returns {void}
 */
function validateBaseObservation(obj, label) {
  invariant(isPlainObject(obj.baseObservation), `Corrupted ${label}: missing baseObservation object`);
  const { baseObservation: rawBaseObservation } = obj;
  const baseObservation = /** @type {Record<string, unknown>} */ (rawBaseObservation);
  invariant(
    typeof baseObservation.coordinateVersion === 'string' &&
      baseObservation.coordinateVersion.length > 0,
    `Corrupted ${label}: missing baseObservation.coordinateVersion`,
  );
  invariant(
    isStringRecord(baseObservation.frontier),
    `Corrupted ${label}: baseObservation.frontier must be a string record`,
  );
  invariant(
    typeof baseObservation.frontierDigest === 'string' &&
      baseObservation.frontierDigest.length > 0,
    `Corrupted ${label}: missing baseObservation.frontierDigest`,
  );

  const { lamportCeiling } = baseObservation;
  invariant(
    lamportCeiling === null ||
      lamportCeiling === undefined ||
      (typeof lamportCeiling === 'number' && Number.isInteger(lamportCeiling) && lamportCeiling >= 0),
    `Corrupted ${label}: baseObservation.lamportCeiling must be a non-negative integer or null`,
  );
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} label
 * @returns {void}
 */
function validateOverlay(obj, label) {
  invariant(isPlainObject(obj.overlay), `Corrupted ${label}: missing overlay object`);
  const { overlay: rawOverlay } = obj;
  const overlay = /** @type {Record<string, unknown>} */ (rawOverlay);
  invariant(typeof overlay.overlayId === 'string' && overlay.overlayId.length > 0, `Corrupted ${label}: missing overlay.overlayId`);
  invariant(typeof overlay.kind === 'string' && overlay.kind.length > 0, `Corrupted ${label}: missing overlay.kind`);
  invariant(
    overlay.headPatchSha === null ||
      overlay.headPatchSha === undefined ||
      typeof overlay.headPatchSha === 'string',
    `Corrupted ${label}: overlay.headPatchSha must be string|null`,
  );
  invariant(
    typeof overlay.patchCount === 'number' &&
      Number.isInteger(overlay.patchCount) &&
      overlay.patchCount >= 0,
    `Corrupted ${label}: overlay.patchCount must be a non-negative integer`,
  );
  invariant(
    overlay.writable === undefined || typeof overlay.writable === 'boolean',
    `Corrupted ${label}: overlay.writable must be boolean when provided`,
  );
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} label
 * @returns {void}
 */
function validateMaterialization(obj, label) {
  invariant(
    isPlainObject(obj.materialization) && obj.materialization.cacheAuthority === 'derived',
    `Corrupted ${label}: invalid materialization metadata`,
  );
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} label
 * @returns {void}
 */
function validateBraid(obj, label) {
  if (obj.braid === undefined) {
    return;
  }
  invariant(isPlainObject(obj.braid), `Corrupted ${label}: braid must be an object when provided`);
  const { braid: rawBraid } = obj;
  const braid = /** @type {Record<string, unknown>} */ (rawBraid);
  const { readOverlays } = braid;
  invariant(
    Array.isArray(readOverlays),
    `Corrupted ${label}: braid.readOverlays must be an array when braid is present`,
  );
  for (const rawOverlay of /** @type {unknown[]} */ (readOverlays)) {
    const overlay = /** @type {Record<string, unknown>} */ (rawOverlay);
    invariant(isPlainObject(overlay), `Corrupted ${label}: braid.readOverlays entries must be objects`);
    invariant(
      typeof overlay.strandId === 'string' && overlay.strandId.length > 0,
      `Corrupted ${label}: braid.readOverlays[].strandId must be a string`,
    );
    invariant(
      typeof overlay.overlayId === 'string' && overlay.overlayId.length > 0,
      `Corrupted ${label}: braid.readOverlays[].overlayId must be a string`,
    );
    invariant(
      typeof overlay.kind === 'string' && overlay.kind.length > 0,
      `Corrupted ${label}: braid.readOverlays[].kind must be a string`,
    );
    invariant(
      overlay.headPatchSha === null ||
        overlay.headPatchSha === undefined ||
        typeof overlay.headPatchSha === 'string',
      `Corrupted ${label}: braid.readOverlays[].headPatchSha must be string|null`,
    );
    invariant(
      typeof overlay.patchCount === 'number' &&
        Number.isInteger(overlay.patchCount) &&
        overlay.patchCount >= 0,
      `Corrupted ${label}: braid.readOverlays[].patchCount must be a non-negative integer`,
    );
  }
}

/**
 * @param {unknown} value
 * @param {string} message
 * @returns {void}
 */
function validateStringArray(value, message) {
  invariant(
    Array.isArray(value) && value.every((entry) => typeof entry === 'string'),
    message,
  );
}

/**
 * @param {unknown} value
 * @param {string} message
 * @returns {void}
 */
function validateNonNegativeInteger(value, message) {
  invariant(
    typeof value === 'number' && Number.isInteger(value) && value >= 0,
    message,
  );
}

/**
 * @param {unknown} value
 * @param {string} message
 * @returns {void}
 */
function validateNullableString(value, message) {
  invariant(
    value === null || value === undefined || typeof value === 'string',
    message,
  );
}

/**
 * @param {Record<string, unknown>} intent
 * @param {string} label
 * @returns {void}
 */
function validateIntentEntry(intent, label) {
  invariant(
    typeof intent.intentId === 'string' && intent.intentId.length > 0,
    `Corrupted ${label}: intentQueue.intents[].intentId must be a string`,
  );
  invariant(
    typeof intent.enqueuedAt === 'string' && intent.enqueuedAt.length > 0,
    `Corrupted ${label}: intentQueue.intents[].enqueuedAt must be a string`,
  );
  invariant(
    isPlainObject(intent.patch),
    `Corrupted ${label}: intentQueue.intents[].patch must be an object`,
  );
  if (intent.reads !== undefined) {
    validateStringArray(intent.reads, `Corrupted ${label}: intentQueue.intents[].reads must be a string array when provided`);
  }
  if (intent.writes !== undefined) {
    validateStringArray(intent.writes, `Corrupted ${label}: intentQueue.intents[].writes must be a string array when provided`);
  }
  if (intent.contentBlobOids !== undefined) {
    validateStringArray(intent.contentBlobOids, `Corrupted ${label}: intentQueue.intents[].contentBlobOids must be a string array when provided`);
  }
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} label
 * @returns {void}
 */
function validateIntentQueue(obj, label) {
  if (obj.intentQueue === undefined) {
    return;
  }
  invariant(isPlainObject(obj.intentQueue), `Corrupted ${label}: intentQueue must be an object when provided`);
  const queue = /** @type {Record<string, unknown>} */ (obj.intentQueue);
  invariant(
    typeof queue.nextIntentSeq === 'number' &&
      Number.isInteger(queue.nextIntentSeq) &&
      queue.nextIntentSeq > 0,
    `Corrupted ${label}: intentQueue.nextIntentSeq must be a positive integer`,
  );
  invariant(Array.isArray(queue.intents), `Corrupted ${label}: intentQueue.intents must be an array`);
  for (const rawIntent of /** @type {unknown[]} */ (queue.intents)) {
    invariant(isPlainObject(rawIntent), `Corrupted ${label}: intentQueue.intents entries must be objects`);
    validateIntentEntry(/** @type {Record<string, unknown>} */ (rawIntent), label);
  }
}

/**
 * @param {Record<string, unknown>} rejected
 * @param {string} label
 * @returns {void}
 */
function validateRejectedCounterfactual(rejected, label) {
  invariant(
    typeof rejected.intentId === 'string' && rejected.intentId.length > 0,
    `Corrupted ${label}: evolution.lastTick.rejected[].intentId must be a string`,
  );
  invariant(
    typeof rejected.reason === 'string' && rejected.reason.length > 0,
    `Corrupted ${label}: evolution.lastTick.rejected[].reason must be a string`,
  );
  validateStringArray(
    rejected.conflictsWith,
    `Corrupted ${label}: evolution.lastTick.rejected[].conflictsWith must be a string array`,
  );
  validateStringArray(
    rejected.reads,
    `Corrupted ${label}: evolution.lastTick.rejected[].reads must be a string array`,
  );
  validateStringArray(
    rejected.writes,
    `Corrupted ${label}: evolution.lastTick.rejected[].writes must be a string array`,
  );
}

/**
 * @param {Record<string, unknown>} lastTick
 * @param {string} label
 * @returns {void}
 */
function validateLastTick(lastTick, label) {
  invariant(
    typeof lastTick.tickId === 'string' && lastTick.tickId.length > 0,
    `Corrupted ${label}: evolution.lastTick.tickId must be a string`,
  );
  validateNonNegativeInteger(
    lastTick.tickIndex,
    `Corrupted ${label}: evolution.lastTick.tickIndex must be a non-negative integer`,
  );
  invariant(
    typeof lastTick.createdAt === 'string' && lastTick.createdAt.length > 0,
    `Corrupted ${label}: evolution.lastTick.createdAt must be a string`,
  );
  validateNonNegativeInteger(
    lastTick.drainedIntentCount,
    `Corrupted ${label}: evolution.lastTick.drainedIntentCount must be a non-negative integer`,
  );
  validateStringArray(
    lastTick.admittedIntentIds,
    `Corrupted ${label}: evolution.lastTick.admittedIntentIds must be a string array`,
  );
  validateStringArray(
    lastTick.overlayPatchShas,
    `Corrupted ${label}: evolution.lastTick.overlayPatchShas must be a string array`,
  );
  validateNullableString(
    lastTick.baseOverlayHeadPatchSha,
    `Corrupted ${label}: evolution.lastTick.baseOverlayHeadPatchSha must be string|null`,
  );
  validateNullableString(
    lastTick.overlayHeadPatchSha,
    `Corrupted ${label}: evolution.lastTick.overlayHeadPatchSha must be string|null`,
  );
  invariant(Array.isArray(lastTick.rejected), `Corrupted ${label}: evolution.lastTick.rejected must be an array`);
  for (const rawRejected of /** @type {unknown[]} */ (lastTick.rejected)) {
    invariant(isPlainObject(rawRejected), `Corrupted ${label}: evolution.lastTick.rejected entries must be objects`);
    validateRejectedCounterfactual(/** @type {Record<string, unknown>} */ (rawRejected), label);
  }
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string} label
 * @returns {void}
 */
function validateEvolution(obj, label) {
  if (obj.evolution === undefined) {
    return;
  }
  invariant(isPlainObject(obj.evolution), `Corrupted ${label}: evolution must be an object when provided`);
  const { evolution: rawEvolution } = obj;
  const evolution = /** @type {Record<string, unknown>} */ (rawEvolution);
  invariant(
    typeof evolution.tickCount === 'number' &&
      Number.isInteger(evolution.tickCount) &&
      evolution.tickCount >= 0,
    `Corrupted ${label}: evolution.tickCount must be a non-negative integer`,
  );
  if (evolution.lastTick === undefined || evolution.lastTick === null) {
    return;
  }
  invariant(isPlainObject(evolution.lastTick), `Corrupted ${label}: evolution.lastTick must be an object when provided`);
  const { lastTick: rawLastTick } = evolution;
  validateLastTick(/** @type {Record<string, unknown>} */ (rawLastTick), label);
}

/**
 * Parses and validates a strand descriptor blob.
 *
 * The blob must contain UTF-8 JSON for the v1 descriptor shape. Unknown fields
 * are preserved, but the core identity and coordinate fields must be valid.
 *
 * @param {Uint8Array} buf
 * @param {string} label
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
  let obj;
  try {
    obj = JSON.parse(textDecode(buf));
  } catch {
    throw new Error(`Corrupted ${label}: blob is not valid JSON`);
  }

  if (!isPlainObject(obj)) {
    throw new Error(`Corrupted ${label}: expected a JSON object`);
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
