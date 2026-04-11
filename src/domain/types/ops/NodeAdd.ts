/**
 * NodeAdd — adds a node to the graph with a causal dot.
 */

import PatchError from '../../errors/PatchError.ts';
import { Dot } from '../../crdt/Dot.ts';
import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';
import { OP_SCOPE_BOTH } from './OpScope.ts';
import type WarpState from '../../services/state/WarpState.ts';
import type { EventId } from '../../utils/EventId.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { PatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import ReceiptBuilder from '../../services/ReceiptBuilder.ts';

export default class NodeAdd extends Op<'NodeAdd'> {
  readonly receiptName = 'NodeAdd' as const;
  readonly node: string;
  readonly dot: Dot;

  constructor(node: string, dot: Dot) {
    super('NodeAdd', OP_SCOPE_BOTH);
    assertNonEmptyString(node, 'NodeAdd', 'node');
    assertNoReservedBytes(node, 'NodeAdd', 'node');
    if (!(dot instanceof Dot)) {
      throw new PatchError('NodeAdd requires dot to be a Dot instance');
    }
    this.node = node;
    this.dot = dot;
    Object.freeze(this);
  }

  validate(): void { /* validated in constructor */ }

  mutate(state: WarpState): void {
    state.nodeAlive.add(this.node, this.dot);
  }

  outcome(state: WarpState): OpOutcomeResult {
    return ReceiptBuilder.nodeAddOutcome(state.nodeAlive, { node: this.node, dot: this.dot });
  }

  snapshot(state: WarpState): SnapshotBeforeOp {
    return { nodeWasAlive: state.nodeAlive.contains(this.node) };
  }

  accumulate(diff: PatchDiff, state: WarpState, before: SnapshotBeforeOp): void {
    if (before.nodeWasAlive !== true && state.nodeAlive.contains(this.node)) {
      diff.nodesAdded.push(this.node);
    }
  }
}
