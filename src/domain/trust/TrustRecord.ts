/**
 * Trust V1 record — runtime-backed value object.
 *
 * Validated at the adapter boundary via fromDecoded(). No Zod —
 * integrity is guaranteed by git-cas (SHA-256 chunks), recordId
 * (content-addressed hash), and Ed25519 signatures.
 *
 * The signaturePayload is precomputed by the adapter from the raw
 * canonical form, so domain code never touches untyped wire data.
 *
 * @module domain/trust/TrustRecord
 * @see docs/specs/TRUST_V1_CRYPTO.md
 */

import TrustError from '../errors/TrustError.ts';

// -- Record type literal ------------------------------------------------------

const RECORD_TYPES = ['KEY_ADD', 'KEY_REVOKE', 'WRITER_BIND_ADD', 'WRITER_BIND_REVOKE'] as const;
type RecordType = typeof RECORD_TYPES[number];

// -- Typed subjects -----------------------------------------------------------

type KeyAddSubject = {
  readonly keyId: string;
  readonly publicKey: string;
};

type KeyRevokeSubject = {
  readonly keyId: string;
  readonly reasonCode: string;
};

type WriterBindAddSubject = {
  readonly writerId: string;
  readonly keyId: string;
};

type WriterBindRevokeSubject = {
  readonly writerId: string;
  readonly keyId: string;
  readonly reasonCode: string;
};

type TrustSubject = KeyAddSubject | KeyRevokeSubject | WriterBindAddSubject | WriterBindRevokeSubject;

// -- Signature ----------------------------------------------------------------

type TrustSignature = {
  readonly alg: 'ed25519';
  readonly sig: string;
};

// -- Decoded input shape (what the adapter provides after CBOR decode) ---------

type DecodedTrustRecord = {
  readonly schemaVersion: number;
  readonly recordType: string;
  readonly recordId: string;
  readonly issuerKeyId: string;
  readonly issuedAt: string;
  readonly prev: string | null;
  readonly subject: Readonly<Record<string, string>>;
  readonly meta: Readonly<Record<string, string | number | boolean | null>>;
  readonly signature: { readonly alg: string; readonly sig: string };
  readonly signaturePayload: Uint8Array;
};

// -- Validation helpers -------------------------------------------------------

function requireString(obj: Readonly<Record<string, string>>, key: string, context: string): string {
  const val = obj[key];
  if (typeof val !== 'string' || val.length === 0) {
    throw new TrustError(`${context}: missing or empty '${key}'`, { code: 'E_TRUST_RECORD_INVALID' });
  }
  return val;
}

function validateKeyAddSubject(subj: Readonly<Record<string, string>>): KeyAddSubject {
  return {
    keyId: requireString(subj, 'keyId', 'KEY_ADD subject'),
    publicKey: requireString(subj, 'publicKey', 'KEY_ADD subject'),
  };
}

function validateKeyRevokeSubject(subj: Readonly<Record<string, string>>): KeyRevokeSubject {
  return {
    keyId: requireString(subj, 'keyId', 'KEY_REVOKE subject'),
    reasonCode: requireString(subj, 'reasonCode', 'KEY_REVOKE subject'),
  };
}

function validateBindAddSubject(subj: Readonly<Record<string, string>>): WriterBindAddSubject {
  return {
    writerId: requireString(subj, 'writerId', 'WRITER_BIND_ADD subject'),
    keyId: requireString(subj, 'keyId', 'WRITER_BIND_ADD subject'),
  };
}

function validateBindRevokeSubject(subj: Readonly<Record<string, string>>): WriterBindRevokeSubject {
  return {
    writerId: requireString(subj, 'writerId', 'WRITER_BIND_REVOKE subject'),
    keyId: requireString(subj, 'keyId', 'WRITER_BIND_REVOKE subject'),
    reasonCode: requireString(subj, 'reasonCode', 'WRITER_BIND_REVOKE subject'),
  };
}

function validateSubject(recordType: RecordType, subj: Readonly<Record<string, string>>): TrustSubject {
  switch (recordType) {
    case 'KEY_ADD': { return validateKeyAddSubject(subj); }
    case 'KEY_REVOKE': { return validateKeyRevokeSubject(subj); }
    case 'WRITER_BIND_ADD': { return validateBindAddSubject(subj); }
    case 'WRITER_BIND_REVOKE': { return validateBindRevokeSubject(subj); }
  }
}

