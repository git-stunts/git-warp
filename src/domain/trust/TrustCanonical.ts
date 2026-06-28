/**
 * SHA-256 hashing layer on top of canonical.ts string payloads.
 *
 * Computes record IDs (content-addressed hex digests) and
 * signature payloads (raw UTF-8 bytes) for trust records.
 *
 * @module domain/trust/TrustCanonical
 * @see docs/specs/TRUST_CRYPTO_ALGORITHM.md
 */

import { recordIdPayload, signaturePayload, type TrustRecordFields } from './canonical.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import { textEncode } from '../utils/bytes.ts';
import { requireCrypto } from '../services/crypto/CryptoRequirement.ts';

type CryptoDeps = {
  readonly crypto?: CryptoPort;
};

/**
 * Computes the record ID (SHA-256 hex digest) for a trust record.
 */
async function computeRecordId(
  record: TrustRecordFields,
  deps: CryptoDeps = {},
): Promise<string> {
  const c = requireCrypto(deps.crypto, 'computeRecordId');
  return await c.hash('sha256', recordIdPayload(record));
}

/**
 * Computes the signature payload as UTF-8 bytes.
 */
function computeSignaturePayload(record: TrustRecordFields): Uint8Array {
  return textEncode(signaturePayload(record));
}

/**
 * Verifies that a record's recordId matches its content.
 */
async function verifyRecordId(
  record: TrustRecordFields,
  deps: CryptoDeps = {},
): Promise<boolean> {
  return record['recordId'] === await computeRecordId(record, deps);
}

export { computeRecordId, computeSignaturePayload, verifyRecordId };
