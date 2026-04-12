/**
 * NodePropSet — canonical node property operation (internal only).
 * Lowered to PropSet on the wire.
 */

import Op from './Op.ts';
import { OP_SCOPE_CANONICAL } from './OpScope.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';
import { encodePropKey } from '../../services/KeyCodec.ts';
import { mutateProp, snapshotProp, accumulatePropDiff } from './propHelpers.ts';
import type WarpState from '../../services/state/WarpState.ts';
import type { EventId } from '../../utils/EventId.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { PatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import ReceiptBuilder from '../../services/ReceiptBuilder.ts';

export default class NodePropSet extends Op<'NodePropSet'> {
  readonly receiptName = 'NodePropSet' as const;
  readonly node: string;
  readonly key: string;
  readonly value: unknown;

  constructor(node: string, key: string, value: unknown) {
    super('NodePropSet', OP_SCOPE_CANONICAL);
    assertNonEmptyString(node, 'NodePropSet', 'node');
    assertNonEmptyString(key, 'NodePropSet', 'key');
    assertNoReservedBytes(node, 'NodePropSet', 'node');
    assertNoReservedBytes(key, 'NodePropSet', 'key');
    this.node = node;
    this.key = key;
    this.value = value;
    Object.freeze(this);
  }

  validate(): void { /* validated in constructor */ }

  mutate(state: WarpState, eventId: EventId): void {
    mutateProp(state, encodePropKey(this.node, this.key), eventId, this.value);
  }

  outcome(state: WarpState, eventId: EventId): OpOutcomeResult {
    return ReceiptBuilder.propSetOutcome(state.prop, { node: this.node, key: this.key }, eventId);
  }

  snapshot(state: WarpState): SnapshotBeforeOp {
    return snapshotProp(state, encodePropKey(this.node, this.key));
  }

  accumulate(diff: PatchDiff, state: WarpState, before: SnapshotBeforeOp): void {
    accumulatePropDiff(diff, state, this.node, this.key, before);
  }
}
