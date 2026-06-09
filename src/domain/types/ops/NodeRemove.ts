/**
 * NodeRemove — removes a node by tombstoning observed dots.
 */

import Op from './Op.ts';
import { OP_SCOPE_BOTH } from './OpScope.ts';
import { assertNonEmptyString, assertNoReservedBytes, assertArray } from './validate.ts';
import type WarpState from '../../services/state/WarpState.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { MutablePatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import ReceiptBuilder from '../../services/ReceiptBuilder.ts';
import DiffCalculator from '../../services/DiffCalculator.ts';

export default class NodeRemove extends Op<'NodeRemove'> {
  readonly receiptName = 'NodeTombstone' as const;
  readonly node: string;
  readonly observedDots: readonly string[];

  constructor(node: string, observedDots: string[]) {
    super('NodeRemove', OP_SCOPE_BOTH);
    assertNonEmptyString(node, 'NodeRemove', 'node');
    assertNoReservedBytes(node, 'NodeRemove', 'node');
    assertArray(observedDots, 'NodeRemove', 'observedDots');
    for (let i = 0; i < observedDots.length; i += 1) {
      assertNonEmptyString(observedDots[i], 'NodeRemove', `observedDots[${i}]`);
    }
    this.node = node;
    this.observedDots = Object.freeze([...observedDots]);
    Object.freeze(this);
  }

  validate(): void { /* validated in constructor */ }

  mutate(state: WarpState): void {
    const dots = new Set(this.observedDots);
    state.nodeAlive.remove(dots);
  }

  outcome(state: WarpState): OpOutcomeResult {
    return ReceiptBuilder.nodeRemoveOutcome(state.nodeAlive, {
      node: this.node,
      observedDots: this.observedDots,
    });
  }

  snapshot(state: WarpState): SnapshotBeforeOp {
    return { aliveBeforeNodes: DiffCalculator.aliveElementsForDots(state.nodeAlive, new Set(this.observedDots)) };
  }

  accumulate(diff: MutablePatchDiff, state: WarpState, before: SnapshotBeforeOp): void {
    DiffCalculator.collectNodeRemovals(diff, state, before.aliveBeforeNodes);
  }
}
