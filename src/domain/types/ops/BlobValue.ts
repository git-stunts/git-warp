import { OP_SCOPE_BOTH } from './OpScope.ts';
/**
 * BlobValue — reference to an external blob in the Git object store.
 *
 * @module domain/types/ops/BlobValue
 */

import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';

/**
 * References an external blob attached to a node.
 * No state effect in the reducer — recorded for provenance tracking.
 */
export default class BlobValue extends Op<'BlobValue'> {
  /** Node ID the blob is attached to */
  readonly node: string;

  /** Blob object ID in the Git object store */
  readonly oid: string;

  /**
   * Creates a BlobValue operation.
   */
  constructor(node: string, oid: string) {
    super('BlobValue', OP_SCOPE_BOTH);
    assertNonEmptyString(node, 'BlobValue', 'node');
    assertNonEmptyString(oid, 'BlobValue', 'oid');
    assertNoReservedBytes(node, 'BlobValue', 'node');
    this.node = node;
    this.oid = oid;
    Object.freeze(this);
  }
}
