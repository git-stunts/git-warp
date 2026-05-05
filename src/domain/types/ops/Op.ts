/**
 * Op — abstract base class for all WARP operations.
 *
 * Provides runtime identity (`instanceof Op`), the `type` discriminator
 * field for serialization, and the five behavior methods that the
 * reducer dispatches via `instanceof`:
 *
 *   - validate()   — structural field-shape checks
 *   - mutate()     — CRDT mutation (in place)
 *   - outcome()    — pre-mutation receipt outcome
 *   - snapshot()   — pre-mutation alive/prop snapshot
 *   - accumulate() — post-mutation diff emission
 */

import PatchError from '../../errors/PatchError.ts';
import type WarpState from '../../services/state/WarpState.ts';
import type { EventId } from '../../utils/EventId.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { PatchDiff } from '../PatchDiff.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';

export default abstract class Op<T extends string = string> {
  /** Operation type discriminator (matches wire format). */
  readonly type: T;

  /** Bit flags indicating raw, canonical, or both. See OpScope.ts. */
  readonly scope: number;

  /** TickReceipt-compatible op type string. */
  abstract readonly receiptName: string;

  constructor(type: T, scope: number) {
    if (new.target === Op) {
      throw new PatchError('Op is abstract — use a concrete subclass (NodeAdd, EdgeAdd, etc.)', {
        code: 'E_OP_ABSTRACT',
      });
    }
    if (typeof type !== 'string' || type.length === 0) {
      throw new PatchError('Op type must be a non-empty string', {
        code: 'E_OP_INVALID_TYPE',
      });
    }
    this.type = type;
    this.scope = scope;
  }

  /** Structural field-shape checks. Throws PatchError on failure. */
  abstract validate(): void;

  /** CRDT mutation. Mutates state in place. */
  abstract mutate(state: WarpState, eventId: EventId): void;

  /** Pre-mutation receipt outcome. Reads state; does not mutate. */
  abstract outcome(state: WarpState, eventId: EventId): OpOutcomeResult;

  /** Pre-mutation snapshot used by the diff path. */
  abstract snapshot(state: WarpState): SnapshotBeforeOp;

  /** Post-mutation diff accumulation. Mutates diff in place. */
  abstract accumulate(diff: PatchDiff, state: WarpState, before: SnapshotBeforeOp): void;
}
