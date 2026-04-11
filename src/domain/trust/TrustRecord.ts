/**
 * Trust V1 record — discriminated union with typed subjects.
 *
 * Runtime backing: Zod validation at the decode boundary (TrustRecordSchema).
 * After parsing, the domain works with typed TrustRecord values.
 * Subject fields narrow automatically via TypeScript's control flow.
 *
 * @module domain/trust/TrustRecord
 * @see docs/specs/TRUST_V1_CRYPTO.md
 */

import type {
  KeyAddSubject,
  KeyRevokeSubject,
  WriterBindAddSubject,
  WriterBindRevokeSubject,
  TrustSignature,
} from './schemas.ts';

// -- Common fields shared by all record types ---------------------------------

type TrustRecordCommon = {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly issuerKeyId: string;
  readonly issuedAt: string;
  readonly prev: string | null;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly signature: Readonly<TrustSignature>;
};

// -- Per-type records with typed subjects -------------------------------------

type KeyAddRecord = TrustRecordCommon & {
  readonly recordType: 'KEY_ADD';
  readonly subject: Readonly<KeyAddSubject>;
};

type KeyRevokeRecord = TrustRecordCommon & {
  readonly recordType: 'KEY_REVOKE';
  readonly subject: Readonly<KeyRevokeSubject>;
};

type WriterBindAddRecord = TrustRecordCommon & {
  readonly recordType: 'WRITER_BIND_ADD';
  readonly subject: Readonly<WriterBindAddSubject>;
};

type WriterBindRevokeRecord = TrustRecordCommon & {
  readonly recordType: 'WRITER_BIND_REVOKE';
  readonly subject: Readonly<WriterBindRevokeSubject>;
};

// -- Discriminated union ------------------------------------------------------

type TrustRecord = KeyAddRecord | KeyRevokeRecord | WriterBindAddRecord | WriterBindRevokeRecord;

export type {
  TrustRecord,
  TrustRecordCommon,
  KeyAddRecord,
  KeyRevokeRecord,
  WriterBindAddRecord,
  WriterBindRevokeRecord,
};
