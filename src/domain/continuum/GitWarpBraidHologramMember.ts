import ProvenancePayload from '../services/provenance/ProvenancePayload.ts';
import WarpError from '../errors/WarpError.ts';

export type GitWarpBraidHologramMemberFields = {
  readonly strandId: string;
  readonly payload: ProvenancePayload;
};

/** One replay-sufficient strand interval inside a braid hologram. */
export default class GitWarpBraidHologramMember {
  readonly strandId: string;
  readonly payload: ProvenancePayload;

  constructor(fields: GitWarpBraidHologramMemberFields) {
    const checkedFields = requireFields(fields);
    this.strandId = requireNonEmptyString(checkedFields.strandId, 'strandId');
    this.payload = requirePayload(checkedFields.payload);
    if (this.payload.length === 0) {
      throw new WarpError('braid hologram member payload must not be empty', 'E_VALIDATION');
    }
    Object.freeze(this);
  }
}

function requireFields(
  value: GitWarpBraidHologramMemberFields | null | undefined,
): GitWarpBraidHologramMemberFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpBraidHologramMember fields must be provided', 'E_VALIDATION');
  }
  return value;
}

function requirePayload(value: ProvenancePayload): ProvenancePayload {
  if (!(value instanceof ProvenancePayload)) {
    throw new WarpError('payload must be a ProvenancePayload', 'E_VALIDATION');
  }
  return value;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
