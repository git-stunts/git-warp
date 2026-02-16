/**
 * SHA-256 hashing layer on top of canonical.js string payloads.
 *
 * Computes record IDs (content-addressed hex digests) and
 * signature payloads (raw UTF-8 bytes) for trust records.
 *
 * @module domain/trust/TrustCanonical
 * @see docs/specs/TRUST_V1_CRYPTO.md
 */

import { createHash } from 'node:crypto';
import { recordIdPayload, signaturePayload } from './canonical.js';

/**
 * Computes the record ID (SHA-256 hex digest) for a trust record.
 *
 * @param {Record<string, *>} record - Full trust record
 * @returns {string} 64-character lowercase hex string
 */
export function computeRecordId(record) {
  return createHash('sha256').update(recordIdPayload(record)).digest('hex');
}

/**
 * Computes the signature payload as a Buffer (UTF-8 bytes).
 *
 * @param {Record<string, *>} record - Full trust record (signature will be stripped)
 * @returns {Buffer} UTF-8 encoded bytes of the domain-separated canonical string
 */
export function computeSignaturePayload(record) {
  return Buffer.from(signaturePayload(record), 'utf8');
}

/**
 * Verifies that a record's recordId matches its content.
 *
 * @param {Record<string, *>} record - Trust record with `recordId` field
 * @returns {boolean} true if recordId matches computed value
 */
export function verifyRecordId(record) {
  return record.recordId === computeRecordId(record);
}
