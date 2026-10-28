import { coneObstructionFailure } from '../../../src/domain/api/ConeObstructionFailure.ts';
import type { RepairHint } from '../../../src/domain/api/ReceiptSupport.ts';
import ConeIngestAdvanced from '../../../src/domain/services/cone/ConeIngestAdvanced.ts';
import ConeBasis from '../../../src/domain/services/cone/ConeBasis.ts';
import type Lane from '../../../src/domain/api/Lane.ts';
import refreshLaneBasis from '../../../src/domain/api/refreshLaneBasis.ts';

export type ConeBasisRepairPayload = Readonly<{
  readonly type: 'Repair';
  readonly action: 'basis';
  /** The Lane's name: the worldline, or the strand when one was named. */
  readonly lane: string;
  readonly status: 'completed' | 'obstructed';
  /** Patches this advance folded; 0 when the basis already folded every writer tip. */
  readonly foldedPatches: number;
  /** Writer chains the basis folds. */
  readonly writers: number;
  readonly reason?: string;
  readonly repairHints?: readonly RepairHint[];
}>;

/**
 * Advances the lane's cone basis to its writers' tips (#1039): every patch
 * not yet folded is decoded once and folded into the records it names. Reads
 * and writes do this on their own; the repair makes the cost explicit after
 * a large fetch, and reports an obstruction with its repair hint.
 */
export default async function advanceConeBasis(lane: Lane): Promise<ConeBasisRepairPayload> {
  const outcome = await refreshLaneBasis(lane);
  const basis = outcome.settled();
  if (!(basis instanceof ConeBasis)) {
    const failure = coneObstructionFailure(basis);
    return Object.freeze({
      type: 'Repair', action: 'basis', lane: lane.name, status: 'obstructed', foldedPatches: 0, writers: 0,
      reason: failure.reason, repairHints: failure.repairHints,
    });
  }
  return Object.freeze({
    type: 'Repair', action: 'basis', lane: lane.name, status: 'completed',
    foldedPatches: outcome instanceof ConeIngestAdvanced ? outcome.foldedPatches : 0,
    writers: basis.frontier.entries().length,
  });
}
