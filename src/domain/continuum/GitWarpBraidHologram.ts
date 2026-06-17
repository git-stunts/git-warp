import GitWarpBraidHologramMember from './GitWarpBraidHologramMember.ts';
import WarpError from '../errors/WarpError.ts';
import type WarpState from '../services/state/WarpState.ts';

export type GitWarpBraidHologramFields = {
  readonly settlementId: string;
  readonly lawId: string;
  readonly projectionDigest: string;
  readonly proofRef: string;
  readonly members: readonly GitWarpBraidHologramMember[];
};

/** Replay-bearing hologram for materializing a settled braid weave. */
export default class GitWarpBraidHologram {
  readonly settlementId: string;
  readonly lawId: string;
  readonly projectionDigest: string;
  readonly proofRef: string;
  readonly members: readonly GitWarpBraidHologramMember[];

  constructor(fields: GitWarpBraidHologramFields) {
    const checkedFields = requireFields(fields);
    this.settlementId = requireNonEmptyString(checkedFields.settlementId, 'settlementId');
    this.lawId = requireNonEmptyString(checkedFields.lawId, 'lawId');
    this.projectionDigest = requireNonEmptyString(checkedFields.projectionDigest, 'projectionDigest');
    this.proofRef = requireNonEmptyString(checkedFields.proofRef, 'proofRef');
    this.members = freezeMembers(checkedFields.members);
    Object.freeze(this);
  }

  /** Deterministically materializes the shared braid projection. */
  materializeFrom(basis?: WarpState): WarpState {
    let materialized = this.members[0]?.payload.replay(basis);
    if (materialized === undefined) {
      throw new WarpError('braid hologram requires materializable members', 'E_VALIDATION');
    }
    for (const member of this.members.slice(1)) {
      materialized = materialized.join(member.payload.replay(basis));
    }
    return materialized;
  }
}

function requireFields(
  value: GitWarpBraidHologramFields | null | undefined,
): GitWarpBraidHologramFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpBraidHologram fields must be provided', 'E_VALIDATION');
  }
  return value;
}

function freezeMembers(
  values: readonly GitWarpBraidHologramMember[],
): readonly GitWarpBraidHologramMember[] {
  if (!Array.isArray(values) || values.length < 2) {
    throw new WarpError('braid hologram requires at least two members', 'E_VALIDATION');
  }
  const seen = new Set<string>();
  const members: GitWarpBraidHologramMember[] = [];
  for (const value of values) {
    const member = requireMember(value);
    if (seen.has(member.strandId)) {
      throw new WarpError('braid hologram member strandId values must be unique', 'E_VALIDATION');
    }
    seen.add(member.strandId);
    members.push(member);
  }
  return Object.freeze(members.sort(compareMembers));
}

function requireMember(value: GitWarpBraidHologramMember): GitWarpBraidHologramMember {
  if (!(value instanceof GitWarpBraidHologramMember)) {
    throw new WarpError('members must be GitWarpBraidHologramMember values', 'E_VALIDATION');
  }
  return value;
}

function compareMembers(left: GitWarpBraidHologramMember, right: GitWarpBraidHologramMember): number {
  if (left.strandId < right.strandId) {
    return -1;
  }
  if (left.strandId > right.strandId) {
    return 1;
  }
  return 0;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
