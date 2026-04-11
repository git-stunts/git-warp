/**
 * Test factory: converts golden record plain objects to TrustRecord instances.
 *
 * Computes signaturePayload from the canonical form so tests don't
 * need to import boundary functions directly.
 */

import { TrustRecord } from '../../../../../src/domain/trust/TrustRecord.ts';
import type { DecodedTrustRecord } from '../../../../../src/domain/trust/TrustRecord.ts';
import { signaturePayload } from '../../../../../src/domain/trust/canonical.ts';
import { textEncode } from '../../../../../src/domain/utils/bytes.ts';

type GoldenRecord = {
  readonly schemaVersion: number;
  readonly recordType: string;
  readonly recordId: string;
  readonly issuerKeyId: string;
  readonly issuedAt: string;
  readonly prev: string | null;
  readonly subject: Readonly<Record<string, string>>;
  readonly meta: Readonly<Record<string, string | number | boolean | null>>;
  readonly signature: { readonly alg: string; readonly sig: string };
};

/**
 * Converts a golden record plain object to a TrustRecord instance.
 */
function toTrustRecord(raw: GoldenRecord): TrustRecord {
  const input: DecodedTrustRecord = {
    schemaVersion: raw.schemaVersion,
    recordType: raw.recordType,
    recordId: raw.recordId,
    issuerKeyId: raw.issuerKeyId,
    issuedAt: raw.issuedAt,
    prev: raw.prev,
    subject: raw.subject,
    meta: raw.meta,
    signature: raw.signature,
    signaturePayload: textEncode(signaturePayload(raw)),
  };
  return TrustRecord.fromDecoded(input);
}

/**
 * Converts an array of golden records to TrustRecord instances.
 */
function toTrustRecords(raws: readonly GoldenRecord[]): TrustRecord[] {
  return raws.map(toTrustRecord);
}

export { toTrustRecord, toTrustRecords };
export type { GoldenRecord };
