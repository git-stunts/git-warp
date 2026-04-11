/**
 * Trust V1 state builder.
 *
 * Pure function that walks an ordered sequence of trust records and
 * accumulates the trust state: active/revoked keys and writer bindings.
 *
 * No I/O, no side effects, no infrastructure imports.
 * Accepts sync arrays or async streams (from TrustChainPort).
 *
 * @module domain/trust/TrustStateBuilder
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 11
 */

import { TrustRecord } from './TrustRecord.ts';
import type { KeyAddSubject, KeyRevokeSubject, WriterBindAddSubject, WriterBindRevokeSubject } from './TrustRecord.ts';

// -- Domain types for trust state ---------------------------------------------

type ActiveKeyInfo = { readonly publicKey: string; readonly addedAt: string };
type RevokedKeyInfo = { readonly publicKey: string; readonly revokedAt: string; readonly reasonCode: string };
type BindingInfo = { readonly keyId: string; readonly boundAt: string };
type RevokedBindingInfo = { readonly keyId: string; readonly revokedAt: string; readonly reasonCode: string };
type BuildError = { readonly recordId: string; readonly error: string };

// -- TrustState ---------------------------------------------------------------

class TrustState {
  readonly activeKeys: ReadonlyMap<string, ActiveKeyInfo>;
  readonly revokedKeys: ReadonlyMap<string, RevokedKeyInfo>;
  readonly writerBindings: ReadonlyMap<string, BindingInfo>;
  readonly revokedBindings: ReadonlyMap<string, RevokedBindingInfo>;
  readonly errors: readonly BuildError[];
  readonly recordsProcessed: number;

  constructor(fields: {
    activeKeys: Map<string, ActiveKeyInfo>;
    revokedKeys: Map<string, RevokedKeyInfo>;
    writerBindings: Map<string, BindingInfo>;
    revokedBindings: Map<string, RevokedBindingInfo>;
    errors: BuildError[];
    recordsProcessed: number;
  }) {
    this.activeKeys = fields.activeKeys;
    this.revokedKeys = fields.revokedKeys;
    this.writerBindings = fields.writerBindings;
    this.revokedBindings = fields.revokedBindings;
    this.errors = fields.errors;
    this.recordsProcessed = fields.recordsProcessed;
    Object.freeze(this);
  }
}

// -- Build options (crypto injection) -----------------------------------------

type TrustBuildOptions = {
  readonly signatureVerifier?: (record: TrustRecord, publicKeyBase64: string) => boolean;
  readonly computeKeyFingerprint?: (publicKeyBase64: string) => string;
};

// -- Mutable context during build ---------------------------------------------

type TrustBuildContext = {
  readonly activeKeys: Map<string, ActiveKeyInfo>;
  readonly revokedKeys: Map<string, RevokedKeyInfo>;
  readonly writerBindings: Map<string, BindingInfo>;
  readonly revokedBindings: Map<string, RevokedBindingInfo>;
  readonly errors: BuildError[];
  readonly options: TrustBuildOptions;
};

// -- Crypto validation --------------------------------------------------------

function validateFingerprint(
  subject: KeyAddSubject,
  recordId: string,
  compute: (pk: string) => string,
  errors: BuildError[],
): boolean {
  try {
    const expected = compute(subject.publicKey);
    if (expected !== subject.keyId) {
      errors.push({ recordId, error: `KEY_ADD fingerprint mismatch: declared ${subject.keyId}, computed ${expected}` });
      return false;
    }
    return true;
  } catch (err) {
    errors.push({ recordId, error: `KEY_ADD fingerprint validation failed: ${err instanceof Error ? err.message : String(err)}` });
    return false;
  }
}

function resolveIssuerKey(
  rec: TrustRecord,
  activeKeys: ReadonlyMap<string, ActiveKeyInfo>,
): string | null {
  if (rec.isKeyAdd() && rec.issuerKeyId === rec.subject.keyId) {
    return rec.subject.publicKey;
  }
  const found = activeKeys.get(rec.issuerKeyId);
  if (found && found.publicKey.length > 0) {
    return found.publicKey;
  }
  return null;
}

