/**
 * Trust V1 evaluator.
 *
 * Pure function that evaluates writer trust status against a built
 * trust state and policy configuration. No I/O, no side effects.
 *
 * @module domain/trust/TrustEvaluator
 * @see docs/specs/TRUST_CRYPTO_ALGORITHM.md Section 12
 */

import { TrustPolicySchema, type TrustExplanation, type EvidenceSummary, type TrustPolicy } from './schemas.ts';
import { TRUST_REASON_CODES } from './reasonCodes.ts';
import { TrustAssessment, type TrustDetail, type TrustSource } from './TrustAssessment.ts';
import type { TrustState } from './TrustStateBuilder.ts';

// -- Evidence summary builder -------------------------------------------------

function buildEvidenceSummary(state: TrustState): EvidenceSummary {
  return Object.freeze({
    recordsScanned: state.recordsProcessed,
    activeKeys: state.activeKeys.size,
    revokedKeys: state.revokedKeys.size,
    activeBindings: state.writerBindings.size,
    revokedBindings: state.revokedBindings.size,
  });
}

// -- Single-writer evaluation -------------------------------------------------

function evaluateSingleWriter(
  writerId: string,
  state: TrustState,
): TrustExplanation {
  const activeKeyIds = state.getBindingsForWriter(writerId).map((binding) => binding.keyId);

  if (activeKeyIds.length === 0) {
    const revoked = state.hasRevokedBindingsForWriter(writerId);
    return {
      writerId,
      trusted: false,
      reasonCode: revoked
        ? TRUST_REASON_CODES.BINDING_REVOKED
        : TRUST_REASON_CODES.WRITER_HAS_NO_ACTIVE_BINDING,
      reason: revoked
        ? `Writer '${writerId}' has no active bindings (all revoked)`
        : `Writer '${writerId}' has no active bindings`,
    };
  }

  for (const keyId of activeKeyIds) {
    if (state.hasActiveKey(keyId)) {
      return {
        writerId,
        trusted: true,
        reasonCode: TRUST_REASON_CODES.WRITER_BOUND_TO_ACTIVE_KEY,
        reason: `Writer '${writerId}' is bound to active key ${keyId}`,
      };
    }
  }

  return {
    writerId,
    trusted: false,
    reasonCode: TRUST_REASON_CODES.WRITER_BOUND_KEY_REVOKED,
    reason: `Writer '${writerId}' is bound only to revoked keys`,
  };
}

// -- Assessment factory (DRY: one builder, not three) -------------------------

function buildDetail(params: {
  readonly status: TrustDetail['status'];
  readonly source: TrustSource;
  readonly writers: readonly string[];
  readonly untrustedWriters: readonly string[];
  readonly explanations: readonly TrustExplanation[];
  readonly evidenceSummary: EvidenceSummary;
}): TrustDetail {
  return {
    status: params.status,
    source: params.source,
    sourceDetail: null,
    evaluatedWriters: params.writers,
    untrustedWriters: params.untrustedWriters,
    explanations: params.explanations.map((e) => Object.freeze(e)),
    evidenceSummary: params.evidenceSummary,
  };
}

function failAll(
  writers: readonly string[],
  reasonCode: string,
  reason: string,
): TrustExplanation[] {
  if (writers.length === 0) {
    return [{ writerId: '*', trusted: false, reasonCode, reason }];
  }
  return writers.map((writerId) => ({
    writerId, trusted: false, reasonCode, reason,
  }));
}

// -- Public entry point -------------------------------------------------------

/**
 * Evaluates trust status for a set of writers against the current trust state.
 */
function evaluateWriters(
  writerIds: readonly string[],
  trustState: TrustState,
  policy: TrustPolicy,
): TrustAssessment {
  const sorted = [...writerIds].sort();

  const policyResult = TrustPolicySchema.safeParse(policy);
  if (!policyResult.success) {
    return new TrustAssessment(buildDetail({
      status: 'error',
      source: 'none',
      writers: sorted,
      untrustedWriters: sorted,
      explanations: failAll(
        sorted,
        TRUST_REASON_CODES.TRUST_POLICY_INVALID,
        `Policy validation failed: ${TRUST_REASON_CODES.TRUST_POLICY_INVALID}`,
      ),
      evidenceSummary: {
        recordsScanned: 0,
        activeKeys: 0,
        revokedKeys: 0,
        activeBindings: 0,
        revokedBindings: 0,
      },
    }));
  }

  if (trustState.errors.length > 0) {
    const firstError = trustState.errors[0]?.error ?? 'Invalid trust evidence';
    return new TrustAssessment(buildDetail({
      status: 'error',
      source: 'ref',
      writers: sorted,
      untrustedWriters: sorted,
      explanations: failAll(
        sorted,
        TRUST_REASON_CODES.TRUST_RECORD_CHAIN_INVALID,
        `Trust evidence invalid: ${firstError}`,
      ),
      evidenceSummary: buildEvidenceSummary(trustState),
    }));
  }

  const explanations = sorted.map((w) => evaluateSingleWriter(w, trustState));
  const untrusted = explanations.filter((e) => !e.trusted).map((e) => e.writerId);

  return new TrustAssessment(buildDetail({
    status: 'configured',
    source: 'ref',
    writers: sorted,
    untrustedWriters: untrusted,
    explanations,
    evidenceSummary: buildEvidenceSummary(trustState),
  }));
}

export { evaluateWriters };
