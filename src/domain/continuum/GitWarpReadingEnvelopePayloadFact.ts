import WarpError from '../errors/WarpError.ts';

export type GitWarpReadingEnvelopePayloadFactFields = {
  readonly payloadKind: string;
  readonly payloadDigest: string;
  readonly stateHash?: string;
};

/** Payload identity for a git-warp read result feeding a reading envelope. */
export default class GitWarpReadingEnvelopePayloadFact {
  readonly payloadKind: string;
  readonly payloadDigest: string;
  readonly stateHash: string | undefined;

  constructor(fields: GitWarpReadingEnvelopePayloadFactFields) {
    const checkedFields = requireFields(fields);
    this.payloadKind = requireNonEmptyString(checkedFields.payloadKind, 'payloadKind');
    this.payloadDigest = requireNonEmptyString(checkedFields.payloadDigest, 'payloadDigest');
    this.stateHash = optionalNonEmptyString(checkedFields.stateHash, 'stateHash');
    Object.freeze(this);
  }

  /** Returns true when the payload carries a materialized state hash. */
  hasStateHash(): boolean {
    return this.stateHash !== undefined;
  }
}

/** Validates the payload-fact constructor envelope. */
function requireFields(
  value: GitWarpReadingEnvelopePayloadFactFields | null | undefined,
): GitWarpReadingEnvelopePayloadFactFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpReadingEnvelopePayloadFact fields must be provided', 'E_VALIDATION');
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

/** Validates an optional non-empty string. */
function optionalNonEmptyString(value: string | undefined, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireNonEmptyString(value, name);
}
