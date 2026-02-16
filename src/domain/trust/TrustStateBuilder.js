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
 * @typedef {Object} TrustState
 * @property {Map<string, {publicKey: string, addedAt: string}>} activeKeys - keyId → key info
 * @property {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @property {Map<string, {keyId: string, boundAt: string}>} writerBindings - "writerId\0keyId" → binding
 * @property {Map<string, {keyId: string, revokedAt: string, reasonCode: string}>} revokedBindings
 * @property {Array<{recordId: string, error: string}>} errors
 * @property {number} recordsProcessed - Total number of records fed to the builder
 */

/**
 * Builds trust state from an ordered sequence of trust records.
 *
 * Records MUST be in chain order (oldest first). The builder enforces:
 * - Monotonic revocation: once a key is revoked, it cannot be re-added
 * - Binding validity: WRITER_BIND_ADD requires the referenced key to be active
 * - Schema validation: each record is validated against TrustRecordSchema
 *
 * @param {Array<Record<string, *>>} records - Trust records in chain order
 * @returns {TrustState} Frozen trust state
 */
export function buildState(records) {
  /** @type {Map<string, {publicKey: string, addedAt: string}>} */
  const activeKeys = new Map();
  /** @type {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} */
  const revokedKeys = new Map();
  /** @type {Map<string, {keyId: string, boundAt: string}>} */
  const writerBindings = new Map();
  /** @type {Map<string, {keyId: string, revokedAt: string, reasonCode: string}>} */
  const revokedBindings = new Map();
  /** @type {Array<{recordId: string, error: string}>} */
  const errors = [];

  for (const record of records) {
    const parsed = TrustRecordSchema.safeParse(record);
    if (!parsed.success) {
      errors.push({
        recordId: record.recordId ?? '(unknown)',
        error: `Schema validation failed: ${parsed.error.message}`,
      });
      continue;
    }

    const rec = parsed.data;
    processRecord(rec, activeKeys, revokedKeys, writerBindings, revokedBindings, errors);
  }

  return Object.freeze({ activeKeys, revokedKeys, writerBindings, revokedBindings, errors, recordsProcessed: records.length });
}

/**
 * @param {*} rec
 * @param {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @param {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @param {Map<string, {keyId: string, boundAt: string}>} writerBindings
 * @param {Map<string, {keyId: string, revokedAt: string, reasonCode: string}>} revokedBindings
 * @param {Array<{recordId: string, error: string}>} errors
 */
function processRecord(rec, activeKeys, revokedKeys, writerBindings, revokedBindings, errors) {
  switch (rec.recordType) {
    case 'KEY_ADD':
      handleKeyAdd(rec, activeKeys, revokedKeys, errors);
      break;
    case 'KEY_REVOKE':
      handleKeyRevoke(rec, activeKeys, revokedKeys, errors);
      break;
    case 'WRITER_BIND_ADD':
      handleBindAdd(rec, activeKeys, revokedKeys, writerBindings, errors);
      break;
    case 'WRITER_BIND_REVOKE':
      handleBindRevoke(rec, writerBindings, revokedBindings, errors);
      break;
    default:
      errors.push({ recordId: rec.recordId, error: `Unknown recordType: ${rec.recordType}` });
  }
}

/**
 * @param {*} rec
 * @param {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @param {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @param {Array<{recordId: string, error: string}>} errors
 */
function handleKeyAdd(rec, activeKeys, revokedKeys, errors) {
  const { keyId, publicKey } = rec.subject;

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
 * @param {*} rec
 * @param {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @param {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @param {Array<{recordId: string, error: string}>} errors
 */
function handleKeyRevoke(rec, activeKeys, revokedKeys, errors) {
  const { keyId, reasonCode } = rec.subject;

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
 * @param {*} rec
 * @param {Map<string, {publicKey: string, addedAt: string}>} activeKeys
 * @param {Map<string, {publicKey: string, revokedAt: string, reasonCode: string}>} revokedKeys
 * @param {Map<string, {keyId: string, boundAt: string}>} writerBindings
 * @param {Array<{recordId: string, error: string}>} errors
 */
function handleBindAdd(rec, activeKeys, revokedKeys, writerBindings, errors) {
  const { writerId, keyId } = rec.subject;
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
 * @param {*} rec
 * @param {Map<string, {keyId: string, boundAt: string}>} writerBindings
 * @param {Map<string, {keyId: string, revokedAt: string, reasonCode: string}>} revokedBindings
 * @param {Array<{recordId: string, error: string}>} errors
 */
function handleBindRevoke(rec, writerBindings, revokedBindings, errors) {
  const { writerId, keyId, reasonCode } = rec.subject;
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
