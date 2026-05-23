import GitWarpTickPatchReplayCore from './GitWarpTickPatchReplayCore.ts';
import GitWarpTickReceiptShell from './GitWarpTickReceiptShell.ts';
import GitWarpTickReceiptWitnessCore from './GitWarpTickReceiptWitnessCore.ts';
import WarpError from '../errors/WarpError.ts';
import Patch from '../types/Patch.ts';
import { TickReceipt } from '../types/TickReceipt.ts';

export type GitWarpTickWitnessLadderFields = {
  readonly patch: Patch;
  readonly patchSha: string;
  readonly receipt: TickReceipt;
};

/** Validated witness ladder for one git-warp patch tick and receipt. */
export default class GitWarpTickWitnessLadder {
  readonly replayCore: GitWarpTickPatchReplayCore;
  readonly witnessCore: GitWarpTickReceiptWitnessCore;
  readonly receiptShell: GitWarpTickReceiptShell;

  constructor(fields: GitWarpTickWitnessLadderFields) {
    const checkedFields = requireFields(fields);
    const patch = requirePatch(checkedFields.patch);
    const receipt = requireReceipt(checkedFields.receipt);
    this.replayCore = new GitWarpTickPatchReplayCore({
      patch,
      patchSha: checkedFields.patchSha,
    });
    this.witnessCore = new GitWarpTickReceiptWitnessCore({ receipt });
    this.receiptShell = new GitWarpTickReceiptShell({ receipt });
    assertAlignedTick(this.replayCore, this.witnessCore);
    Object.freeze(this);
  }
}

/** Validates the ladder constructor envelope. */
function requireFields(
  value: GitWarpTickWitnessLadderFields | null | undefined,
): GitWarpTickWitnessLadderFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpTickWitnessLadder fields must be provided', 'E_VALIDATION');
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

/** Validates a TickReceipt carrier. */
function requireReceipt(value: TickReceipt): TickReceipt {
  if (!(value instanceof TickReceipt)) {
    throw new WarpError('receipt must be a TickReceipt', 'E_VALIDATION');
  }
  return value;
}

/** Requires replay and receipt facts to describe the same tick. */
function assertAlignedTick(
  replayCore: GitWarpTickPatchReplayCore,
  witnessCore: GitWarpTickReceiptWitnessCore,
): void {
  if (replayCore.patchSha !== witnessCore.patchSha) {
    throw new WarpError('tick witness ladder patch SHA must match receipt patch SHA', 'E_VALIDATION');
  }
  if (replayCore.writer !== witnessCore.writer) {
    throw new WarpError('tick witness ladder writer must match receipt writer', 'E_VALIDATION');
  }
  if (replayCore.lamport !== witnessCore.lamport) {
    throw new WarpError('tick witness ladder Lamport must match receipt Lamport', 'E_VALIDATION');
  }
}
