import ContinuumEvidencePosture from './ContinuumEvidencePosture.ts';
import ContinuumFamilyId from './ContinuumFamilyId.ts';
import ContinuumGeneratedFamilyInventoryEntry from './ContinuumGeneratedFamilyInventoryEntry.ts';
import GitWarpWitnessedSuffixPatchFact from './GitWarpWitnessedSuffixPatchFact.ts';
import WarpError from '../errors/WarpError.ts';

const RUNTIME_BOUNDARY_FAMILY_ID = 'runtime-boundary-family';

export type GitWarpWitnessedSuffixSourceFactsFields = {
  readonly family: ContinuumGeneratedFamilyInventoryEntry;
  readonly evidencePosture: string | ContinuumEvidencePosture;
  readonly graphName: string;
  readonly sourceFrontierRef: string;
  readonly basisFrontierRef: string;
  readonly targetFrontierRef: string;
  readonly patches: readonly GitWarpWitnessedSuffixPatchFact[];
  readonly witnessRef: string;
  readonly bundleDigest: string;
};

/** Translated git-warp source facts for a future runtime-boundary suffix shell. */
export default class GitWarpWitnessedSuffixSourceFacts {
  readonly family: ContinuumGeneratedFamilyInventoryEntry;
  readonly evidencePosture: ContinuumEvidencePosture;
  readonly graphName: string;
  readonly sourceFrontierRef: string;
  readonly basisFrontierRef: string;
  readonly targetFrontierRef: string;
  readonly patches: readonly GitWarpWitnessedSuffixPatchFact[];
  readonly patchCount: number;
  readonly witnessRef: string;
  readonly bundleDigest: string;

  constructor(fields: GitWarpWitnessedSuffixSourceFactsFields) {
    const checkedFields = requireFields(fields);
    this.family = requireRuntimeBoundaryFamily(checkedFields.family);
    this.evidencePosture = requireTranslatedPosture(checkedFields.evidencePosture);
    this.graphName = requireNonEmptyString(checkedFields.graphName, 'graphName');
    this.sourceFrontierRef = requireNonEmptyString(checkedFields.sourceFrontierRef, 'sourceFrontierRef');
    this.basisFrontierRef = requireNonEmptyString(checkedFields.basisFrontierRef, 'basisFrontierRef');
    this.targetFrontierRef = requireNonEmptyString(checkedFields.targetFrontierRef, 'targetFrontierRef');
    this.patches = freezePatchFacts(checkedFields.patches);
    this.patchCount = this.patches.length;
    this.witnessRef = requireNonEmptyString(checkedFields.witnessRef, 'witnessRef');
    this.bundleDigest = requireNonEmptyString(checkedFields.bundleDigest, 'bundleDigest');
    Object.freeze(this);
  }

  /** Returns true until runtime-boundary has a generated Wesley profile and fixture. */
  requiresGeneratedProfileBeforeProjection(): boolean {
    return !this.family.isProjectionReady();
  }
}

/** Validates the source-facts constructor envelope. */
function requireFields(
  value: GitWarpWitnessedSuffixSourceFactsFields | null | undefined,
): GitWarpWitnessedSuffixSourceFactsFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpWitnessedSuffixSourceFacts fields must be provided', 'E_VALIDATION');
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
    throw new WarpError('witnessed suffix source facts require runtime-boundary-family', 'E_VALIDATION');
  }
  return value;
}

/** Requires translated git-warp evidence posture. */
function requireTranslatedPosture(value: string | ContinuumEvidencePosture): ContinuumEvidencePosture {
  const posture = normalizePosture(value);
  if (!posture.isTranslatedGitWarpEvidence()) {
    throw new WarpError('witnessed suffix source facts require translated git-warp evidence', 'E_VALIDATION');
  }
  return posture;
}

/** Normalizes an evidence posture carrier. */
function normalizePosture(value: string | ContinuumEvidencePosture): ContinuumEvidencePosture {
  if (value instanceof ContinuumEvidencePosture) {
    return value;
  }
  return new ContinuumEvidencePosture(value);
}

/** Freezes and validates ordered suffix patch facts. */
function freezePatchFacts(
  values: readonly GitWarpWitnessedSuffixPatchFact[],
): readonly GitWarpWitnessedSuffixPatchFact[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new WarpError('witnessed suffix source facts require at least one patch', 'E_VALIDATION');
  }
  const checkedValues: GitWarpWitnessedSuffixPatchFact[] = [];
  for (const value of values) {
    if (!(value instanceof GitWarpWitnessedSuffixPatchFact)) {
      throw new WarpError('patches must be GitWarpWitnessedSuffixPatchFact values', 'E_VALIDATION');
    }
    checkedValues.push(value);
  }
  return Object.freeze(checkedValues);
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
