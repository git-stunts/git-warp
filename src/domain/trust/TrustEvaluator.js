/**
 * Trust V1 evaluator.
 *
 * Pure function that evaluates writer trust status against a built
 * trust state and policy configuration. No I/O, no side effects.
 *
 * @module domain/trust/TrustEvaluator
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 12
 */

import { TrustPolicySchema } from './schemas.js';
import { TRUST_REASON_CODES } from './reasonCodes.js';
import { deriveTrustVerdict } from './verdict.js';

/**
 * @typedef {{
 *   TRUST_POLICY_INVALID: string,
 *   TRUST_RECORD_CHAIN_INVALID: string,
 *   BINDING_REVOKED: string,
 *   WRITER_HAS_NO_ACTIVE_BINDING: string,
 *   WRITER_BOUND_TO_ACTIVE_KEY: string,
 *   WRITER_BOUND_KEY_REVOKED: string,
 * }} TrustReasonCodesShape
 */

/** @type {TrustReasonCodesShape} */
const RC = /** @type {TrustReasonCodesShape} */ (TRUST_REASON_CODES);

/**
 * @typedef {import('./TrustStateBuilder.js').TrustState} TrustState
 */

/**
 * @typedef {Object} TrustAssessment
 * @property {number} trustSchemaVersion
 * @property {string} mode
 * @property {string} trustVerdict
 * @property {{ status: 'configured'|'pinned'|'error'|'not_configured', source: string, sourceDetail: string|null, evaluatedWriters: string[], untrustedWriters: string[], explanations: ReadonlyArray<{writerId: string, trusted: boolean, reasonCode: string, reason: string}>, evidenceSummary: Record<string, number> & {recordsScanned: number, activeKeys: number, revokedKeys: number, activeBindings: number, revokedBindings: number} }} trust
 */

/**
 * Evaluates trust status for a set of writers against the current trust state.
 *
 * For each writer (sorted deterministically), checks:
 * 1. Whether any active binding exists for that writer
 * 2. Whether the bound key is still active (not revoked)
 *
 * @param {string[]} writerIds - Writer IDs to evaluate
 * @param {TrustState} trustState - Built trust state from TrustStateBuilder
 * @param {Record<string, unknown>} policy - Trust policy configuration
 * @returns {TrustAssessment} Frozen TrustAssessment object
 */
export function evaluateWriters(writerIds, trustState, policy) {
  const policyResult = TrustPolicySchema.safeParse(policy);
  if (!policyResult.success) {
    return buildErrorAssessment(writerIds, RC.TRUST_POLICY_INVALID);
  }

  if (trustState.errors.length > 0) {
    return buildTrustStateErrorAssessment(writerIds, trustState);
  }

  const sortedWriters = [...writerIds].sort();
  const explanations = sortedWriters.map((writerId) =>
    evaluateSingleWriter(writerId, trustState),
  );

  const untrustedWriters = explanations
    .filter((e) => !e.trusted)
    .map((e) => e.writerId);

  const trust = {
    status: /** @type {'configured'|'pinned'|'error'|'not_configured'} */ ('configured'),
    source: 'ref',
    sourceDetail: null,
    evaluatedWriters: sortedWriters,
    untrustedWriters,
    explanations: explanations.map((e) => Object.freeze(e)),
    evidenceSummary: buildEvidenceSummary(trustState),
  };

  const trustVerdict = deriveTrustVerdict(trust);

  return Object.freeze({
    trustSchemaVersion: 1,
    mode: 'signed_evidence_v1',
    trustVerdict,
    trust: Object.freeze(trust),
  });
}

/**
 * Builds an error assessment when trust evidence is structurally or
 * cryptographically invalid.
 *
 * @param {string[]} writerIds
 * @param {TrustState} trustState
 * @returns {TrustAssessment}
 */
