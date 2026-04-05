/**
 * NodePropSet — canonical node property operation (internal only).
 *
 * @module domain/types/ops/NodePropSet
 */

import Op from './Op.js';
import { assertNonEmptyString } from './validate.js';

/**
 * Sets a property on a node using LWW semantics.
 * Canonical form — never persisted directly (lowered to PropSet on wire).
 */
export default class NodePropSet extends Op {
  /** @type {string} Node ID */
  node;

  /** @type {string} Property key */
  key;

  /** @type {unknown} Property value (any JSON-serializable type) */
  value;

  /**
   * Creates a NodePropSet operation.
   *
   * @param {string} node - Non-empty node ID
   * @param {string} key - Non-empty property key
   * @param {unknown} value - Property value
   */
  constructor(node, key, value) {
    super('NodePropSet');
    assertNonEmptyString(node, 'NodePropSet', 'node');
    assertNonEmptyString(key, 'NodePropSet', 'key');
    this.node = node;
    this.key = key;
    this.value = value;
    Object.freeze(this);
  }
}
