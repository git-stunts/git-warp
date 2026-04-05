/**
 * BlobValue — reference to an external blob in the Git object store.
 *
 * @module domain/types/ops/BlobValue
 */

import Op from './Op.js';
import { assertNonEmptyString } from './validate.js';

/**
 * References an external blob attached to a node.
 * No state effect in the reducer — recorded for provenance tracking.
 */
export default class BlobValue extends Op {
  /** @type {string} Node ID the blob is attached to */
  node;

  /** @type {string} Blob object ID in the Git object store */
  oid;

  /**
   * Creates a BlobValue operation.
   *
   * @param {string} node - Non-empty node ID
   * @param {string} oid - Non-empty blob object ID
   */
  constructor(node, oid) {
    super('BlobValue');
    assertNonEmptyString(node, 'BlobValue', 'node');
    assertNonEmptyString(oid, 'BlobValue', 'oid');
    this.node = node;
    this.oid = oid;
    Object.freeze(this);
  }
}
