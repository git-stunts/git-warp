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
 * @see docs/specs/TRUST_CRYPTO_ALGORITHM.md Section 11
 */

import { type TrustRecord, type KeyAddSubject, type KeyRevokeSubject, type WriterBindAddSubject, type WriterBindRevokeSubject } from './TrustRecord.ts';
import TrustError from '../errors/TrustError.ts';
import TrustReadonlyMap from './TrustReadonlyMap.ts';

// -- Domain types for trust state ---------------------------------------------

type ActiveKeyInfo = { readonly publicKey: string; readonly addedAt: string };
type RevokedKeyInfo = { readonly publicKey: string; readonly revokedAt: string; readonly reasonCode: string };
type BindingInfo = { readonly keyId: string; readonly boundAt: string };
type RevokedBindingInfo = { readonly keyId: string; readonly revokedAt: string; readonly reasonCode: string };
type BuildError = { readonly recordId: string; readonly error: string };

const KEY_ID_PATTERN = /^ed25519:[a-f0-9]{64}$/;
const BINDING_KEY_SEPARATOR = '\0';

// -- TrustState ---------------------------------------------------------------

class TrustState {
  readonly activeKeys: TrustReadonlyMap<string, ActiveKeyInfo>;
  readonly revokedKeys: TrustReadonlyMap<string, RevokedKeyInfo>;
  readonly writerBindings: TrustReadonlyMap<string, BindingInfo>;
  readonly revokedBindings: TrustReadonlyMap<string, RevokedBindingInfo>;
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
    this.activeKeys = copyActiveKeys(fields.activeKeys);
    this.revokedKeys = copyRevokedKeys(fields.revokedKeys);
    this.writerBindings = copyWriterBindings(fields.writerBindings);
    this.revokedBindings = copyRevokedBindings(fields.revokedBindings);
    this.errors = copyBuildErrors(fields.errors);
    assertRecordCount(fields.recordsProcessed);
    this.recordsProcessed = fields.recordsProcessed;
    Object.freeze(this);
  }

  hasActiveKey(keyId: string): boolean {
    assertKeyId(keyId, 'keyId');
    return this.activeKeys.has(keyId);
  }

  getBindingsForWriter(writerId: string): readonly BindingInfo[] {
    assertWriterId(writerId, 'writerId');
    const bindings: BindingInfo[] = [];
    for (const [bindingKey, binding] of this.writerBindings) {
      const parsed = parseBindingKey(bindingKey, 'writerBindings');
      if (parsed.writerId === writerId) {
        bindings.push(binding);
      }
    }
    return Object.freeze(bindings);
  }

  hasRevokedBindingsForWriter(writerId: string): boolean {
    assertWriterId(writerId, 'writerId');
    for (const bindingKey of this.revokedBindings.keys()) {
      if (parseBindingKey(bindingKey, 'revokedBindings').writerId === writerId) {
        return true;
      }
    }
    return false;
  }
}

function assertMap<K, V>(value: Map<K, V>, field: string): void {
  if (!(value instanceof Map)) {
    throw new TrustError(`${field} must be a Map`, {
      code: 'E_TRUST_STATE_INVALID',
      context: { field },
    });
  }
}

function assertArray<T>(value: T[], field: string): void {
  if (!Array.isArray(value)) {
    throw new TrustError(`${field} must be an array`, {
      code: 'E_TRUST_STATE_INVALID',
      context: { field },
    });
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TrustError(`${field} must be a non-empty string`, {
      code: 'E_TRUST_STATE_INVALID',
      context: { field },
    });
  }
}

function assertKeyId(keyId: string, field: string): void {
  assertNonEmptyString(keyId, field);
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new TrustError(`${field} must be an ed25519 key id`, {
      code: 'E_TRUST_STATE_INVALID',
      context: { field, keyId },
    });
  }
}

