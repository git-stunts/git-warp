import VersionVector from '../crdt/VersionVector.ts';
import WarpError from '../errors/WarpError.ts';
import Patch from '../types/Patch.ts';

export type GitWarpTickPatchReplayCoreFields = {
  readonly patch: Patch;
  readonly patchSha: string;
};

/** Substrate replay facts carried by a git-warp patch at one tick. */
export default class GitWarpTickPatchReplayCore {
  readonly patchSha: string;
  readonly writer: string;
  readonly lamport: number;
  readonly operationCount: number;
  readonly contextWriterCount: number;
  readonly readCount: number;
  readonly writeCount: number;

  constructor(fields: GitWarpTickPatchReplayCoreFields) {
    const checkedFields = requireFields(fields);
    const patch = requirePatch(checkedFields.patch);
    this.patchSha = requireNonEmptyString(checkedFields.patchSha, 'patchSha');
    this.writer = requireNonEmptyString(patch.writer, 'patch.writer');
    this.lamport = requireNonNegativeInteger(patch.lamport, 'patch.lamport');
    this.operationCount = patch.ops.length;
    this.contextWriterCount = VersionVector.from(patch.context).size;
    this.readCount = patch.reads?.length ?? 0;
    this.writeCount = patch.writes?.length ?? 0;
    Object.freeze(this);
  }
}

/** Validates the replay-core constructor envelope. */
function requireFields(
  value: GitWarpTickPatchReplayCoreFields | null | undefined,
): GitWarpTickPatchReplayCoreFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpTickPatchReplayCore fields must be provided', 'E_VALIDATION');
  }
  return value;
}

/** Validates a Patch carrier. */
function requirePatch(value: Patch): Patch {
  if (!(value instanceof Patch)) {
    throw new WarpError('patch must be a Patch', 'E_VALIDATION');
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

/** Validates a non-negative integer. */
function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError(`${name} must be a non-negative integer`, 'E_VALIDATION');
  }
  return value;
}
