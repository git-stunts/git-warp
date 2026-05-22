import WarpError from '../errors/WarpError.ts';
import ContinuumEvidencePosture from './ContinuumEvidencePosture.ts';

export type ContinuumEvidenceStatusFields = {
  readonly posture: string | ContinuumEvidencePosture;
  readonly sourceRuntime: string;
  readonly basisRef: string;
  readonly summary: string;
  readonly nativeWitnessRef?: string;
};

export type TranslatedGitWarpEvidenceFields = {
  readonly basisRef: string;
  readonly summary: string;
};

/** Runtime-backed evidence status for Continuum-compatible projections. */
export default class ContinuumEvidenceStatus {
  readonly posture: ContinuumEvidencePosture;
  readonly sourceRuntime: string;
  readonly basisRef: string;
  readonly summary: string;
  readonly nativeWitnessRef: string | undefined;

  constructor(fields: ContinuumEvidenceStatusFields) {
    this.posture = normalizePosture(fields.posture);
    this.sourceRuntime = requireNonEmptyString(fields.sourceRuntime, 'sourceRuntime');
    this.basisRef = requireNonEmptyString(fields.basisRef, 'basisRef');
    this.summary = requireNonEmptyString(fields.summary, 'summary');
    this.nativeWitnessRef = optionalNonEmptyString(fields.nativeWitnessRef, 'nativeWitnessRef');
    validateNativeWitnessPosture(this.posture, this.nativeWitnessRef);
    Object.freeze(this);
  }

  /** Creates the default v18 evidence posture for git-warp compatibility output. */
  static translatedGitWarp(fields: TranslatedGitWarpEvidenceFields): ContinuumEvidenceStatus {
    return new ContinuumEvidenceStatus({
      posture: 'translated-substrate',
      sourceRuntime: 'git-warp',
      basisRef: fields.basisRef,
      summary: fields.summary,
    });
  }

  /** Returns true for compatibility evidence translated from substrate facts. */
  isTranslatedSubstrate(): boolean {
    return this.posture.isTranslatedSubstrate();
  }

  /** Returns true only when native Continuum witnesshood is explicitly carried. */
  isContinuumNative(): boolean {
    return this.posture.isContinuumNative();
  }
}

/** Normalizes a posture carrier. */
function normalizePosture(value: string | ContinuumEvidencePosture): ContinuumEvidencePosture {
  if (value instanceof ContinuumEvidencePosture) {
    return value;
  }
  return new ContinuumEvidencePosture(value);
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Validates an optional non-empty string. */
function optionalNonEmptyString(value: string | undefined, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireNonEmptyString(value, name);
}

/** Enforces that native evidence cannot be claimed by posture alone. */
function validateNativeWitnessPosture(
  posture: ContinuumEvidencePosture,
  nativeWitnessRef: string | undefined,
): void {
  if (posture.isContinuumNative() && nativeWitnessRef === undefined) {
    throw new WarpError('nativeWitnessRef is required for native Continuum evidence', 'E_VALIDATION');
  }
  if (posture.isTranslatedSubstrate() && nativeWitnessRef !== undefined) {
    throw new WarpError('translated substrate evidence must not carry nativeWitnessRef', 'E_VALIDATION');
  }
}
