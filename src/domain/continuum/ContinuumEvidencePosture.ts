import ContinuumEvidenceAccess from './ContinuumEvidenceAccess.ts';
import ContinuumEvidenceCompleteness from './ContinuumEvidenceCompleteness.ts';
import ContinuumEvidenceOrigin from './ContinuumEvidenceOrigin.ts';
import ContinuumEvidenceProofStrength from './ContinuumEvidenceProofStrength.ts';
import WarpError from '../errors/WarpError.ts';

const LATTICE_SEPARATOR = ':';

export type ContinuumEvidencePostureFields = {
  readonly origin: string | ContinuumEvidenceOrigin;
  readonly proofStrength: string | ContinuumEvidenceProofStrength;
  readonly access: string | ContinuumEvidenceAccess;
  readonly completeness: string | ContinuumEvidenceCompleteness;
};

/** Runtime-backed four-coordinate evidence posture for Continuum-family values. */
export default class ContinuumEvidencePosture {
  readonly origin: ContinuumEvidenceOrigin;
  readonly proofStrength: ContinuumEvidenceProofStrength;
  readonly access: ContinuumEvidenceAccess;
  readonly completeness: ContinuumEvidenceCompleteness;

  constructor(fields: ContinuumEvidencePostureFields) {
    const checkedFields = requireFields(fields);
    this.origin = normalizeOrigin(checkedFields.origin);
    this.proofStrength = normalizeProofStrength(checkedFields.proofStrength);
    this.access = normalizeAccess(checkedFields.access);
    this.completeness = normalizeCompleteness(checkedFields.completeness);
    Object.freeze(this);
  }

  static translatedGitWarpEvidence(): ContinuumEvidencePosture {
    return new ContinuumEvidencePosture({
      origin: ContinuumEvidenceOrigin.translated(),
      proofStrength: ContinuumEvidenceProofStrength.witnessed(),
      access: ContinuumEvidenceAccess.available(),
      completeness: ContinuumEvidenceCompleteness.complete(),
    });
  }

  static nativeContinuumEvidence(): ContinuumEvidencePosture {
    return new ContinuumEvidencePosture({
      origin: ContinuumEvidenceOrigin.native(),
      proofStrength: ContinuumEvidenceProofStrength.witnessed(),
      access: ContinuumEvidenceAccess.available(),
      completeness: ContinuumEvidenceCompleteness.complete(),
    });
  }

  static unsupportedDescriptor(): ContinuumEvidencePosture {
    return new ContinuumEvidencePosture({
      origin: ContinuumEvidenceOrigin.descriptor(),
      proofStrength: ContinuumEvidenceProofStrength.none(),
      access: ContinuumEvidenceAccess.available(),
      completeness: ContinuumEvidenceCompleteness.unsupported(),
    });
  }

  /** Returns true for git-warp-local facts translated into Continuum shape. */
  isTranslatedGitWarpEvidence(): boolean {
    return this.origin.isTranslated()
      && this.proofStrength.isWitnessed()
      && this.access.isAvailable()
      && this.completeness.isComplete();
  }

  /** Returns true only for values with native Continuum witnesshood proof. */
  isNativeContinuumEvidence(): boolean {
    return this.origin.isNative() && this.proofStrength.isWitnessed();
  }

  /** Returns true when a native proof string must accompany this posture. */
  requiresNativeWitnessProof(): boolean {
    return this.origin.isNative() && this.proofStrength.isWitnessed() && this.access.isAvailable();
  }

  /** Returns true when direct replay can trust this posture without expansion. */
  canAuthorizeReplayShortcut(): boolean {
    return this.origin.isReplayOrigin()
      && this.proofStrength.isWitnessed()
      && this.access.isAvailable()
      && this.completeness.isComplete();
  }

  /** Returns true when the posture is shape-only descriptor evidence. */
  isUnsupportedDescriptor(): boolean {
    return this.origin.equals(ContinuumEvidenceOrigin.descriptor())
      && this.proofStrength.hasNoProof()
      && this.completeness.isUnsupported();
  }

  /** Returns the stable four-coordinate lattice key. */
  toString(): string {
    return [
      this.origin.toString(),
      this.proofStrength.toString(),
      this.access.toString(),
      this.completeness.toString(),
    ].join(LATTICE_SEPARATOR);
  }
}

function requireFields(
  value: ContinuumEvidencePostureFields | null | undefined,
): ContinuumEvidencePostureFields {
  if (value === null || value === undefined) {
    throw new WarpError('ContinuumEvidencePosture fields must be provided', 'E_VALIDATION');
  }
  return value;
}

function normalizeOrigin(value: string | ContinuumEvidenceOrigin): ContinuumEvidenceOrigin {
  if (value instanceof ContinuumEvidenceOrigin) {
    return value;
  }
  return new ContinuumEvidenceOrigin(value);
}

function normalizeProofStrength(
  value: string | ContinuumEvidenceProofStrength,
): ContinuumEvidenceProofStrength {
  if (value instanceof ContinuumEvidenceProofStrength) {
    return value;
  }
  return new ContinuumEvidenceProofStrength(value);
}

function normalizeAccess(value: string | ContinuumEvidenceAccess): ContinuumEvidenceAccess {
  if (value instanceof ContinuumEvidenceAccess) {
    return value;
  }
  return new ContinuumEvidenceAccess(value);
}

function normalizeCompleteness(
  value: string | ContinuumEvidenceCompleteness,
): ContinuumEvidenceCompleteness {
  if (value instanceof ContinuumEvidenceCompleteness) {
    return value;
  }
  return new ContinuumEvidenceCompleteness(value);
}