function assertWriterId(writerId: string, field: string): void {
  assertNonEmptyString(writerId, field);
  if (writerId.includes(BINDING_KEY_SEPARATOR)) {
    throw new TrustError(`${field} must not contain the trust binding separator`, {
      code: 'E_TRUST_STATE_INVALID',
      context: { field, writerId },
    });
  }
}

function assertRecordCount(recordsProcessed: number): void {
  if (!Number.isInteger(recordsProcessed) || recordsProcessed < 0) {
    throw new TrustError('recordsProcessed must be a non-negative integer', {
      code: 'E_TRUST_STATE_INVALID',
      context: { field: 'recordsProcessed' },
    });
  }
}

function encodeBindingKey(writerId: string, keyId: string): string {
  assertWriterId(writerId, 'writerId');
  assertKeyId(keyId, 'keyId');
  return `${writerId}${BINDING_KEY_SEPARATOR}${keyId}`;
}

function parseBindingKey(bindingKey: string, field: string): { readonly writerId: string; readonly keyId: string } {
  assertNonEmptyString(bindingKey, field);
  const separatorIndex = bindingKey.indexOf(BINDING_KEY_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex !== bindingKey.lastIndexOf(BINDING_KEY_SEPARATOR)) {
    throw new TrustError(`${field} key must encode exactly one writer/key binding`, {
      code: 'E_TRUST_STATE_INVALID',
      context: { field },
    });
  }
  const writerId = bindingKey.slice(0, separatorIndex);
  const keyId = bindingKey.slice(separatorIndex + BINDING_KEY_SEPARATOR.length);
  assertWriterId(writerId, `${field}.writerId`);
  assertKeyId(keyId, `${field}.keyId`);
  return { writerId, keyId };
}

function copyActiveKeys(source: Map<string, ActiveKeyInfo>): TrustReadonlyMap<string, ActiveKeyInfo> {
  assertMap(source, 'activeKeys');
  const copy = new Map<string, ActiveKeyInfo>();
  for (const [keyId, info] of source) {
    assertKeyId(keyId, 'activeKeys.key');
    copy.set(keyId, freezeActiveKeyInfo(info));
  }
  return new TrustReadonlyMap(copy);
}

function copyRevokedKeys(source: Map<string, RevokedKeyInfo>): TrustReadonlyMap<string, RevokedKeyInfo> {
  assertMap(source, 'revokedKeys');
  const copy = new Map<string, RevokedKeyInfo>();
  for (const [keyId, info] of source) {
    assertKeyId(keyId, 'revokedKeys.key');
    copy.set(keyId, freezeRevokedKeyInfo(info));
  }
  return new TrustReadonlyMap(copy);
}

function copyWriterBindings(source: Map<string, BindingInfo>): TrustReadonlyMap<string, BindingInfo> {
  assertMap(source, 'writerBindings');
  const copy = new Map<string, BindingInfo>();
  for (const [bindingKey, info] of source) {
    const parsed = parseBindingKey(bindingKey, 'writerBindings');
    const frozen = freezeBindingInfo(info);
    assertMatchingBindingKey(parsed.keyId, frozen.keyId, 'writerBindings');
    copy.set(bindingKey, frozen);
  }
  return new TrustReadonlyMap(copy);
}

function copyRevokedBindings(source: Map<string, RevokedBindingInfo>): TrustReadonlyMap<string, RevokedBindingInfo> {
  assertMap(source, 'revokedBindings');
  const copy = new Map<string, RevokedBindingInfo>();
  for (const [bindingKey, info] of source) {
    const parsed = parseBindingKey(bindingKey, 'revokedBindings');
    const frozen = freezeRevokedBindingInfo(info);
    assertMatchingBindingKey(parsed.keyId, frozen.keyId, 'revokedBindings');
    copy.set(bindingKey, frozen);
  }
  return new TrustReadonlyMap(copy);
}

