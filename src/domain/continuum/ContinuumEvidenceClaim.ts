import ContinuumArtifactDescriptor from './ContinuumArtifactDescriptor.ts';
import ContinuumEvidencePosture from './ContinuumEvidencePosture.ts';
import WarpError from '../errors/WarpError.ts';

export type ContinuumEvidenceClaimFields = {
  readonly descriptor: ContinuumArtifactDescriptor;
  readonly posture: string | ContinuumEvidencePosture;
  readonly nativeWitnessProof?: string;
};

/** Couples a Continuum-family descriptor to an explicit evidence posture. */
export default class ContinuumEvidenceClaim {
  readonly descriptor: ContinuumArtifactDescriptor;
  readonly posture: ContinuumEvidencePosture;
  readonly nativeWitnessProof: string | undefined;

  constructor(fields: ContinuumEvidenceClaimFields) {
    this.descriptor = requireDescriptor(fields.descriptor);
    this.posture = normalizePosture(fields.posture);
    this.nativeWitnessProof = optionalNonEmptyString(fields.nativeWitnessProof, 'nativeWitnessProof');
    this.assertNativeProofMatchesPosture();
    Object.freeze(this);
  }

  /** Returns true when this is git-warp evidence translated into Continuum shape. */
  isTranslatedGitWarpEvidence(): boolean {
    return this.posture.isTranslatedGitWarpEvidence();
  }

  /** Returns true only when explicit native Continuum witness proof exists. */
  isNativeContinuumEvidence(): boolean {
    return this.posture.isNativeContinuumEvidence();
  }

  /** Returns this claim only when translated git-warp evidence is explicit. */
  requireTranslatedGitWarpEvidence(): ContinuumEvidenceClaim {
    if (!this.isTranslatedGitWarpEvidence()) {
      throw new WarpError(
        `Continuum evidence for ${this.descriptor.familyId.toString()} must be translated git-warp evidence`,
        'E_VALIDATION',
      );
    }
    return this;
  }

  private assertNativeProofMatchesPosture(): void {
    if (this.posture.isNativeContinuumEvidence() && this.nativeWitnessProof === undefined) {
      throw new WarpError('native Continuum evidence requires nativeWitnessProof', 'E_VALIDATION');
    }
    if (!this.posture.isNativeContinuumEvidence() && this.nativeWitnessProof !== undefined) {
      throw new WarpError('nativeWitnessProof requires native Continuum evidence posture', 'E_VALIDATION');
    }
  }
}

/** Validates a descriptor carrier. */
function requireDescriptor(value: ContinuumArtifactDescriptor): ContinuumArtifactDescriptor {
  if (!(value instanceof ContinuumArtifactDescriptor)) {
    throw new WarpError('descriptor must be a ContinuumArtifactDescriptor', 'E_VALIDATION');
  }
  return value;
}

/** Normalizes an evidence posture carrier. */
function normalizePosture(value: string | ContinuumEvidencePosture): ContinuumEvidencePosture {
  if (value instanceof ContinuumEvidencePosture) {
    return value;
  }
  return new ContinuumEvidencePosture(value);
}

/** Validates an optional non-empty string. */
function optionalNonEmptyString(value: string | undefined, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

