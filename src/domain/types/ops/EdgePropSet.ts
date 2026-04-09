import { OP_SCOPE_CANONICAL } from './OpScope.ts';
/**
 * EdgePropSet — canonical edge property operation (internal only).
 *
 * @module domain/types/ops/EdgePropSet
 */

import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';

/**
 * Sets a property on an edge using LWW semantics.
 * Canonical form — never persisted directly (lowered to PropSet on wire).
 */
export default class EdgePropSet extends Op<'EdgePropSet'> {
  /** Source node ID */
  readonly from: string;

  /** Target node ID */
  readonly to: string;

  /** Edge label */
  readonly label: string;

  /** Property key */
  readonly key: string;

  /** Property value (any JSON-serializable type) */
  readonly value: unknown;

  /**
   * Creates an EdgePropSet operation.
   */
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
}
