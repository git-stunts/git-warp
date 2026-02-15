/**
 * Trust V1 canonical serialization helpers.
 *
 * Domain separation constants and unsigned record extraction functions
 * for recordId computation and signature payloads.
 *
 * @module domain/trust/canonical
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 6
 */

import { canonicalStringify } from '../utils/canonicalStringify.js';

// ── Domain separation prefixes ──────────────────────────────────────────

/** Domain prefix for recordId computation. */
export const TRUST_RECORD_ID_DOMAIN = 'git-warp:trust-record:v1\0';

/** Domain prefix for signature payload. */
export const TRUST_SIGN_DOMAIN = 'git-warp:trust-sign:v1\0';

// ── Unsigned record helpers ─────────────────────────────────────────────

/**
 * Returns the record payload used for recordId computation.
 * Strips `recordId` and `signature` — these are derived, not inputs.
 *
 * @param {Record<string, *>} record
 * @returns {Record<string, *>}
 */
export function unsignedRecordForId(record) {
  const out = { ...record };
  delete out.recordId;
  delete out.signature;
  return out;
}

/**
 * Returns the record payload used for signature computation.
 * Strips `signature` only — `recordId` is included in signed payload.
 *
 * @param {Record<string, *>} record
 * @returns {Record<string, *>}
 */
export function unsignedRecordForSignature(record) {
  const out = { ...record };
  delete out.signature;
  return out;
}

/**
 * Computes the canonical string for recordId hashing.
 *
 * @param {Record<string, *>} record - Full record (recordId and signature will be stripped)
 * @returns {string} Domain-separated canonical JSON string
 */
export function recordIdPayload(record) {
  return TRUST_RECORD_ID_DOMAIN + canonicalStringify(unsignedRecordForId(record));
}

/**
 * Computes the canonical string for signature verification.
 *
 * @param {Record<string, *>} record - Full record (signature will be stripped)
 * @returns {string} Domain-separated canonical JSON string
 */
export function signaturePayload(record) {
  return TRUST_SIGN_DOMAIN + canonicalStringify(unsignedRecordForSignature(record));
}
