/**
 * EdgeAdd — adds a directed edge to the graph with a causal dot.
 */

import PatchError from '../../errors/PatchError.ts';
import { Dot } from '../../crdt/Dot.ts';
import Op from './Op.ts';
import { OP_SCOPE_BOTH } from './OpScope.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';
import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import { encodeEdgeKey } from '../../services/KeyCodec.js';
import type WarpState from '../../services/state/WarpState.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { PatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import ReceiptBuilder from '../../services/ReceiptBuilder.ts';

export default class EdgeAdd extends Op<'EdgeAdd'> {
  readonly receiptName = 'EdgeAdd' as const;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly dot: Dot;

  constructor({ from, to, label, dot }: { from: string; to: string; label: string; dot: Dot }) {
    super('EdgeAdd', OP_SCOPE_BOTH);
    assertNonEmptyString(from, 'EdgeAdd', 'from');
    assertNonEmptyString(to, 'EdgeAdd', 'to');
    assertNonEmptyString(label, 'EdgeAdd', 'label');
    assertNoReservedBytes(from, 'EdgeAdd', 'from');
    assertNoReservedBytes(to, 'EdgeAdd', 'to');
    assertNoReservedBytes(label, 'EdgeAdd', 'label');
    if (!(dot instanceof Dot)) {
      throw new PatchError('EdgeAdd requires dot to be a Dot instance');
    }
    this.from = from;
    this.to = to;
    this.label = label;
    this.dot = dot;
    Object.freeze(this);
  }

  validate(): void { /* validated in constructor */ }

  mutate(state: WarpState, eventId: EventId): void {
    const edgeKey = encodeEdgeKey(this.from, this.to, this.label);
    state.edgeAlive.add(edgeKey, this.dot);
    const prev = state.edgeBirthEvent.get(edgeKey);
    if (prev === undefined || compareEventIds(eventId, prev) > 0) {
      state.edgeBirthEvent.set(edgeKey, eventId);
    }
  }

  outcome(state: WarpState): OpOutcomeResult {
    const edgeKey = encodeEdgeKey(this.from, this.to, this.label);
    return ReceiptBuilder.edgeAddOutcome(state.edgeAlive, { dot: this.dot }, edgeKey);
  }

  snapshot(state: WarpState): SnapshotBeforeOp {
    const ek = encodeEdgeKey(this.from, this.to, this.label);
    return { edgeWasAlive: state.edgeAlive.contains(ek), edgeKey: ek };
  }

  accumulate(diff: PatchDiff, state: WarpState, before: SnapshotBeforeOp): void {
    if (before.edgeWasAlive !== true && before.edgeKey !== undefined && state.edgeAlive.contains(before.edgeKey)) {
      diff.edgesAdded.push({ from: this.from, to: this.to, label: this.label });
    }
  }
}
