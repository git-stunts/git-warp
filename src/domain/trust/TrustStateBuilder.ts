/**
 * Trust V1 state builder.
 *
 * Pure function that walks an ordered sequence of trust records and
 * accumulates the trust state: active/revoked keys and writer bindings.
 *
 * No I/O, no side effects, no infrastructure imports.
 *
 * @module domain/trust/TrustStateBuilder
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 11
 */

import { TrustRecordSchema } from './schemas.ts';
import type { TrustRecord, KeyAddRecord, KeyRevokeRecord, WriterBindAddRecord, WriterBindRevokeRecord } from './TrustRecord.ts';

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
  rec: KeyAddRecord,
  compute: (pk: string) => string,
): string | null {
  try {
    const expected = compute(rec.subject.publicKey);
    if (expected !== rec.subject.keyId) {
      return `KEY_ADD fingerprint mismatch: declared ${rec.subject.keyId}, computed ${expected}`;
    }
    return null;
  } catch (err) {
    return `KEY_ADD fingerprint validation failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function resolveIssuerKey(
  rec: TrustRecord,
  activeKeys: ReadonlyMap<string, ActiveKeyInfo>,
): string | null {
  if (rec.recordType === 'KEY_ADD' && rec.issuerKeyId === rec.subject.keyId) {
    return rec.subject.publicKey;
  }
  const found = activeKeys.get(rec.issuerKeyId);
  if (found && found.publicKey.length > 0) {
    return found.publicKey;
  }
  return null;
}

function validateCryptography(
  rec: TrustRecord,
  activeKeys: ReadonlyMap<string, ActiveKeyInfo>,
  options: TrustBuildOptions,
): string | null {
  if (options.computeKeyFingerprint && rec.recordType === 'KEY_ADD') {
    const fpError = validateFingerprint(rec, options.computeKeyFingerprint);
    if (fpError) {
      return fpError;
    }
  }

  if (!options.signatureVerifier) {
    return null;
  }

  const issuerPk = resolveIssuerKey(rec, activeKeys);
  if (!issuerPk) {
    return `Unknown issuer key for signature verification: ${rec.issuerKeyId}`;
  }

  try {
    if (!options.signatureVerifier(rec, issuerPk)) {
      return `Signature verification failed for issuer key ${rec.issuerKeyId}`;
    }
  } catch (err) {
    return `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return null;
}

// -- Per-type record handlers -------------------------------------------------

function handleKeyAdd(rec: KeyAddRecord, ctx: TrustBuildContext): void {
  const { keyId, publicKey } = rec.subject;

  if (ctx.revokedKeys.has(keyId)) {
    ctx.errors.push({ recordId: rec.recordId, error: `Cannot re-add revoked key: ${keyId}` });
    return;
  }
  if (ctx.activeKeys.has(keyId)) {
    ctx.errors.push({ recordId: rec.recordId, error: `Duplicate KEY_ADD for already-active key: ${keyId}` });
    return;
  }
  ctx.activeKeys.set(keyId, { publicKey, addedAt: rec.issuedAt });
}

function handleKeyRevoke(rec: KeyRevokeRecord, ctx: TrustBuildContext): void {
  const { keyId, reasonCode } = rec.subject;

  if (ctx.revokedKeys.has(keyId)) {
    ctx.errors.push({ recordId: rec.recordId, error: `Key already revoked: ${keyId}` });
    return;
  }
  const keyInfo = ctx.activeKeys.get(keyId);
  if (!keyInfo) {
    ctx.errors.push({ recordId: rec.recordId, error: `Cannot revoke unknown key: ${keyId}` });
    return;
  }
  ctx.activeKeys.delete(keyId);
  ctx.revokedKeys.set(keyId, { publicKey: keyInfo.publicKey, revokedAt: rec.issuedAt, reasonCode });
}

function handleBindAdd(rec: WriterBindAddRecord, ctx: TrustBuildContext): void {
  const { writerId, keyId } = rec.subject;
  const bindingKey = `${writerId}\0${keyId}`;

  if (ctx.revokedKeys.has(keyId)) {
    ctx.errors.push({ recordId: rec.recordId, error: `Cannot bind writer to revoked key: ${keyId}` });
    return;
  }
  if (!ctx.activeKeys.has(keyId)) {
    ctx.errors.push({ recordId: rec.recordId, error: `Cannot bind writer to unknown key: ${keyId}` });
    return;
  }
  ctx.writerBindings.set(bindingKey, { keyId, boundAt: rec.issuedAt });
}

function handleBindRevoke(rec: WriterBindRevokeRecord, ctx: TrustBuildContext): void {
  const { writerId, keyId, reasonCode } = rec.subject;
  const bindingKey = `${writerId}\0${keyId}`;

  const binding = ctx.writerBindings.get(bindingKey);
  if (!binding) {
    ctx.errors.push({ recordId: rec.recordId, error: `Cannot revoke non-existent binding: writer=${writerId} key=${keyId}` });
    return;
  }
  ctx.writerBindings.delete(bindingKey);
  ctx.revokedBindings.set(bindingKey, { keyId, revokedAt: rec.issuedAt, reasonCode });
}

// -- Record dispatch ----------------------------------------------------------

function processRecord(rec: TrustRecord, ctx: TrustBuildContext): void {
  const cryptoError = validateCryptography(rec, ctx.activeKeys, ctx.options);
  if (cryptoError) {
    ctx.errors.push({ recordId: rec.recordId, error: cryptoError });
    return;
  }

  switch (rec.recordType) {
    case 'KEY_ADD': { handleKeyAdd(rec, ctx); break; }
    case 'KEY_REVOKE': { handleKeyRevoke(rec, ctx); break; }
    case 'WRITER_BIND_ADD': { handleBindAdd(rec, ctx); break; }
    case 'WRITER_BIND_REVOKE': { handleBindRevoke(rec, ctx); break; }
  }
}

// -- Public entry point -------------------------------------------------------

/**
 * Builds trust state from an ordered sequence of trust records.
 *
 * Records MUST be in chain order (oldest first). The builder enforces:
 * - Monotonic revocation: once a key is revoked, it cannot be re-added
 * - Binding validity: WRITER_BIND_ADD requires the referenced key to be active
 * - Schema validation: each record is validated against TrustRecordSchema
 */
function buildState(
  records: readonly Record<string, unknown>[],
  options: TrustBuildOptions = {},
): TrustState {
  const ctx: TrustBuildContext = {
    activeKeys: new Map(),
    revokedKeys: new Map(),
    writerBindings: new Map(),
    revokedBindings: new Map(),
    errors: [],
    options,
  };

  for (const record of records) {
    const parsed = TrustRecordSchema.safeParse(record);
    if (!parsed.success) {
      const id = typeof (record as Record<string, unknown>)['recordId'] === 'string'
        ? (record as Record<string, unknown>)['recordId'] as string
        : '(unknown)';
      ctx.errors.push({
        recordId: id,
        error: `Schema validation failed: ${parsed.error.message}`,
      });
      continue;
    }

    processRecord(parsed.data as TrustRecord, ctx);
  }

  return new TrustState({
    activeKeys: ctx.activeKeys,
    revokedKeys: ctx.revokedKeys,
    writerBindings: ctx.writerBindings,
    revokedBindings: ctx.revokedBindings,
    errors: ctx.errors,
    recordsProcessed: records.length,
  });
}

export { TrustState, buildState };
export type { TrustBuildOptions, ActiveKeyInfo, RevokedKeyInfo, BindingInfo, RevokedBindingInfo, BuildError };