function buildTrustStateErrorAssessment(writerIds, trustState) {
  const sortedWriters = [...writerIds].sort();
  const firstError = trustState.errors[0]?.error || 'Invalid trust evidence';
  const trust = {
    status: /** @type {'configured'|'pinned'|'error'|'not_configured'} */ ('error'),
    source: 'ref',
    sourceDetail: null,
    evaluatedWriters: sortedWriters,
    untrustedWriters: sortedWriters,
    explanations: sortedWriters.length > 0
      ? sortedWriters.map((writerId) => Object.freeze({
        writerId,
        trusted: false,
        reasonCode: RC.TRUST_RECORD_CHAIN_INVALID,
        reason: `Trust evidence invalid: ${firstError}`,
      }))
      : [Object.freeze({
        writerId: '*',
        trusted: false,
        reasonCode: RC.TRUST_RECORD_CHAIN_INVALID,
        reason: `Trust evidence invalid: ${firstError}`,
      })],
    evidenceSummary: buildEvidenceSummary(trustState),
  };

  return /** @type {TrustAssessment} */ (Object.freeze({
    trustSchemaVersion: 1,
    mode: 'signed_evidence_v1',
    trustVerdict: deriveTrustVerdict(trust),
    trust: Object.freeze(trust),
  }));
}

/**
 * Evaluates trust for a single writer.
 *
 * @param {string} writerId
 * @param {TrustState} trustState
 * @returns {{writerId: string, trusted: boolean, reasonCode: string, reason: string}}
 */
function evaluateSingleWriter(writerId, trustState) {
  // Check all bindings for this writer
  const activeBindingKeys = [];
  for (const [bindingKey, binding] of trustState.writerBindings) {
    if (bindingKey.startsWith(`${writerId}\0`)) {
      activeBindingKeys.push({ bindingKey, keyId: binding.keyId });
    }
  }

  // Check revoked bindings too (for reason code accuracy)
  let hasRevokedBinding = false;
  for (const bindingKey of trustState.revokedBindings.keys()) {
    if (bindingKey.startsWith(`${writerId}\0`)) {
      hasRevokedBinding = true;
    }
  }

  if (activeBindingKeys.length === 0) {
    if (hasRevokedBinding) {
      return {
        writerId,
        trusted: false,
        reasonCode: RC.BINDING_REVOKED,
        reason: `Writer '${writerId}' has no active bindings (all revoked)`,
      };
    }
    return {
      writerId,
      trusted: false,
      reasonCode: RC.WRITER_HAS_NO_ACTIVE_BINDING,
      reason: `Writer '${writerId}' has no active bindings`,
    };
  }

  // Check if any active binding points to an active key
  for (const { keyId } of activeBindingKeys) {
    if (trustState.activeKeys.has(keyId)) {
      return {
        writerId,
        trusted: true,
        reasonCode: RC.WRITER_BOUND_TO_ACTIVE_KEY,
        reason: `Writer '${writerId}' is bound to active key ${keyId}`,
      };
    }
  }

  // All bindings point to revoked keys
  return {
    writerId,
    trusted: false,
    reasonCode: RC.WRITER_BOUND_KEY_REVOKED,
    reason: `Writer '${writerId}' is bound only to revoked keys`,
  };
}

/**
 * Builds an error assessment when policy validation fails.
 *
 * @param {string[]} writerIds
 * @param {string} reasonCode
 * @returns {TrustAssessment}
 */
function buildErrorAssessment(writerIds, reasonCode) {
  const sortedWriters = [...writerIds].sort();
  const trust = {
    status: /** @type {'configured'|'pinned'|'error'|'not_configured'} */ ('error'),
    source: 'none',
    sourceDetail: null,
    evaluatedWriters: sortedWriters,
    untrustedWriters: sortedWriters,
    explanations: sortedWriters.map((writerId) => Object.freeze({
      writerId,
      trusted: false,
      reasonCode,
      reason: `Policy validation failed: ${reasonCode}`,
    })),
    evidenceSummary: {
      recordsScanned: 0,
      activeKeys: 0,
      revokedKeys: 0,
      activeBindings: 0,
      revokedBindings: 0,
    },
  };

  return Object.freeze({
    trustSchemaVersion: 1,
    mode: 'signed_evidence_v1',
    trustVerdict: deriveTrustVerdict(trust),
    trust: Object.freeze(trust),
  });
}

/**
 * Builds the evidence summary from trust state.
 *
 * @param {TrustState} trustState
 * @returns {{recordsScanned: number, activeKeys: number, revokedKeys: number, activeBindings: number, revokedBindings: number}}
 */
function buildEvidenceSummary(trustState) {
  return Object.freeze({
    recordsScanned: trustState.recordsProcessed,
    activeKeys: trustState.activeKeys.size,
    revokedKeys: trustState.revokedKeys.size,
    activeBindings: trustState.writerBindings.size,
    revokedBindings: trustState.revokedBindings.size,
  });
}
