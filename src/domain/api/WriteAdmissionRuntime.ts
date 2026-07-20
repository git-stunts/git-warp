import AdmissionClassifier from '../admission/AdmissionClassifier.ts';
import AdmissionEvaluation from '../admission/AdmissionEvaluation.ts';
import type AdmissionObstructionReason from '../admission/AdmissionObstructionReason.ts';
import type AdmissionRetryDisposition from '../admission/AdmissionRetryDisposition.ts';
import DerivationWitness from '../admission/DerivationWitness.ts';
import type DerivedAdmission from '../admission/DerivedAdmission.ts';
import type ObstructedAdmission from '../admission/ObstructedAdmission.ts';
import ObstructionWitness from '../admission/ObstructionWitness.ts';
import type WarpWorldline from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type { PatchBuilderCausalBasis } from '../services/admission/PatchBuilderCausalBasis.ts';
import { missingBoundedBasisCoordinateRef } from '../services/admission/GraphCoordinateRef.ts';
import type { PatchCommitResult } from '../types/PatchCommitResult.ts';
import { canonicalStringify } from '../utils/canonicalStringify.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import type Evidence from './Evidence.ts';
import type Intent from './Intent.ts';
import type { IntentKind } from './Intent.ts';

const classifier = new AdmissionClassifier();
const GRAPH_INTENT_ADMISSION_LAW = 'git-warp:admission-law/graph-intent/v1';
const TIMELINE_WRITE_ADMISSION_PROFILE = 'git-warp:admission-profile/timeline-write/v1';
const BASIS_INDEPENDENT_INTENT_KINDS: ReadonlySet<IntentKind> = new Set(['node.add', 'edge.add']);

type WriteAdmissionFields = {
  readonly runtime: WarpWorldline;
  readonly context: ApiRuntimeContext;
  readonly intent: Intent;
  readonly basis: PatchBuilderCausalBasis;
};

type PreparedWriteAdmissionFields = WriteAdmissionFields & {
  readonly evaluation: AdmissionEvaluation;
};

type ObstructedWriteAdmissionFields = PreparedWriteAdmissionFields & {
  readonly obstruction: WriteObstruction;
  readonly recoveryEvidence: Evidence;
};

export type WriteObstruction = Readonly<{
  reason: AdmissionObstructionReason;
  retry: AdmissionRetryDisposition;
  condition: string;
  requiredEvidence: string;
  destinationHeadSha?: string | null;
}>;

export function createDerivedWriteAdmission(
  fields: PreparedWriteAdmissionFields & { readonly publication: PatchCommitResult }
): DerivedAdmission {
  assertPublishedWriter(fields);
  assertEvaluationMatchesBasis(fields);
  const publicationRef = patchPublicationRef(fields.basis, fields.publication.sha);
  return classifier.classify(
    new DerivationWitness({
      evaluation: fields.evaluation,
      admittedSuffixRef: publicationRef,
      resultingFrontierRef: patchJournalFrontierRef(fields.basis, fields.publication.sha),
      authorityEvidenceRef: runtimeWriterBindingRef(fields.runtime.writerId),
      directExtensionEvidenceRef: publicationRef,
    })
  );
}

export async function createObstructedWriteAdmission(
  fields: ObstructedWriteAdmissionFields
): Promise<ObstructedAdmission> {
  const evaluation = evaluationAtDestination(fields);
  const failedConditionRef = await fields.context.createOpaqueId('admission', [
    'failed-condition',
    fields.obstruction.condition,
    canonicalStringify(fields.intent.descriptor),
  ]);
  const requiredEvidenceRef = await fields.context.createOpaqueId('admission', [
    'required-evidence',
    fields.obstruction.requiredEvidence,
    fields.runtime.worldlineName,
  ]);
  const suppliedEvidenceRefs = [
    evaluation.evaluationCoordinateRef,
    fields.recoveryEvidence.basis.id,
    ...fields.recoveryEvidence.support.map(({ id }) => id),
  ];
  return classifier.classify(
    new ObstructionWitness({
      evaluation,
      reason: fields.obstruction.reason,
      suppliedEvidenceRefs: [...new Set(suppliedEvidenceRefs)],
      requiredEvidenceRefs: [requiredEvidenceRef],
      failedConditionRef,
      retry: fields.obstruction.retry,
    })
  );
}

