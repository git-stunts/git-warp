/**
 * Trust V1 canonical serialization helpers.
 *
 * Domain separation constants and unsigned record extraction functions
 * for recordId computation and signature payloads.
 *
 * @module domain/trust/canonical
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 6
 */

import { canonicalStringify } from '../utils/canonicalStringify.ts';

// -- Domain separation prefixes -----------------------------------------------

/** Domain prefix for recordId computation. */
const TRUST_RECORD_ID_DOMAIN = 'git-warp:trust-record:v1\0';

/** Domain prefix for signature payload. */
const TRUST_SIGN_DOMAIN = 'git-warp:trust-sign:v1\0';

// -- Record field types -------------------------------------------------------

/** A trust record as parsed from wire format (post-Zod). */
type TrustRecordFields = Readonly<Record<string, unknown>>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B

// -- Unsigned record helpers --------------------------------------------------

/**
 * Returns the record payload used for recordId computation.
 * Strips `recordId`, `signature`, and `signaturePayload` -- these are
 * derived, not inputs to the canonical hash.
 */
function unsignedRecordForId(record: TrustRecordFields): Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const out: Record<string, unknown> = { ...record }; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  delete out['recordId'];
  delete out['signature'];
  delete out['signaturePayload'];
  return out;
}

/**
 * Returns the record payload used for signature computation.
 * Strips `signature` and `signaturePayload` -- `recordId` is included
 * in the signed payload; `signaturePayload` is derived, not an input.
 */
function unsignedRecordForSignature(record: TrustRecordFields): Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const out: Record<string, unknown> = { ...record }; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  delete out['signature'];
  delete out['signaturePayload'];
  return out;
}

/**
 * Computes the canonical string for recordId hashing.
 */
function recordIdPayload(record: TrustRecordFields): string {
  return TRUST_RECORD_ID_DOMAIN + canonicalStringify(unsignedRecordForId(record));
}

/**
 * Computes the canonical string for signature verification.
 */
function signaturePayload(record: TrustRecordFields): string {
  return TRUST_SIGN_DOMAIN + canonicalStringify(unsignedRecordForSignature(record));
}

export {
  TRUST_RECORD_ID_DOMAIN,
  TRUST_SIGN_DOMAIN,
  unsignedRecordForId,
  unsignedRecordForSignature,
  recordIdPayload,
  signaturePayload,
};
export type { TrustRecordFields };
