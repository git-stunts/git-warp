import WarpError from '../errors/WarpError.ts';
import ContinuumEvidencePosture from './ContinuumEvidencePosture.ts';

export type ContinuumEvidenceStatusFields = {
  readonly posture: string | ContinuumEvidencePosture;
  readonly sourceRuntime: string;
  readonly basisRef: string;
  readonly summary: string;
  readonly continuumWitnessRef?: string;
};

export type GitWarpParticipantEvidenceFields = {
  readonly basisRef: string;
  readonly summary: string;
};

/** Runtime-backed evidence status for Continuum-compatible projections. */
export default class ContinuumEvidenceStatus {
  readonly posture: ContinuumEvidencePosture;
  readonly sourceRuntime: string;
  readonly basisRef: string;
  readonly summary: string;
  readonly continuumWitnessRef: string | undefined;

  constructor(fields: ContinuumEvidenceStatusFields) {
    this.posture = normalizePosture(fields.posture);
    this.sourceRuntime = requireNonEmptyString(fields.sourceRuntime, 'sourceRuntime');
    this.basisRef = requireNonEmptyString(fields.basisRef, 'basisRef');
    this.summary = requireNonEmptyString(fields.summary, 'summary');
    this.continuumWitnessRef = optionalNonEmptyString(fields.continuumWitnessRef, 'continuumWitnessRef');
    validateContinuumWitnessPosture(this.posture, this.continuumWitnessRef);
    Object.freeze(this);
  }

  /** Creates the default v18 evidence posture for git-warp participant output. */
  static gitWarpParticipant(fields: GitWarpParticipantEvidenceFields): ContinuumEvidenceStatus {
    return new ContinuumEvidenceStatus({
      posture: 'participant-runtime',
      sourceRuntime: 'git-warp',
      basisRef: fields.basisRef,
      summary: fields.summary,
    });
  }

  /** Returns true for evidence produced by a Continuum participant runtime. */
  isParticipantRuntime(): boolean {
    return this.posture.isParticipantRuntime();
  }

  /** Returns true only when an explicit Continuum witness reference is carried. */
  isContinuumWitnessed(): boolean {
    return this.posture.isContinuumWitnessed();
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

/** Enforces that witnessed evidence cannot be claimed by posture alone. */
function validateContinuumWitnessPosture(
  posture: ContinuumEvidencePosture,
  continuumWitnessRef: string | undefined,
): void {
  if (posture.isContinuumWitnessed() && continuumWitnessRef === undefined) {
    throw new WarpError('continuumWitnessRef is required for Continuum-witnessed evidence', 'E_VALIDATION');
  }
  if (posture.isParticipantRuntime() && continuumWitnessRef !== undefined) {
    throw new WarpError('participant runtime evidence must not carry continuumWitnessRef', 'E_VALIDATION');
  }
}
