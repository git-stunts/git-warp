/**
 * Trust V1 assessment — frozen result of evaluating writer trust.
 *
 * The verdict is derived at construction and immutable. The assessment
 * captures a complete snapshot of the evaluation: which writers were
 * checked, why each passed or failed, and the evidence summary.
 *
 * @module domain/trust/TrustAssessment
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 12
 */

import type { TrustVerdict, VerdictInput } from './verdict.ts';
import type { TrustExplanation, EvidenceSummary } from './schemas.ts';
import { deriveTrustVerdict } from './verdict.ts';

// -- Trust status types -------------------------------------------------------

type TrustStatus = 'configured' | 'pinned' | 'error' | 'not_configured';
type TrustSource = 'ref' | 'cli_pin' | 'env_pin' | 'none';

// -- Trust detail (the `trust` field of the assessment) -----------------------

type TrustDetail = {
  readonly status: TrustStatus;
  readonly source: TrustSource;
  readonly sourceDetail: string | null;
  readonly evaluatedWriters: readonly string[];
  readonly untrustedWriters: readonly string[];
  readonly explanations: readonly Readonly<TrustExplanation>[];
  readonly evidenceSummary: Readonly<EvidenceSummary>;
};

// -- TrustAssessment class ----------------------------------------------------

class TrustAssessment {
  readonly trustSchemaVersion: 1 = 1;
  readonly mode: 'signed_evidence_v1' = 'signed_evidence_v1';
  readonly trustVerdict: TrustVerdict;
  readonly trust: Readonly<TrustDetail>;

  constructor(detail: TrustDetail) {
    const input: VerdictInput = {
      status: detail.status,
      untrustedWriters: detail.untrustedWriters,
    };
    this.trustVerdict = deriveTrustVerdict(input);
    this.trust = Object.freeze(detail);
    Object.freeze(this);
  }
}

export { TrustAssessment };
export type { TrustDetail, TrustStatus, TrustSource };
