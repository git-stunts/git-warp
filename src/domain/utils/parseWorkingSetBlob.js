/**
 * Utilities for parsing working-set descriptor blobs stored as Git refs.
 *
 * @module parseWorkingSetBlob
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
  invariant(typeof obj.workingSetId === 'string' && obj.workingSetId.length > 0, `Corrupted ${label}: missing workingSetId`);
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
 * Parses and validates a working-set descriptor blob.
 *
 * The blob must contain UTF-8 JSON for the v1 descriptor shape. Unknown fields
 * are preserved, but the core identity and coordinate fields must be valid.
 *
 * @param {Uint8Array} buf
 * @param {string} label
 * @returns {{
 *   schemaVersion: number,
 *   workingSetId: string,
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
 *     patchCount: number
 *   },
 *   materialization: {
 *     cacheAuthority: 'derived'
 *   },
 *   [key: string]: unknown
 * }}
 */
export function parseWorkingSetBlob(buf, label) {
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
  validateMaterialization(obj, label);

  return /** @type {ReturnType<typeof parseWorkingSetBlob>} */ (obj);
}