export async function prepareWriteAdmission(
  fields: WriteAdmissionFields
): Promise<AdmissionEvaluation> {
  assertBasisIdentity(fields);
  const sourceBasisRef = patchJournalFrontierRef(fields.basis, fields.basis.expectedParentSha);
  const [proposalDigest, lawDigest, profileDigest] = await Promise.all([
    fields.context.createOpaqueId('admission', [
      'proposal',
      canonicalStringify(fields.intent.descriptor),
    ]),
    fields.context.createOpaqueId('admission', [
      'law',
      GRAPH_INTENT_ADMISSION_LAW,
      fields.intent.kind,
    ]),
    fields.context.createOpaqueId('admission', ['profile', TIMELINE_WRITE_ADMISSION_PROFILE]),
  ]);
  return new AdmissionEvaluation({
    sourceParticipantId: fields.runtime.writerId,
    destinationRuntimeId: timelineRuntimeRef(fields.basis),
    sourceBasisRef,
    destinationBasisRef: sourceBasisRef,
    proposalDigest,
    lawDigest,
    profileDigest,
    evaluationCoordinateRef: resolveEvaluationCoordinateRef(fields, sourceBasisRef),
  });
}

function resolveEvaluationCoordinateRef(
  fields: WriteAdmissionFields,
  sourceBasisRef: string
): string {
  if (fields.basis.evaluationCoordinateRef !== null) {
    return fields.basis.evaluationCoordinateRef;
  }
  if (BASIS_INDEPENDENT_INTENT_KINDS.has(fields.intent.kind)) {
    return sourceBasisRef;
  }
  return missingBoundedBasisCoordinateRef(fields.runtime.worldlineName);
}

function evaluationAtDestination(fields: ObstructedWriteAdmissionFields): AdmissionEvaluation {
  const { destinationHeadSha } = fields.obstruction;
  if (destinationHeadSha === undefined) {
    return fields.evaluation;
  }
  return new AdmissionEvaluation({
    ...fields.evaluation,
    destinationBasisRef: patchJournalFrontierRef(fields.basis, destinationHeadSha),
  });
}

function assertEvaluationMatchesBasis(fields: PreparedWriteAdmissionFields): void {
  const basisRef = patchJournalFrontierRef(fields.basis, fields.basis.expectedParentSha);
  if (
    fields.evaluation.destinationRuntimeId !== timelineRuntimeRef(fields.basis) ||
    fields.evaluation.sourceBasisRef !== basisRef ||
    fields.evaluation.destinationBasisRef !== basisRef
  ) {
    throw new WarpError(
      'Prepared write admission does not match its publication basis',
      'E_WRITE_ADMISSION_BASIS'
    );
  }
}

function assertPublishedWriter(
  fields: WriteAdmissionFields & { readonly publication: PatchCommitResult }
): void {
  if (fields.publication.patch.writer !== fields.basis.writerId) {
    throw new WarpError(
      'Published patch writer does not match its captured admission basis',
      'E_WRITE_ADMISSION_PUBLICATION'
    );
  }
}

function assertBasisIdentity(fields: WriteAdmissionFields): void {
  if (
    fields.basis.graphName !== fields.runtime.worldlineName ||
    fields.basis.participantId !== fields.runtime.writerId
  ) {
    throw new WarpError(
      'Write admission basis does not belong to the target timeline writer',
      'E_WRITE_ADMISSION_BASIS'
    );
  }
}

function patchJournalRuntimeRef(basis: PatchBuilderCausalBasis): string {
  return `warp:patch-journal/${patchJournalIdentityPath(basis)}`;
}

function timelineRuntimeRef(basis: PatchBuilderCausalBasis): string {
  return `warp:timeline-runtime/${[basis.graphName, basis.participantId]
    .map((value) => encodeURIComponent(value))
    .join('/')}`;
}

function patchJournalFrontierRef(basis: PatchBuilderCausalBasis, commitId: string | null): string {
  return `${patchJournalRuntimeRef(basis)}/frontier/${
    commitId === null ? 'empty' : encodeURIComponent(commitId)
  }`;
}

function patchPublicationRef(basis: PatchBuilderCausalBasis, commitId: string): string {
  return `${patchJournalRuntimeRef(basis)}/publication/${encodeURIComponent(commitId)}`;
}

function patchJournalIdentityPath(basis: PatchBuilderCausalBasis): string {
  return [basis.graphName, basis.writerId].map((value) => encodeURIComponent(value)).join('/');
}

function runtimeWriterBindingRef(writerId: string): string {
  return `warp:runtime-writer-binding/${encodeURIComponent(writerId)}`;
}
