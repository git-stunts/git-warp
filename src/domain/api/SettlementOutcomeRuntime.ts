import AdmissionClassifier from '../admission/AdmissionClassifier.ts';
import AdmissionEvaluation from '../admission/AdmissionEvaluation.ts';
import AdmissionObstructionReason from '../admission/AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from '../admission/AdmissionRetryDisposition.ts';
import DerivationWitness from '../admission/DerivationWitness.ts';
import ObstructionWitness from '../admission/ObstructionWitness.ts';
import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import { projectAdmissionOutcome } from './AdmissionOutcomeRuntime.ts';

const classifier = new AdmissionClassifier();

export type SettlementOutcomeFields = Readonly<{
  readonly lawDigest: string;
  readonly planDigest: string;
  readonly policyDigest: string;
  readonly proposalDigest: string;
  readonly sourceFrontierRef: string;
  readonly sourceLaneId: string;
  readonly targetFrontierRef: string;
  readonly targetLaneId: string;
}>;

export function createDerivedSettlementOutcome(
  fields: SettlementOutcomeFields,
): AdmissionOutcome {
  const evaluation = createEvaluation(fields);
  return projectAdmissionOutcome(
    classifier.classify(new DerivationWitness({
      evaluation,
      admittedSuffixRef: fields.proposalDigest,
      resultingFrontierRef: fields.planDigest,
      authorityEvidenceRef: fields.policyDigest,
      directExtensionEvidenceRef: fields.proposalDigest,
    })),
    Object.freeze({ id: fields.targetFrontierRef }),
  );
}

export function createSettlementObstruction(
  fields: SettlementOutcomeFields,
  obstruction: Readonly<{
    readonly code: string;
    readonly family: 'invalid-derivation' | 'stale-basis' | 'unsupported-contract';
    readonly suppliedEvidenceRefs: readonly string[];
    readonly requiredEvidenceRefs: readonly string[];
  }>,
): AdmissionOutcome {
  const reason = new AdmissionObstructionReason(
    obstruction.family,
    obstruction.code,
  );
  return projectAdmissionOutcome(
    classifier.classify(new ObstructionWitness({
      evaluation: createEvaluation(fields),
      reason,
      suppliedEvidenceRefs: obstruction.suppliedEvidenceRefs,
      requiredEvidenceRefs: obstruction.requiredEvidenceRefs,
      failedConditionRef: `${fields.planDigest}/condition/${obstruction.family}`,
      retry: obstruction.family === 'invalid-derivation'
        ? AdmissionRetryDisposition.withEvidence()
        : AdmissionRetryDisposition.afterChange(),
    })),
    Object.freeze({ id: fields.targetFrontierRef }),
  );
}

function createEvaluation(
  fields: SettlementOutcomeFields,
): AdmissionEvaluation {
  return new AdmissionEvaluation({
    sourceParticipantId: fields.sourceLaneId,
    destinationRuntimeId: fields.targetLaneId,
    sourceBasisRef: fields.sourceFrontierRef,
    destinationBasisRef: fields.targetFrontierRef,
    proposalDigest: fields.proposalDigest,
    lawDigest: fields.lawDigest,
    profileDigest: fields.policyDigest,
    evaluationCoordinateRef: fields.targetFrontierRef,
  });
}
