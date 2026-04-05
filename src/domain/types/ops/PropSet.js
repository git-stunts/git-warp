/**
 * PropSet — raw/wire-format property operation.
 *
 * This is the persisted form. Edge properties use a \x01-prefixed node
 * field. See NodePropSet and EdgePropSet for the canonical (internal)
 * representations.
 *
 * @module domain/types/ops/PropSet
 */

import Op from './Op.js';
import { assertNonEmptyString } from './validate.js';

/**
 * Sets a property on a node (raw wire format).
 * The `node` field may carry a \x01-prefixed edge identity for edge props.
 */
export default class PropSet extends Op {
  /** @type {string} Node ID (may contain \x01 prefix for edge props) */
  node;

  /** @type {string} Property key */
  key;

  /** @type {unknown} Property value (any JSON-serializable type) */
  value;

  /**
   * Creates a PropSet operation (raw wire format).
   *
   * @param {string} node - Non-empty node ID
   * @param {string} key - Non-empty property key
   * @param {unknown} value - Property value
   */
  constructor(node, key, value) {
    super('PropSet');
    assertNonEmptyString(node, 'PropSet', 'node');
    assertNonEmptyString(key, 'PropSet', 'key');
    this.node = node;
    this.key = key;
    this.value = value;
    Object.freeze(this);
  }
}