function validateCryptography(rec: TrustRecord, ctx: TrustBuildContext): boolean {
  if (ctx.options.computeKeyFingerprint && rec.isKeyAdd()) {
    if (!validateFingerprint(rec.subject, rec.recordId, ctx.options.computeKeyFingerprint, ctx.errors)) {
      return false;
    }
  }

  if (!ctx.options.signatureVerifier) {
    return true;
  }

  const issuerPk = resolveIssuerKey(rec, ctx.activeKeys);
  if (!issuerPk) {
    ctx.errors.push({ recordId: rec.recordId, error: `Unknown issuer key for signature verification: ${rec.issuerKeyId}` });
    return false;
  }

  try {
    if (!ctx.options.signatureVerifier(rec, issuerPk)) {
      ctx.errors.push({ recordId: rec.recordId, error: `Signature verification failed for issuer key ${rec.issuerKeyId}` });
      return false;
    }
  } catch (err) {
    ctx.errors.push({ recordId: rec.recordId, error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}` });
    return false;
  }

  return true;
}

// -- Per-type record handlers -------------------------------------------------

function handleKeyAdd(subject: KeyAddSubject, issuedAt: string, recordId: string, ctx: TrustBuildContext): void {
  if (ctx.revokedKeys.has(subject.keyId)) {
    ctx.errors.push({ recordId, error: `Cannot re-add revoked key: ${subject.keyId}` });
    return;
  }
  if (ctx.activeKeys.has(subject.keyId)) {
    ctx.errors.push({ recordId, error: `Duplicate KEY_ADD for already-active key: ${subject.keyId}` });
    return;
  }
  ctx.activeKeys.set(subject.keyId, { publicKey: subject.publicKey, addedAt: issuedAt });
}

function handleKeyRevoke(subject: KeyRevokeSubject, issuedAt: string, recordId: string, ctx: TrustBuildContext): void {
  if (ctx.revokedKeys.has(subject.keyId)) {
    ctx.errors.push({ recordId, error: `Key already revoked: ${subject.keyId}` });
    return;
  }
  const keyInfo = ctx.activeKeys.get(subject.keyId);
  if (!keyInfo) {
    ctx.errors.push({ recordId, error: `Cannot revoke unknown key: ${subject.keyId}` });
    return;
  }
  ctx.activeKeys.delete(subject.keyId);
  ctx.revokedKeys.set(subject.keyId, { publicKey: keyInfo.publicKey, revokedAt: issuedAt, reasonCode: subject.reasonCode });
}

function handleBindAdd(subject: WriterBindAddSubject, issuedAt: string, recordId: string, ctx: TrustBuildContext): void {
  const bindingKey = `${subject.writerId}\0${subject.keyId}`;
  if (ctx.revokedKeys.has(subject.keyId)) {
    ctx.errors.push({ recordId, error: `Cannot bind writer to revoked key: ${subject.keyId}` });
    return;
  }
  if (!ctx.activeKeys.has(subject.keyId)) {
    ctx.errors.push({ recordId, error: `Cannot bind writer to unknown key: ${subject.keyId}` });
    return;
  }
  ctx.writerBindings.set(bindingKey, { keyId: subject.keyId, boundAt: issuedAt });
}

function handleBindRevoke(subject: WriterBindRevokeSubject, issuedAt: string, recordId: string, ctx: TrustBuildContext): void {
  const bindingKey = `${subject.writerId}\0${subject.keyId}`;
  const binding = ctx.writerBindings.get(bindingKey);
  if (!binding) {
    ctx.errors.push({ recordId, error: `Cannot revoke non-existent binding: writer=${subject.writerId} key=${subject.keyId}` });
    return;
  }
  ctx.writerBindings.delete(bindingKey);
  ctx.revokedBindings.set(bindingKey, { keyId: subject.keyId, revokedAt: issuedAt, reasonCode: subject.reasonCode });
}

// -- Record dispatch ----------------------------------------------------------

function processRecord(rec: TrustRecord, ctx: TrustBuildContext): void {
  if (!validateCryptography(rec, ctx)) {
    return;
  }

  if (rec.isKeyAdd()) {
    handleKeyAdd(rec.subject, rec.issuedAt, rec.recordId, ctx);
  } else if (rec.isKeyRevoke()) {
    handleKeyRevoke(rec.subject, rec.issuedAt, rec.recordId, ctx);
  } else if (rec.isBindAdd()) {
    handleBindAdd(rec.subject, rec.issuedAt, rec.recordId, ctx);
  } else if (rec.isBindRevoke()) {
    handleBindRevoke(rec.subject, rec.issuedAt, rec.recordId, ctx);
  }
}

// -- Public entry point -------------------------------------------------------

/** Input can be a sync array (tests) or async stream (port). */
type RecordSource = readonly TrustRecord[] | Iterable<TrustRecord> | AsyncIterable<TrustRecord>;

function isAsyncIterable(v: RecordSource): v is AsyncIterable<TrustRecord> {
  return v != null && Symbol.asyncIterator in Object(v);
}

/**
 * Builds trust state from an ordered sequence of trust records.
 *
 * Records MUST be in chain order (oldest first). The builder enforces:
 * - Monotonic revocation: once a key is revoked, it cannot be re-added
 * - Binding validity: WRITER_BIND_ADD requires the referenced key to be active
 * - Cryptographic verification (when signatureVerifier is provided)
 *
 * Records are already validated by TrustRecord.fromDecoded() at the
 * adapter boundary. No Zod, no schema re-validation here.
 */
async function buildState(
  records: RecordSource,
  options: TrustBuildOptions = {},
): Promise<TrustState> {
  const ctx: TrustBuildContext = {
    activeKeys: new Map(),
    revokedKeys: new Map(),
    writerBindings: new Map(),
    revokedBindings: new Map(),
    errors: [],
    options,
  };

  let count = 0;

  if (isAsyncIterable(records)) {
    for await (const record of records) {
      processRecord(record, ctx);
      count++;
    }
  } else {
    for (const record of records) {
      processRecord(record, ctx);
      count++;
    }
  }

  return new TrustState({
    activeKeys: ctx.activeKeys,
    revokedKeys: ctx.revokedKeys,
    writerBindings: ctx.writerBindings,
    revokedBindings: ctx.revokedBindings,
    errors: ctx.errors,
    recordsProcessed: count,
  });
}

export { TrustState, buildState };
export type { TrustBuildOptions, ActiveKeyInfo, RevokedKeyInfo, BindingInfo, RevokedBindingInfo, BuildError };
