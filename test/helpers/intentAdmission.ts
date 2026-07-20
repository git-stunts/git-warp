import AdmissionEvaluation from '../../src/domain/admission/AdmissionEvaluation.ts';
import AdmissionObstructionReason from '../../src/domain/admission/AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from '../../src/domain/admission/AdmissionRetryDisposition.ts';
import DerivationWitness from '../../src/domain/admission/DerivationWitness.ts';
import DerivedAdmission from '../../src/domain/admission/DerivedAdmission.ts';
import DerivedIntentAdmissionReceipt from '../../src/domain/admission/DerivedIntentAdmissionReceipt.ts';
import ObstructedAdmission from '../../src/domain/admission/ObstructedAdmission.ts';
import ObstructedIntentAdmissionReceipt from '../../src/domain/admission/ObstructedIntentAdmissionReceipt.ts';
import ObstructionWitness from '../../src/domain/admission/ObstructionWitness.ts';
import { testRetentionWitness } from './storageRetention.ts';

function evaluation(intentId: string): AdmissionEvaluation {
  return new AdmissionEvaluation({
    sourceParticipantId: 'agent-1',
    destinationRuntimeId: 'warp:intent-journal/events/admitted/agent-1',
    sourceBasisRef: `source:${intentId}`,
    destinationBasisRef: 'warp:intent-journal/events/admitted/agent-1/frontier/empty',
    proposalDigest: `proposal:${intentId}`,
    lawDigest: `law:${intentId}`,
    profileDigest: 'profile:test',
    evaluationCoordinateRef: 'warp:intent-journal/events/admitted/agent-1/frontier/empty',
  });
}

export function testDerivedIntentAdmissionReceipt(
  intentId: string,
  publicationRef = `warp:intent-journal/events/admitted/agent-1/publication/${intentId}`
): DerivedIntentAdmissionReceipt {
  const outcome = new DerivedAdmission(
    new DerivationWitness({
      evaluation: evaluation(intentId),
      admittedSuffixRef: publicationRef,
      resultingFrontierRef: `${publicationRef}/frontier`,
      authorityEvidenceRef: 'warp:runtime-writer-binding/agent-1',
      directExtensionEvidenceRef: publicationRef,
    })
  );
  return new DerivedIntentAdmissionReceipt({
    intentId,
    outcome,
    publicationRef,
    retention: testRetentionWitness(publicationRef),
  });
}

export function testObstructedIntentAdmissionReceipt(
  intentId: string,
  code = 'git-warp.test-obstruction'
): ObstructedIntentAdmissionReceipt {
  const outcome = new ObstructedAdmission(
    new ObstructionWitness({
      evaluation: evaluation(intentId),
      reason: AdmissionObstructionReason.lawViolation(code),
      suppliedEvidenceRefs: ['evidence:actual'],
      requiredEvidenceRefs: ['evidence:required'],
      failedConditionRef: 'condition:test',
      retry: AdmissionRetryDisposition.afterChange(),
    })
  );
  return new ObstructedIntentAdmissionReceipt({ intentId, outcome });
}
