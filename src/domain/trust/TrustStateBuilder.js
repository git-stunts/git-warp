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

import { TrustRecordSchema } from './schemas.js';

/**
 * @typedef {Object} TrustRecord
 * @property {string} recordType - Record type (KEY_ADD, KEY_REVOKE, WRITER_BIND_ADD, WRITER_BIND_REVOKE)
 * @property {string} recordId - Content-addressed record identifier
 * @property {Record<string, string>} subject - Subject fields (keyId, publicKey, writerId, reasonCode vary by type)
 * @property {string} issuedAt - ISO timestamp
 * @property {number} schemaVersion
 * @property {string} issuerKeyId
 * @property {string|null} prev
 * @property {{alg: string, sig: string}} signature
 * @property {Record<string, unknown>} [meta]
 */

/**
 * TrustState — frozen aggregate of all trust chain records.
 */
export class TrustState {
  /** @type {Map<string, {publicKey: string, addedAt: string}>} */  activeKeys;
  /** @type {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} */  revokedKeys;
  /** @type {Map<string, {keyId: string, boundAt: string}>} */  writerBindings;
  /** @type {Map<string, {keyId: string, revokedAt: string, reasonCode: string}>} */  revokedBindings;
  /** @type {Array<{recordId: string, error: string}>} */  errors;
  /** @type {number} */  recordsProcessed;

  /**
   * Creates a frozen TrustState.
   * @param {{ activeKeys: Map<string, {publicKey: string, addedAt: string}>, revokedKeys: Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>, writerBindings: Map<string, {keyId: string, boundAt: string}>, revokedBindings: Map<string, {keyId: string, revokedAt: string, reasonCode: string}>, errors: Array<{recordId: string, error: string}>, recordsProcessed: number }} fields
   */
  constructor(fields) {
    this.activeKeys = fields.activeKeys;
    this.revokedKeys = fields.revokedKeys;
    this.writerBindings = fields.writerBindings;
    this.revokedBindings = fields.revokedBindings;
    this.errors = fields.errors;
    this.recordsProcessed = fields.recordsProcessed;
    Object.freeze(this);
  }
}

/**
 * @typedef {Object} TrustBuildOptions
 * @property {(record: TrustRecord, publicKeyBase64: string) => boolean} [signatureVerifier] - Optional cryptographic verifier
 * @property {(publicKeyBase64: string) => string} [computeKeyFingerprint] - Optional key fingerprint function for KEY_ADD validation
 */

/**
 * @typedef {Object} TrustBuildContext
 * @property {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @property {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @property {Map<string, {keyId: string, boundAt: string}>} writerBindings
 * @property {Map<string, {keyId: string, revokedAt: string, reasonCode: string}>} revokedBindings
 * @property {Array<{recordId: string, error: string}>} errors
 * @property {TrustBuildOptions} options
 */

/**
 * Builds trust state from an ordered sequence of trust records.
 *
 * Records MUST be in chain order (oldest first). The builder enforces:
 * - Monotonic revocation: once a key is revoked, it cannot be re-added
 * - Binding validity: WRITER_BIND_ADD requires the referenced key to be active
 * - Schema validation: each record is validated against TrustRecordSchema
 *
 * @param {Array<Record<string, unknown>>} records - Trust records in chain order
 * @param {TrustBuildOptions} [options]
 * @returns {TrustState} Frozen trust state
 */
