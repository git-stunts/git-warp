import AdmissionClassifier from '../../admission/AdmissionClassifier.ts';
import AdmissionEvaluation from '../../admission/AdmissionEvaluation.ts';
import type AdmissionObstructionReason from '../../admission/AdmissionObstructionReason.ts';
import type AdmissionRetryDisposition from '../../admission/AdmissionRetryDisposition.ts';
import DerivationWitness from '../../admission/DerivationWitness.ts';
import DerivedIntentAdmissionReceipt from '../../admission/DerivedIntentAdmissionReceipt.ts';
import ObstructedIntentAdmissionReceipt from '../../admission/ObstructedIntentAdmissionReceipt.ts';
import ObstructionWitness from '../../admission/ObstructionWitness.ts';
import type { WarpIntentDescriptor } from '../../types/WarpIntentDescriptor.ts';
import type { IntentChannel, PublishedIntent } from '../../../ports/IntentStorePort.ts';

const classifier = new AdmissionClassifier();

export type IntentAdmissionIdentity = {
  readonly descriptor: WarpIntentDescriptor;
  readonly graphName: string;
  readonly writerId: string;
  readonly channel: IntentChannel;
  readonly ownerId: string;
};

export function createDerivedIntentAdmissionReceipt(
  identity: IntentAdmissionIdentity,
  publication: PublishedIntent
): DerivedIntentAdmissionReceipt {
  const evaluation = createIntentAdmissionEvaluation(identity, publication.basisRef);
  const witness = new DerivationWitness({
    evaluation,
    admittedSuffixRef: publication.publicationRef,
    resultingFrontierRef: publication.resultingFrontierRef,
    authorityEvidenceRef: runtimeWriterBindingRef(identity.writerId),
    directExtensionEvidenceRef: publication.publicationRef,
  });
  return new DerivedIntentAdmissionReceipt({
    intentId: identity.descriptor.intentId,
    outcome: classifier.classify(witness),
    publicationRef: publication.publicationRef,
    retention: publication.retention,
  });
}

export function createObstructedIntentAdmissionReceipt(
  identity: IntentAdmissionIdentity,
  fields: {
    readonly destinationBasisRef: string;
    readonly reason: AdmissionObstructionReason;
    readonly suppliedEvidenceRefs: readonly string[];
    readonly requiredEvidenceRefs: readonly string[];
    readonly failedConditionRef: string;
    readonly retry: AdmissionRetryDisposition;
  }
): ObstructedIntentAdmissionReceipt {
  const witness = new ObstructionWitness({
    evaluation: createIntentAdmissionEvaluation(identity, fields.destinationBasisRef),
    reason: fields.reason,
    suppliedEvidenceRefs: fields.suppliedEvidenceRefs,
    requiredEvidenceRefs: fields.requiredEvidenceRefs,
    failedConditionRef: fields.failedConditionRef,
    retry: fields.retry,
  });
  return new ObstructedIntentAdmissionReceipt({
    intentId: identity.descriptor.intentId,
    outcome: classifier.classify(witness),
  });
}

export function createIntentAdmissionEvaluation(
  identity: IntentAdmissionIdentity,
  destinationBasisRef: string
): AdmissionEvaluation {
  return new AdmissionEvaluation({
    sourceParticipantId: identity.writerId,
    destinationRuntimeId: intentJournalRuntimeRef(identity),
    sourceBasisRef: destinationBasisRef,
    destinationBasisRef,
    proposalDigest: identity.descriptor.nutritionLabel.bundleHash,
    lawDigest: identity.descriptor.nutritionLabel.coreHash,
    profileDigest: identity.descriptor.nutritionLabel.profile,
    evaluationCoordinateRef: destinationBasisRef,
  });
}

function intentJournalRuntimeRef(identity: IntentAdmissionIdentity): string {
  const identityPath = [identity.graphName, identity.channel, identity.ownerId]
    .map((value) => encodeURIComponent(value))
    .join('/');
  return `warp:intent-journal/${identityPath}`;
}

function runtimeWriterBindingRef(writerId: string): string {
  return `warp:runtime-writer-binding/${encodeURIComponent(writerId)}`;
}
