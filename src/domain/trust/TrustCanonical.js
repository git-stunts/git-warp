/**
 * SHA-256 hashing layer on top of canonical.js string payloads.
 *
 * Computes record IDs (content-addressed hex digests) and
 * signature payloads (raw UTF-8 bytes) for trust records.
 *
 * @module domain/trust/TrustCanonical
 * @see docs/specs/TRUST_V1_CRYPTO.md
 */

import { recordIdPayload, signaturePayload } from './canonical.js';
import defaultCrypto from '../utils/defaultCrypto.js';
import { textEncode } from '../utils/bytes.js';

/**
 * Computes the record ID (SHA-256 hex digest) for a trust record.
 *
 * @param {Record<string, unknown>} record - Full trust record
 * @param {{ crypto?: import('../../ports/CryptoPort.js').default }} [deps] - Optional dependency injection
 * @returns {Promise<string>} 64-character lowercase hex string
 */
export async function computeRecordId(record, { crypto } = {}) {
  const c = crypto || defaultCrypto;
  return await c.hash('sha256', recordIdPayload(record));
}

/**
 * Computes the signature payload as UTF-8 bytes.
 *
 * @param {Record<string, unknown>} record - Full trust record (signature will be stripped)
 * @returns {Uint8Array} UTF-8 encoded bytes of the domain-separated canonical string
 */
export function computeSignaturePayload(record) {
  return textEncode(signaturePayload(record));
}

/**
 * Verifies that a record's recordId matches its content.
 *
 * @param {Record<string, unknown>} record - Trust record with `recordId` field
 * @param {{ crypto?: import('../../ports/CryptoPort.js').default }} [deps] - Optional dependency injection
 * @returns {Promise<boolean>} true if recordId matches computed value
 */
export async function verifyRecordId(record, { crypto } = {}) {
  return record.recordId === await computeRecordId(record, { crypto });
}
