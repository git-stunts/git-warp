/**
 * BlobValue — reference to an external blob in the Git object store.
 * No state effect in the reducer — recorded for provenance tracking.
 */

import Op from './Op.ts';
import { OP_SCOPE_BOTH } from './OpScope.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';
import OpApplied from './OpApplied.ts';
import type OpOutcomeResult from './OpOutcomeResult.ts';
import type { SnapshotBeforeOp } from './SnapshotBeforeOp.ts';

export default class BlobValue extends Op<'BlobValue'> {
  readonly receiptName = 'BlobValue' as const;
  readonly node: string;
  readonly oid: string;

  constructor(node: string, oid: string) {
    super('BlobValue', OP_SCOPE_BOTH);
    assertNonEmptyString(node, 'BlobValue', 'node');
    assertNonEmptyString(oid, 'BlobValue', 'oid');
    assertNoReservedBytes(node, 'BlobValue', 'node');
    this.node = node;
    this.oid = oid;
    Object.freeze(this);
  }

  validate(): void { /* forward-compat: no structural check */ }
  mutate(): void { /* BlobValue has no state effect */ }

  outcome(): OpOutcomeResult {
    const target = (this.oid.length > 0) ? this.oid : '*';
    return new OpApplied(target);
  }

  snapshot(): SnapshotBeforeOp { return {}; }
  accumulate(): void { /* no-op */ }
}