function validateSignature(sig: { readonly alg: string; readonly sig: string }): TrustSignature {
  if (sig.alg !== 'ed25519') {
    throw new TrustError(`Unsupported signature algorithm: ${sig.alg}`, { code: 'E_TRUST_RECORD_INVALID' });
  }
  if (typeof sig.sig !== 'string' || sig.sig.length === 0) {
    throw new TrustError('Empty signature', { code: 'E_TRUST_SIGNATURE_MISSING' });
  }
  return { alg: 'ed25519', sig: sig.sig };
}

// -- TrustRecord class --------------------------------------------------------

class TrustRecord {
  readonly schemaVersion: 1 = 1;
  readonly recordType: RecordType;
  readonly recordId: string;
  readonly issuerKeyId: string;
  readonly issuedAt: string;
  readonly prev: string | null;
  readonly subject: Readonly<TrustSubject>;
  readonly meta: Readonly<Record<string, string | number | boolean | null>>;
  readonly signature: Readonly<TrustSignature>;
  readonly signaturePayload: Uint8Array;

  private constructor(
    recordType: RecordType,
    recordId: string,
    issuerKeyId: string,
    issuedAt: string,
    prev: string | null,
    subject: Readonly<TrustSubject>,
    meta: Readonly<Record<string, string | number | boolean | null>>,
    signature: Readonly<TrustSignature>,
    signaturePayload: Uint8Array,
  ) {
    this.recordType = recordType;
    this.recordId = recordId;
    this.issuerKeyId = issuerKeyId;
    this.issuedAt = issuedAt;
    this.prev = prev;
    this.subject = subject;
    this.meta = meta;
    this.signature = signature;
    this.signaturePayload = signaturePayload;
    Object.freeze(this);
  }

  /**
   * Constructs a TrustRecord from adapter-decoded data.
   *
   * The adapter is responsible for:
   * 1. CBOR decoding the raw blob (via git-cas)
   * 2. Verifying recordId against the raw canonical hash
   * 3. Computing signaturePayload from the raw canonical form
   * 4. Passing the decoded + verified data here for structural validation
   *
   * Throws TrustError on invalid structure.
   */
  static fromDecoded(input: DecodedTrustRecord): TrustRecord {
    if (input.schemaVersion !== 1) {
      throw new TrustError(
        `Unsupported schema version: ${String(input.schemaVersion)}`,
        { code: 'E_TRUST_RECORD_INVALID' },
      );
    }

    if (!RECORD_TYPES.includes(input.recordType as RecordType)) {
      throw new TrustError(
        `Unknown record type: ${input.recordType}`,
        { code: 'E_TRUST_RECORD_INVALID' },
      );
    }
    const recordType = input.recordType as RecordType;

    return new TrustRecord(
      recordType,
      input.recordId,
      input.issuerKeyId,
      input.issuedAt,
      input.prev,
      validateSubject(recordType, input.subject),
      input.meta,
      validateSignature(input.signature),
      input.signaturePayload,
    );
  }

  /** Type guard: is this a KEY_ADD record? */
  isKeyAdd(): this is TrustRecord & { readonly subject: KeyAddSubject; readonly recordType: 'KEY_ADD' } {
    return this.recordType === 'KEY_ADD';
  }

  /** Type guard: is this a KEY_REVOKE record? */
  isKeyRevoke(): this is TrustRecord & { readonly subject: KeyRevokeSubject; readonly recordType: 'KEY_REVOKE' } {
    return this.recordType === 'KEY_REVOKE';
  }

  /** Type guard: is this a WRITER_BIND_ADD record? */
  isBindAdd(): this is TrustRecord & { readonly subject: WriterBindAddSubject; readonly recordType: 'WRITER_BIND_ADD' } {
    return this.recordType === 'WRITER_BIND_ADD';
  }

  /** Type guard: is this a WRITER_BIND_REVOKE record? */
  isBindRevoke(): this is TrustRecord & { readonly subject: WriterBindRevokeSubject; readonly recordType: 'WRITER_BIND_REVOKE' } {
    return this.recordType === 'WRITER_BIND_REVOKE';
  }
}

export { TrustRecord, RECORD_TYPES };
export type {
  RecordType,
  KeyAddSubject,
  KeyRevokeSubject,
  WriterBindAddSubject,
  WriterBindRevokeSubject,
  TrustSubject,
  TrustSignature,
  DecodedTrustRecord,
};
