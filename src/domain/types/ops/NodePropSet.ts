import { OP_SCOPE_CANONICAL } from './OpScope.ts';
/**
 * NodePropSet — canonical node property operation (internal only).
 *
 * @module domain/types/ops/NodePropSet
 */

import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';

/**
 * Sets a property on a node using LWW semantics.
 * Canonical form — never persisted directly (lowered to PropSet on wire).
 */
export default class NodePropSet extends Op {
  /** Node ID */
  readonly node: string;

  /** Property key */
  readonly key: string;

  /** Property value (any JSON-serializable type) */
  readonly value: unknown;

  /**
   * Creates a NodePropSet operation.
   */
  constructor(node: string, key: string, value: unknown) {
    super('NodePropSet', OP_SCOPE_CANONICAL);
    assertNonEmptyString(node, 'NodePropSet', 'node');
    assertNonEmptyString(key, 'NodePropSet', 'key');
    assertNoReservedBytes(node, 'NodePropSet', 'node');
    assertNoReservedBytes(key, 'NodePropSet', 'key');
    this.node = node;
    this.key = key;
    this.value = value;
    Object.freeze(this);
  }
}