export function buildState(records, options = {}) {
  /** @type {TrustBuildContext} */
  const ctx = {
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
      const rec = /** @type {{ recordId?: string }} */ (record);
      ctx.errors.push({
        recordId: typeof rec.recordId === 'string' ? rec.recordId : '(unknown)',
        error: `Schema validation failed: ${parsed.error.message}`,
      });
      continue;
    }

    const rec = /** @type {TrustRecord} */ (parsed.data);
    processRecord(rec, ctx);
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

/**
 * Dispatches a validated trust record to the appropriate handler.
 *
 * @param {TrustRecord} rec
 * @param {TrustBuildContext} ctx
 */
function processRecord(rec, ctx) {
  const cryptoError = validateRecordCryptography(rec, ctx.activeKeys, ctx.options);
  if (typeof cryptoError === 'string' && cryptoError.length > 0) {
    ctx.errors.push({ recordId: rec.recordId, error: cryptoError });
    return;
  }

  switch (rec.recordType) {
    case 'KEY_ADD':
      handleKeyAdd(rec, ctx.activeKeys, ctx.revokedKeys, ctx.errors);
      break;
    case 'KEY_REVOKE':
      handleKeyRevoke(rec, ctx.activeKeys, ctx.revokedKeys, ctx.errors);
      break;
    case 'WRITER_BIND_ADD':
      handleBindAdd(rec, ctx.activeKeys, ctx.revokedKeys, ctx.writerBindings, ctx.errors);
      break;
    case 'WRITER_BIND_REVOKE':
      handleBindRevoke(rec, ctx.writerBindings, ctx.revokedBindings, ctx.errors);
      break;
    default:
      ctx.errors.push({ recordId: rec.recordId, error: `Unknown recordType: ${rec.recordType}` });
  }
}

/**
 * Validates the cryptographic integrity of a trust record when crypto helpers
 * are supplied by the caller.
 *
 * The builder stays pure: all crypto is injected as callbacks.
 *
 * @param {TrustRecord} rec
 * @param {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @param {TrustBuildOptions} options
 * @returns {string|null}
 */
function validateRecordCryptography(rec, activeKeys, options) {
  const { signatureVerifier, computeKeyFingerprint } = options;

  /** @type {{ publicKey?: string, keyId?: string, writerId?: string, reasonCode?: string }} */
  const subj = rec.subject;

  if (computeKeyFingerprint && rec.recordType === 'KEY_ADD') {
    try {
      const pk = subj.publicKey ?? '';
      const expected = computeKeyFingerprint(pk);
      const kid = subj.keyId ?? '';
      if (expected !== kid) {
        return `KEY_ADD fingerprint mismatch: declared ${kid}, computed ${expected}`;
      }
    } catch (err) {
      return `KEY_ADD fingerprint validation failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (!signatureVerifier) {
    return null;
  }

  let issuerPublicKey = null;
  if (
    rec.recordType === 'KEY_ADD' &&
    rec.issuerKeyId === subj.keyId &&
    typeof subj.publicKey === 'string'
  ) {
    issuerPublicKey = subj.publicKey;
  } else {
    const found = activeKeys.get(rec.issuerKeyId);
    issuerPublicKey = typeof found?.publicKey === 'string' && found.publicKey.length > 0
      ? found.publicKey
      : null;
  }

  if (typeof issuerPublicKey !== 'string' || issuerPublicKey.length === 0) {
    return `Unknown issuer key for signature verification: ${rec.issuerKeyId}`;
  }

  try {
    if (!signatureVerifier(rec, issuerPublicKey)) {
      return `Signature verification failed for issuer key ${rec.issuerKeyId}`;
    }
  } catch (err) {
    return `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return null;
}

/**
 * Processes a KEY_ADD record, adding the key if it is not already active or revoked.
 *
 * @param {TrustRecord} rec
 * @param {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @param {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @param {Array<{recordId: string, error: string}>} errors
 */
function handleKeyAdd(rec, activeKeys, revokedKeys, errors) {
  const s = /** @type {{ keyId?: string, publicKey?: string }} */ (rec.subject);
  const keyId = s.keyId ?? '';
  const publicKey = s.publicKey ?? '';

  if (revokedKeys.has(keyId)) {
    errors.push({
      recordId: rec.recordId,
      error: `Cannot re-add revoked key: ${keyId}`,
    });
    return;
  }

  if (activeKeys.has(keyId)) {
    errors.push({
      recordId: rec.recordId,
      error: `Duplicate KEY_ADD for already-active key: ${keyId}`,
    });
    return;
  }

  activeKeys.set(keyId, { publicKey, addedAt: rec.issuedAt });
}

/**
 * Processes a KEY_REVOKE record, moving the key from active to revoked.
 *
 * @param {TrustRecord} rec
 * @param {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @param {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @param {Array<{recordId: string, error: string}>} errors
 */
function handleKeyRevoke(rec, activeKeys, revokedKeys, errors) {
  const s = /** @type {{ keyId?: string, reasonCode?: string }} */ (rec.subject);
  const keyId = s.keyId ?? '';
  const reasonCode = s.reasonCode ?? '';

  if (revokedKeys.has(keyId)) {
    errors.push({
      recordId: rec.recordId,
      error: `Key already revoked: ${keyId}`,
    });
    return;
  }

  const keyInfo = activeKeys.get(keyId);
  if (!keyInfo) {
    errors.push({
      recordId: rec.recordId,
      error: `Cannot revoke unknown key: ${keyId}`,
    });
    return;
  }

  activeKeys.delete(keyId);
  revokedKeys.set(keyId, {
    publicKey: keyInfo.publicKey,
    revokedAt: rec.issuedAt,
    reasonCode,
  });
}

/**
 * Processes a WRITER_BIND_ADD record, binding a writer to an active key.
 *
 * @param {TrustRecord} rec
 * @param {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @param {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @param {Map<string, {keyId: string, boundAt: string}>} writerBindings
 * @param {Array<{recordId: string, error: string}>} errors
 */
function handleBindAdd(rec, activeKeys, revokedKeys, writerBindings, errors) {
  const s = /** @type {{ writerId?: string, keyId?: string }} */ (rec.subject);
  const writerId = s.writerId ?? '';
  const keyId = s.keyId ?? '';
  const bindingKey = `${writerId}\0${keyId}`;

  if (revokedKeys.has(keyId)) {
    errors.push({
      recordId: rec.recordId,
      error: `Cannot bind writer to revoked key: ${keyId}`,
    });
    return;
  }

  if (!activeKeys.has(keyId)) {
    errors.push({
      recordId: rec.recordId,
      error: `Cannot bind writer to unknown key: ${keyId}`,
    });
    return;
  }

  writerBindings.set(bindingKey, { keyId, boundAt: rec.issuedAt });
}

/**
 * Processes a WRITER_BIND_REVOKE record, moving a binding from active to revoked.
 *
 * @param {TrustRecord} rec
 * @param {Map<string, {keyId: string, boundAt: string}>} writerBindings
 * @param {Map<string, {keyId: string, revokedAt: string, reasonCode: string}>} revokedBindings
 * @param {Array<{recordId: string, error: string}>} errors
 */
function handleBindRevoke(rec, writerBindings, revokedBindings, errors) {
  const s = /** @type {{ writerId?: string, keyId?: string, reasonCode?: string }} */ (rec.subject);
  const writerId = s.writerId ?? '';
  const keyId = s.keyId ?? '';
  const reasonCode = s.reasonCode ?? '';
  const bindingKey = `${writerId}\0${keyId}`;

  const binding = writerBindings.get(bindingKey);
  if (!binding) {
    errors.push({
      recordId: rec.recordId,
      error: `Cannot revoke non-existent binding: writer=${writerId} key=${keyId}`,
    });
    return;
  }

  writerBindings.delete(bindingKey);
  revokedBindings.set(bindingKey, {
    keyId,
    revokedAt: rec.issuedAt,
    reasonCode,
  });
}
