import ConeContendedObstruction from '../services/cone/ConeContendedObstruction.ts';
import type ConeObstruction from '../services/cone/ConeObstruction.ts';
import ConeRecoveryObstruction from '../services/cone/ConeRecoveryObstruction.ts';
import ConeSharedDotObstruction from '../services/cone/ConeSharedDotObstruction.ts';
import type { RepairHint } from './ReceiptSupport.ts';

/** How a public receipt reports a lane whose cone basis could not advance (#1039). */
export type ConeObstructionFailure = {
  readonly outcome: 'obstructed' | 'underdetermined';
  readonly reason: string;
  readonly repairHints: readonly RepairHint[];
};

const SHARED_DOT: ConeObstructionFailure = Object.freeze({
  outcome: 'obstructed',
  reason: 'cone_shared_dot',
  repairHints: Object.freeze([Object.freeze({
    code: 'repair_duplicate_dot',
    message: 'A patch reuses a dot another element also claims; repair the duplicate dot, then retry.',
  })]),
});

const CONTENDED: ConeObstructionFailure = Object.freeze({
  outcome: 'underdetermined',
  reason: 'cone_contended',
  repairHints: Object.freeze([Object.freeze({
    code: 'retry_cone_advance',
    message: 'Other folds kept moving the lane cone basis; retry the read or write.',
  })]),
});

const RECOVERY: ConeObstructionFailure = Object.freeze({
  outcome: 'obstructed',
  reason: 'cone_recovery',
  repairHints: Object.freeze([Object.freeze({
    code: 'restore_patch_history',
    message: 'A value this lane evicted could not be recovered from its patch; restore that history, then retry.',
  })]),
});

const WRITER_DIVERGED: ConeObstructionFailure = Object.freeze({
  outcome: 'obstructed',
  reason: 'cone_writer_diverged',
  repairHints: Object.freeze([Object.freeze({
    code: 'rebuild_cone_basis',
    message: 'A writer chain no longer extends what this clone folded; delete the clone-local cone head ref of the lane so it refolds from the writer chains, then retry.',
  })]),
});

/** The receipt fields for one cone obstruction. */
export function coneObstructionFailure(obstruction: ConeObstruction): ConeObstructionFailure {
  if (obstruction instanceof ConeSharedDotObstruction) {
    return SHARED_DOT;
  }
  if (obstruction instanceof ConeRecoveryObstruction) {
    return RECOVERY;
  }
  return obstruction instanceof ConeContendedObstruction ? CONTENDED : WRITER_DIVERGED;
}
