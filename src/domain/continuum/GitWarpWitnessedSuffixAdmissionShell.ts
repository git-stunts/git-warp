import GitWarpSuffixTransformHologram from './GitWarpSuffixTransformHologram.ts';
import GitWarpWitnessedSuffixAdmissionOutcome from './GitWarpWitnessedSuffixAdmissionOutcome.ts';
import GitWarpWitnessedSuffixSourceFacts from './GitWarpWitnessedSuffixSourceFacts.ts';
import WarpError from '../errors/WarpError.ts';
import type WarpState from '../services/state/WarpState.ts';

export type GitWarpWitnessedSuffixAdmissionShellFields = {
  readonly laneId: string;
  readonly transportedSiteRef: string;
  readonly admissionLawId: string;
  readonly outcome: GitWarpWitnessedSuffixAdmissionOutcome;
  readonly sourceFacts: GitWarpWitnessedSuffixSourceFacts;
  readonly hologram: GitWarpSuffixTransformHologram;
};

/** Observer-readable shell for importing a witnessed git-warp suffix. */
export default class GitWarpWitnessedSuffixAdmissionShell {
  readonly graphName: string;
  readonly laneId: string;
  readonly transportedSiteRef: string;
  readonly sourceFrontierRef: string;
  readonly basisFrontierRef: string;
  readonly targetFrontierRef: string;
  readonly admissionLawId: string;
  readonly transportLawId: string;
  readonly outcome: GitWarpWitnessedSuffixAdmissionOutcome;
  readonly sourceFacts: GitWarpWitnessedSuffixSourceFacts;
  readonly hologram: GitWarpSuffixTransformHologram;
  readonly patchRefs: readonly string[];
  readonly patchCount: number;
  readonly witnessRef: string;
  readonly bundleDigest: string;
  readonly proofRef: string;

  constructor(fields: GitWarpWitnessedSuffixAdmissionShellFields) {
    const checkedFields = requireFields(fields);
    const sourceFacts = requireSourceFacts(checkedFields.sourceFacts);
    const hologram = requireHologram(checkedFields.hologram);
    requireMatchingFrontiers(sourceFacts, hologram);
    requireMatchingPatchCount(sourceFacts, hologram);

    this.graphName = sourceFacts.graphName;
    this.laneId = requireNonEmptyString(checkedFields.laneId, 'laneId');
    this.transportedSiteRef = requireNonEmptyString(checkedFields.transportedSiteRef, 'transportedSiteRef');
    this.sourceFrontierRef = sourceFacts.sourceFrontierRef;
    this.basisFrontierRef = sourceFacts.basisFrontierRef;
    this.targetFrontierRef = sourceFacts.targetFrontierRef;
    this.admissionLawId = requireNonEmptyString(checkedFields.admissionLawId, 'admissionLawId');
    this.transportLawId = hologram.transportLawId;
    this.outcome = requireOutcome(checkedFields.outcome);
    this.sourceFacts = sourceFacts;
    this.hologram = hologram;
    this.patchRefs = freezePatchRefs(sourceFacts);
    this.patchCount = sourceFacts.patchCount;
    this.witnessRef = sourceFacts.witnessRef;
    this.bundleDigest = sourceFacts.bundleDigest;
    this.proofRef = hologram.proofRef;
    Object.freeze(this);
  }

  /** Deterministically materializes the admitted target state from a comparable basis. */
  materializeFrom(basis?: WarpState): WarpState {
    return this.hologram.materializeFrom(basis);
  }

  /** Returns true until runtime-boundary has a generated Wesley profile and fixture. */
  requiresGeneratedProfileBeforeProjection(): boolean {
    return this.sourceFacts.requiresGeneratedProfileBeforeProjection();
  }

  isAdmitted(): boolean {
    return this.outcome.isAdmitted();
  }

  requiresResolution(): boolean {
    return this.outcome.requiresResolution();
  }
}

function requireFields(
  value: GitWarpWitnessedSuffixAdmissionShellFields | null | undefined,
): GitWarpWitnessedSuffixAdmissionShellFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpWitnessedSuffixAdmissionShell fields must be provided', 'E_VALIDATION');
  }
  return value;
}

function requireSourceFacts(
  value: GitWarpWitnessedSuffixSourceFacts,
): GitWarpWitnessedSuffixSourceFacts {
  if (!(value instanceof GitWarpWitnessedSuffixSourceFacts)) {
    throw new WarpError('sourceFacts must be GitWarpWitnessedSuffixSourceFacts', 'E_VALIDATION');
  }
  return value;
}

function requireHologram(value: GitWarpSuffixTransformHologram): GitWarpSuffixTransformHologram {
  if (!(value instanceof GitWarpSuffixTransformHologram)) {
    throw new WarpError('hologram must be GitWarpSuffixTransformHologram', 'E_VALIDATION');
  }
  return value;
}

function requireOutcome(
  value: GitWarpWitnessedSuffixAdmissionOutcome,
): GitWarpWitnessedSuffixAdmissionOutcome {
  if (!(value instanceof GitWarpWitnessedSuffixAdmissionOutcome)) {
    throw new WarpError('outcome must be GitWarpWitnessedSuffixAdmissionOutcome', 'E_VALIDATION');
  }
  return value;
}

function requireMatchingFrontiers(
  sourceFacts: GitWarpWitnessedSuffixSourceFacts,
  hologram: GitWarpSuffixTransformHologram,
): void {
  requireSameValue(sourceFacts.sourceFrontierRef, hologram.sourceFrontierRef, 'sourceFrontierRef');
  requireSameValue(sourceFacts.basisFrontierRef, hologram.basisFrontierRef, 'basisFrontierRef');
  requireSameValue(sourceFacts.targetFrontierRef, hologram.targetFrontierRef, 'targetFrontierRef');
}

function requireMatchingPatchCount(
  sourceFacts: GitWarpWitnessedSuffixSourceFacts,
  hologram: GitWarpSuffixTransformHologram,
): void {
  if (sourceFacts.patchCount !== hologram.patchCount) {
    throw new WarpError('source facts and suffix hologram must name the same patch count', 'E_VALIDATION');
  }
}

function requireSameValue(left: string, right: string, name: string): void {
  if (left !== right) {
    throw new WarpError(`source facts and suffix hologram ${name} must match`, 'E_VALIDATION');
  }
}

function freezePatchRefs(sourceFacts: GitWarpWitnessedSuffixSourceFacts): readonly string[] {
  return Object.freeze(sourceFacts.patches.map((patch) => patch.patchSha));
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
