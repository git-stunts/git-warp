/**
 * EdgePropSet — canonical edge property operation (internal only).
 *
 * @module domain/types/ops/EdgePropSet
 */

import Op from './Op.js';
import { assertNonEmptyString } from './validate.js';

/**
 * Sets a property on an edge using LWW semantics.
 * Canonical form — never persisted directly (lowered to PropSet on wire).
 */
export default class EdgePropSet extends Op {
  /** @type {string} Source node ID */
  from;

  /** @type {string} Target node ID */
  to;

  /** @type {string} Edge label */
  label;

  /** @type {string} Property key */
  key;

  /** @type {unknown} Property value (any JSON-serializable type) */
  value;

  /**
   * Creates an EdgePropSet operation.
   *
   * @param {{ from: string, to: string, label: string, key: string, value: unknown }} fields
   */
  constructor({ from, to, label, key, value }) {
    super('EdgePropSet');
    assertNonEmptyString(from, 'EdgePropSet', 'from');
    assertNonEmptyString(to, 'EdgePropSet', 'to');
    assertNonEmptyString(label, 'EdgePropSet', 'label');
    assertNonEmptyString(key, 'EdgePropSet', 'key');
    this.from = from;
    this.to = to;
    this.label = label;
    this.key = key;
    this.value = value;
    Object.freeze(this);
  }
}
