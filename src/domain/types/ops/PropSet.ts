/**
 * PropSet — raw/wire-format property operation.
 *
 * This is the persisted form. Edge properties use a \x01-prefixed node
 * field. See NodePropSet and EdgePropSet for the canonical (internal)
 * representations.
 */

import Op from './Op.ts';
import { OP_SCOPE_RAW } from './OpScope.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';
import { encodePropKey, EDGE_PROP_PREFIX } from '../../services/KeyCodec.js';
import { mutateProp, snapshotProp, accumulatePropDiff } from './propHelpers.ts';
import PatchError from '../../errors/PatchError.ts';
import type WarpState from '../../services/state/WarpState.ts';
import type { EventId } from '../../utils/EventId.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { PatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';
import ReceiptBuilder from '../../services/ReceiptBuilder.ts';

export default class PropSet extends Op<'PropSet'> {
  readonly receiptName = 'PropSet' as const;
  readonly node: string;
  readonly key: string;
  readonly value: unknown;

  constructor(node: string, key: string, value: unknown) {
    super('PropSet', OP_SCOPE_RAW);
    assertNonEmptyString(node, 'PropSet', 'node');
    assertNonEmptyString(key, 'PropSet', 'key');
    assertNoReservedBytes(key, 'PropSet', 'key');
    this.node = node;
    this.key = key;
    this.value = value;
    Object.freeze(this);
  }

  validate(): void { /* validated in constructor */ }

  mutate(state: WarpState, eventId: EventId): void {
    if (this.node[0] === EDGE_PROP_PREFIX) {
      throw new PatchError(
        'Unnormalized legacy edge-property PropSet reached canonical apply path. ' +
        'Call normalizeRawOp() at the decode boundary.',
        { context: { opType: 'PropSet', node: this.node } },
      );
    }
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
