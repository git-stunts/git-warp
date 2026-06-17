import ProvenancePayload from '../services/provenance/ProvenancePayload.ts';
import WarpError from '../errors/WarpError.ts';
import type WarpState from '../services/state/WarpState.ts';

export type GitWarpSuffixTransformHologramFields = {
  readonly sourceFrontierRef: string;
  readonly basisFrontierRef: string;
  readonly targetFrontierRef: string;
  readonly transportLawId: string;
  readonly proofRef: string;
  readonly payload: ProvenancePayload;
};

/** Replay-bearing hologram for lawful distributed suffix transport. */
export default class GitWarpSuffixTransformHologram {
  readonly sourceFrontierRef: string;
  readonly basisFrontierRef: string;
  readonly targetFrontierRef: string;
  readonly transportLawId: string;
  readonly proofRef: string;
  readonly payload: ProvenancePayload;
  readonly patchCount: number;

  constructor(fields: GitWarpSuffixTransformHologramFields) {
    const checkedFields = requireFields(fields);
    this.sourceFrontierRef = requireNonEmptyString(checkedFields.sourceFrontierRef, 'sourceFrontierRef');
    this.basisFrontierRef = requireNonEmptyString(checkedFields.basisFrontierRef, 'basisFrontierRef');
    this.targetFrontierRef = requireNonEmptyString(checkedFields.targetFrontierRef, 'targetFrontierRef');
    this.transportLawId = requireNonEmptyString(checkedFields.transportLawId, 'transportLawId');
    this.proofRef = requireNonEmptyString(checkedFields.proofRef, 'proofRef');
    this.payload = requireNonEmptyPayload(checkedFields.payload);
    this.patchCount = this.payload.length;
    Object.freeze(this);
  }

  /** Deterministically materializes the target frontier from the local basis. */
  materializeFrom(basis?: WarpState): WarpState {
    return this.payload.replay(basis);
  }
}

function requireFields(
  value: GitWarpSuffixTransformHologramFields | null | undefined,
): GitWarpSuffixTransformHologramFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpSuffixTransformHologram fields must be provided', 'E_VALIDATION');
  }
  return value;
}

function requireNonEmptyPayload(value: ProvenancePayload): ProvenancePayload {
  if (!(value instanceof ProvenancePayload)) {
    throw new WarpError('payload must be a ProvenancePayload', 'E_VALIDATION');
  }
  if (value.length === 0) {
    throw new WarpError('suffix transform hologram payload must not be empty', 'E_VALIDATION');
  }
  return value;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
