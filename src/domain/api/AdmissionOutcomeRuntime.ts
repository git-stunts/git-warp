import type DomainAdmissionEvaluation from '../admission/AdmissionEvaluation.ts';
import type { AdmissionOutcome as DomainAdmissionOutcome } from '../admission/AdmissionOutcome.ts';
import type ConflictAdmission from '../admission/ConflictAdmission.ts';
import type DerivedAdmission from '../admission/DerivedAdmission.ts';
import matchAdmission from '../admission/matchAdmission.ts';
import type ObstructedAdmission from '../admission/ObstructedAdmission.ts';
import type PluralAdmission from '../admission/PluralAdmission.ts';
import WarpError from '../errors/WarpError.ts';
import type {
  AdmissionEvaluation,
  AdmissionOutcome,
  ConflictAdmission as PublicConflictAdmission,
  DerivedAdmission as PublicDerivedAdmission,
  ObstructedAdmission as PublicObstructedAdmission,
  PluralAdmission as PublicPluralAdmission,
} from './AdmissionOutcome.ts';
import type { EvidenceHandle } from './Evidence.ts';

const ISSUED_OUTCOMES = new WeakSet<object>();

type ProjectionSession = {
  readonly basis: EvidenceHandle;
  readonly handles: Map<string, EvidenceHandle>;
};

export function projectAdmissionOutcome(
  outcome: DomainAdmissionOutcome,
  basis: EvidenceHandle
): AdmissionOutcome {
  const session = createProjectionSession(basis);
  const projected = matchAdmission<AdmissionOutcome>(outcome, {
    derived: (value) => projectDerivedAdmission(session, value),
    plural: (value) => projectPluralAdmission(session, value),
    conflict: (value) => projectConflictAdmission(session, value),
    obstruction: (value) => projectObstructedAdmission(session, value),
  });
  ISSUED_OUTCOMES.add(projected);
  return projected;
}

export function requireAdmissionOutcome(outcome: AdmissionOutcome): void {
  if (typeof outcome !== 'object' || outcome === null || !ISSUED_OUTCOMES.has(outcome)) {
    throw new WarpError('outcome must be an AdmissionOutcome', 'E_VALIDATION');
  }
}

function createProjectionSession(basis: EvidenceHandle): ProjectionSession {
  if (
    typeof basis !== 'object' ||
    basis === null ||
    typeof basis.id !== 'string' ||
    basis.id.length === 0
  ) {
    throw new WarpError('projection basis must be an evidence handle', 'E_VALIDATION');
  }
  return { basis, handles: new Map() };
}

function projectDerivedAdmission(
  session: ProjectionSession,
  outcome: DerivedAdmission
): PublicDerivedAdmission {
  const { witness } = outcome;
  const evaluation = projectEvaluation(session, witness.evaluation);
  const admittedSuffix = handle(session, witness.admittedSuffixRef);
  const resultingFrontier = handle(session, witness.resultingFrontierRef);
  const authorityEvidence = handle(session, witness.authorityEvidenceRef);
  const directExtensionEvidence = handle(session, witness.directExtensionEvidenceRef);
  return Object.freeze({
    kind: outcome.kind,
    witness: Object.freeze({
      evaluation,
      admittedSuffix,
      resultingFrontier,
      authorityEvidence,
      directExtensionEvidence,
    }),
    residual: Object.freeze({ kind: outcome.residual.kind, frontier: resultingFrontier }),
  });
}

function projectPluralAdmission(
  session: ProjectionSession,
  outcome: PluralAdmission
): PublicPluralAdmission {
  const { witness } = outcome;
  const retainedCoordinates = handles(session, witness.retainedCoordinateRefs);
  return Object.freeze({
    kind: outcome.kind,
    witness: Object.freeze({
      evaluation: projectEvaluation(session, witness.evaluation),
      localCoordinate: handle(session, witness.localCoordinateRef),
      incomingCoordinate: handle(session, witness.incomingCoordinateRef),
      retainedCoordinates,
      derivationEvidence: handle(session, witness.derivationEvidenceRef),
      footprintComparison: handle(session, witness.footprintComparisonRef),
      concurrencyEvidence: handle(session, witness.concurrencyEvidenceRef),
      nonInterferenceEvidence: handle(session, witness.nonInterferenceEvidenceRef),
    }),
    residual: Object.freeze({ kind: outcome.residual.kind, coordinates: retainedCoordinates }),
  });
}

function projectConflictAdmission(
  session: ProjectionSession,
  outcome: ConflictAdmission
): PublicConflictAdmission {
  const { witness } = outcome;
  const conflict = handle(session, witness.conflictRef);
  return Object.freeze({
    kind: outcome.kind,
    witness: Object.freeze({
      evaluation: projectEvaluation(session, witness.evaluation),
      conflict,
      claims: handles(session, witness.claimRefs),
      overlappingFootprints: handles(session, witness.overlappingFootprintRefs),
      contestedDomain: witness.contestedDomain,
      derivationEvidence: handle(session, witness.derivationEvidenceRef),
      overlapEvidence: handle(session, witness.overlapEvidenceRef),
      resolutionProcedures: handles(session, witness.resolutionProcedureRefs),
    }),
    residual: Object.freeze({ kind: outcome.residual.kind, conflict }),
  });
}

function projectObstructedAdmission(
  session: ProjectionSession,
  outcome: ObstructedAdmission
): PublicObstructedAdmission {
  const { witness } = outcome;
  return Object.freeze({
    kind: outcome.kind,
    witness: Object.freeze({
      evaluation: projectEvaluation(session, witness.evaluation),
      reason: Object.freeze({ ...witness.reason }),
      suppliedEvidence: handles(session, witness.suppliedEvidenceRefs),
      requiredEvidence: handles(session, witness.requiredEvidenceRefs),
      failedCondition: handle(session, witness.failedConditionRef),
      retry: Object.freeze({ disposition: witness.retry.value }),
    }),
    residual: Object.freeze({
      kind: outcome.residual.kind,
      frontier: handle(session, outcome.residual.frontierRef),
    }),
  });
}

function projectEvaluation(
  session: ProjectionSession,
  evaluation: DomainAdmissionEvaluation
): AdmissionEvaluation {
  return Object.freeze({
    sourceParticipant: evaluation.sourceParticipantId,
    destinationRuntime: evaluation.destinationRuntimeId,
    sourceBasis: handle(session, evaluation.sourceBasisRef),
    destinationBasis: handle(session, evaluation.destinationBasisRef),
    proposal: handle(session, evaluation.proposalDigest),
    law: handle(session, evaluation.lawDigest),
    profile: handle(session, evaluation.profileDigest),
    coordinate: handle(session, evaluation.evaluationCoordinateRef),
  });
}

function handles(session: ProjectionSession, values: readonly string[]): readonly EvidenceHandle[] {
  return Object.freeze(values.map((value) => handle(session, value)));
}

function handle(session: ProjectionSession, reference: string): EvidenceHandle {
  const existing = session.handles.get(reference);
  if (existing !== undefined) {
    return existing;
  }
  const projected = Object.freeze({
    id: `${session.basis.id}/admission/${session.handles.size}`,
  });
  session.handles.set(reference, projected);
  return projected;
}
