/**
 * NodeAdd — adds a node to the graph with a causal dot.
 *
 * @module domain/types/ops/NodeAdd
 */

import { Dot } from '../../crdt/Dot.js';
import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';

/**
 * Adds a node to the graph's OR-Set with a unique dot.
 */
export default class NodeAdd extends Op {
  /** Node ID to add */
  readonly node: string;

  /** Causal identifier for this add */
  readonly dot: Dot;

  /**
   * Creates a NodeAdd operation.
   */
  constructor(node: string, dot: Dot) {
    super('NodeAdd');
    assertNonEmptyString(node, 'NodeAdd', 'node');
    assertNoReservedBytes(node, 'NodeAdd', 'node');
    if (!(dot instanceof Dot)) {
      throw new Error('NodeAdd requires dot to be a Dot instance');
    }
    this.node = node;
    this.dot = dot;
    Object.freeze(this);
  }
}
