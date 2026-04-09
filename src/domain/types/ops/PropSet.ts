import { OP_SCOPE_RAW } from './OpScope.ts';
/**
 * PropSet — raw/wire-format property operation.
 *
 * This is the persisted form. Edge properties use a \x01-prefixed node
 * field. See NodePropSet and EdgePropSet for the canonical (internal)
 * representations.
 *
 * @module domain/types/ops/PropSet
 */

import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';

/**
 * Sets a property on a node (raw wire format).
 * The `node` field may carry a \x01-prefixed edge identity for edge props.
 */
export default class PropSet extends Op<'PropSet'> {
  /** Node ID (may contain \x01 prefix for edge props) */
  readonly node: string;

  /** Property key */
  readonly key: string;

  /** Property value (any JSON-serializable type) */
  readonly value: unknown;

  /**
   * Creates a PropSet operation (raw wire format).
   */
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
}
