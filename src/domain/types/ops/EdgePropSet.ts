/**
 * EdgePropSet — canonical edge property operation (internal only).
 * Lowered to PropSet on the wire.
 */

import Op from './Op.ts';
import { OP_SCOPE_CANONICAL } from './OpScope.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';
import { encodeEdgeKey, encodeEdgePropKey } from '../../services/KeyCodec.ts';
import { mutateProp, snapshotProp, accumulatePropDiff } from './propHelpers.ts';
import type WarpState from '../../services/state/WarpState.ts';
import type { EventId } from '../../utils/EventId.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { PatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import ReceiptBuilder from '../../services/ReceiptBuilder.ts';

export default class EdgePropSet extends Op<'EdgePropSet'> {
  readonly receiptName = 'EdgePropSet' as const;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly key: string;
  readonly value: unknown;

  constructor({ from, to, label, key, value }: { from: string; to: string; label: string; key: string; value: unknown }) {
    super('EdgePropSet', OP_SCOPE_CANONICAL);
    assertNonEmptyString(from, 'EdgePropSet', 'from');
    assertNonEmptyString(to, 'EdgePropSet', 'to');
    assertNonEmptyString(label, 'EdgePropSet', 'label');
    assertNonEmptyString(key, 'EdgePropSet', 'key');
    assertNoReservedBytes(from, 'EdgePropSet', 'from');
    assertNoReservedBytes(to, 'EdgePropSet', 'to');
    assertNoReservedBytes(label, 'EdgePropSet', 'label');
    assertNoReservedBytes(key, 'EdgePropSet', 'key');
    this.from = from;
    this.to = to;
    this.label = label;
    this.key = key;
    this.value = value;
    Object.freeze(this);
  }

  validate(): void { /* validated in constructor */ }

  mutate(state: WarpState, eventId: EventId): void {
    mutateProp(state, encodeEdgePropKey(this.from, this.to, this.label, this.key), eventId, this.value);
  }

  outcome(state: WarpState, eventId: EventId): OpOutcomeResult {
    return ReceiptBuilder.edgePropSetOutcome(
      state.prop,
      { from: this.from, to: this.to, label: this.label, key: this.key },
      eventId,
    );
  }

  snapshot(state: WarpState): SnapshotBeforeOp {
    return snapshotProp(state, encodeEdgePropKey(this.from, this.to, this.label, this.key));
  }

  accumulate(diff: PatchDiff, state: WarpState, before: SnapshotBeforeOp): void {
    accumulatePropDiff(diff, state, encodeEdgeKey(this.from, this.to, this.label), this.key, before);
  }
}