function assertMatchingBindingKey(encodedKeyId: string, valueKeyId: string, field: string): void {
  if (encodedKeyId !== valueKeyId) {
    throw new TrustError(`${field} keyId must match the encoded binding key`, {
      code: 'E_TRUST_STATE_INVALID',
      context: { field, encodedKeyId, valueKeyId },
    });
  }
}

function freezeActiveKeyInfo(info: ActiveKeyInfo): ActiveKeyInfo {
  assertNonEmptyString(info.publicKey, 'activeKeys.publicKey');
  assertNonEmptyString(info.addedAt, 'activeKeys.addedAt');
  return Object.freeze({ publicKey: info.publicKey, addedAt: info.addedAt });
}

function freezeRevokedKeyInfo(info: RevokedKeyInfo): RevokedKeyInfo {
  assertNonEmptyString(info.publicKey, 'revokedKeys.publicKey');
  assertNonEmptyString(info.revokedAt, 'revokedKeys.revokedAt');
  assertNonEmptyString(info.reasonCode, 'revokedKeys.reasonCode');
  return Object.freeze({ publicKey: info.publicKey, revokedAt: info.revokedAt, reasonCode: info.reasonCode });
}

function freezeBindingInfo(info: BindingInfo): BindingInfo {
  assertKeyId(info.keyId, 'writerBindings.keyId');
  assertNonEmptyString(info.boundAt, 'writerBindings.boundAt');
  return Object.freeze({ keyId: info.keyId, boundAt: info.boundAt });
}

function freezeRevokedBindingInfo(info: RevokedBindingInfo): RevokedBindingInfo {
  assertKeyId(info.keyId, 'revokedBindings.keyId');
  assertNonEmptyString(info.revokedAt, 'revokedBindings.revokedAt');
  assertNonEmptyString(info.reasonCode, 'revokedBindings.reasonCode');
  return Object.freeze({ keyId: info.keyId, revokedAt: info.revokedAt, reasonCode: info.reasonCode });
}

function copyBuildErrors(errors: BuildError[]): readonly BuildError[] {
  assertArray(errors, 'errors');
  return Object.freeze(errors.map((error) => {
    assertNonEmptyString(error.recordId, 'errors.recordId');
    assertNonEmptyString(error.error, 'errors.error');
    return Object.freeze({ recordId: error.recordId, error: error.error });
  }));
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

  if (ctx.options.signatureVerifier === undefined) {
    return true;
  }

  const issuerPk = resolveIssuerKey(rec, ctx.activeKeys);
  if (issuerPk === null) {
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
    ctx.errors.push({ recordId, error: `Cannot revoke unknown key: ${subject.keyId}` }); // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    return;
  }
  ctx.activeKeys.delete(subject.keyId);
  ctx.revokedKeys.set(subject.keyId, { publicKey: keyInfo.publicKey, revokedAt: issuedAt, reasonCode: subject.reasonCode });
}

function handleBindAdd(subject: WriterBindAddSubject, issuedAt: string, recordId: string, ctx: TrustBuildContext): void {
  const bindingKey = encodeBindingKey(subject.writerId, subject.keyId);
  if (ctx.revokedKeys.has(subject.keyId)) {
    ctx.errors.push({ recordId, error: `Cannot bind writer to revoked key: ${subject.keyId}` });
    return;
  }
  if (!ctx.activeKeys.has(subject.keyId)) {
    ctx.errors.push({ recordId, error: `Cannot bind writer to unknown key: ${subject.keyId}` }); // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    return;
  }
  ctx.writerBindings.set(bindingKey, { keyId: subject.keyId, boundAt: issuedAt });
}

function handleBindRevoke(subject: WriterBindRevokeSubject, issuedAt: string, recordId: string, ctx: TrustBuildContext): void {
  const bindingKey = encodeBindingKey(subject.writerId, subject.keyId);
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
  return v !== null && v !== undefined && Symbol.asyncIterator in Object(v);
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
