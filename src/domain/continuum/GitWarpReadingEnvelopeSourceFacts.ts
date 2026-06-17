import ContinuumEvidencePosture from './ContinuumEvidencePosture.ts';
import ContinuumFamilyId from './ContinuumFamilyId.ts';
import ContinuumGeneratedFamilyInventoryEntry from './ContinuumGeneratedFamilyInventoryEntry.ts';
import GitWarpReadingEnvelopePayloadFact from './GitWarpReadingEnvelopePayloadFact.ts';
import WarpError from '../errors/WarpError.ts';

const RUNTIME_BOUNDARY_FAMILY_ID = 'runtime-boundary-family';

export type GitWarpReadingEnvelopeSourceFactsFields = {
  readonly family: ContinuumGeneratedFamilyInventoryEntry;
  readonly evidencePosture: ContinuumEvidencePosture;
  readonly observerPlanId: string;
  readonly observationRequestId: string;
  readonly sourceRef: string;
  readonly basisRef: string;
  readonly payload: GitWarpReadingEnvelopePayloadFact;
  readonly witnessRef: string;
  readonly budgetStatus: string;
};

/** Translated git-warp source facts for a future runtime-boundary reading envelope. */
export default class GitWarpReadingEnvelopeSourceFacts {
  readonly family: ContinuumGeneratedFamilyInventoryEntry;
  readonly evidencePosture: ContinuumEvidencePosture;
  readonly observerPlanId: string;
  readonly observationRequestId: string;
  readonly sourceRef: string;
  readonly basisRef: string;
  readonly payload: GitWarpReadingEnvelopePayloadFact;
  readonly witnessRef: string;
  readonly budgetStatus: string;

  constructor(fields: GitWarpReadingEnvelopeSourceFactsFields) {
    const checkedFields = requireFields(fields);
    this.family = requireRuntimeBoundaryFamily(checkedFields.family);
    this.evidencePosture = requireTranslatedPosture(checkedFields.evidencePosture);
    this.observerPlanId = requireNonEmptyString(checkedFields.observerPlanId, 'observerPlanId');
    this.observationRequestId = requireNonEmptyString(checkedFields.observationRequestId, 'observationRequestId');
    this.sourceRef = requireNonEmptyString(checkedFields.sourceRef, 'sourceRef');
    this.basisRef = requireNonEmptyString(checkedFields.basisRef, 'basisRef');
    this.payload = requirePayload(checkedFields.payload);
    this.witnessRef = requireNonEmptyString(checkedFields.witnessRef, 'witnessRef');
    this.budgetStatus = requireNonEmptyString(checkedFields.budgetStatus, 'budgetStatus');
    Object.freeze(this);
  }

  /** Returns true until runtime-boundary has a generated Wesley profile and fixture. */
  requiresGeneratedProfileBeforeProjection(): boolean {
    return !this.family.isProjectionReady();
  }
}

/** Validates the source-facts constructor envelope. */
function requireFields(
  value: GitWarpReadingEnvelopeSourceFactsFields | null | undefined,
): GitWarpReadingEnvelopeSourceFactsFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpReadingEnvelopeSourceFacts fields must be provided', 'E_VALIDATION');
  }
  return value;
}

/** Requires the runtime-boundary inventory row. */
function requireRuntimeBoundaryFamily(
  value: ContinuumGeneratedFamilyInventoryEntry,
): ContinuumGeneratedFamilyInventoryEntry {
  if (!(value instanceof ContinuumGeneratedFamilyInventoryEntry)) {
    throw new WarpError('family must be a ContinuumGeneratedFamilyInventoryEntry', 'E_VALIDATION');
  }
  if (!value.familyId.equals(new ContinuumFamilyId(RUNTIME_BOUNDARY_FAMILY_ID))) {
    throw new WarpError('reading envelope source facts require runtime-boundary-family', 'E_VALIDATION');
  }
  return value;
}

/** Requires translated git-warp evidence posture. */
function requireTranslatedPosture(value: ContinuumEvidencePosture): ContinuumEvidencePosture {
  if (!(value instanceof ContinuumEvidencePosture)) {
    throw new WarpError('evidencePosture must be a ContinuumEvidencePosture', 'E_VALIDATION');
  }
  const posture = value;
  if (!posture.isTranslatedGitWarpEvidence()) {
    throw new WarpError('reading envelope source facts require translated git-warp evidence', 'E_VALIDATION');
  }
  return posture;
}

/** Validates a reading payload carrier. */
function requirePayload(value: GitWarpReadingEnvelopePayloadFact): GitWarpReadingEnvelopePayloadFact {
  if (!(value instanceof GitWarpReadingEnvelopePayloadFact)) {
    throw new WarpError('payload must be a GitWarpReadingEnvelopePayloadFact', 'E_VALIDATION');
  }
  return value;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
