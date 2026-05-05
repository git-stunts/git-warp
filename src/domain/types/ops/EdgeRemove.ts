/**
 * EdgeRemove — removes an edge by tombstoning observed dots.
 */

import Op from './Op.ts';
import { OP_SCOPE_BOTH } from './OpScope.ts';
import { assertNonEmptyString, assertNoReservedBytes, assertArray } from './validate.ts';
import type WarpState from '../../services/state/WarpState.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { PatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import ReceiptBuilder from '../../services/ReceiptBuilder.ts';
import DiffCalculator from '../../services/DiffCalculator.ts';

export default class EdgeRemove extends Op<'EdgeRemove'> {
  readonly receiptName = 'EdgeTombstone' as const;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly observedDots: readonly string[];

  constructor({ from, to, label, observedDots }: { from: string; to: string; label: string; observedDots: string[] }) {
    super('EdgeRemove', OP_SCOPE_BOTH);
    assertNonEmptyString(from, 'EdgeRemove', 'from');
    assertNonEmptyString(to, 'EdgeRemove', 'to');
    assertNonEmptyString(label, 'EdgeRemove', 'label');
    assertNoReservedBytes(from, 'EdgeRemove', 'from');
    assertNoReservedBytes(to, 'EdgeRemove', 'to');
    assertNoReservedBytes(label, 'EdgeRemove', 'label');
    assertArray(observedDots, 'EdgeRemove', 'observedDots');
    for (let i = 0; i < observedDots.length; i += 1) {
      assertNonEmptyString(observedDots[i], 'EdgeRemove', `observedDots[${i}]`);
    }
    this.from = from;
    this.to = to;
    this.label = label;
    this.observedDots = Object.freeze([...observedDots]);
    Object.freeze(this);
  }

  validate(): void { /* validated in constructor */ }

  mutate(state: WarpState): void {
    const dots = new Set(this.observedDots);
    state.edgeAlive.remove(dots);
  }

  outcome(state: WarpState): OpOutcomeResult {
    return ReceiptBuilder.edgeRemoveOutcome(state.edgeAlive, {
      from: this.from, to: this.to, label: this.label,
      observedDots: this.observedDots,
    });
  }

  snapshot(state: WarpState): SnapshotBeforeOp {
    return { aliveBeforeEdges: DiffCalculator.aliveElementsForDots(state.edgeAlive, new Set(this.observedDots)) };
  }

  accumulate(diff: PatchDiff, state: WarpState, before: SnapshotBeforeOp): void {
    DiffCalculator.collectEdgeRemovals(diff, state, before.aliveBeforeEdges);
  }
}
