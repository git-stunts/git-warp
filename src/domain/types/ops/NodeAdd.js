/**
 * NodeAdd — adds a node to the graph with a causal dot.
 *
 * @module domain/types/ops/NodeAdd
 */

import { Dot } from '../../crdt/Dot.js';
import Op from './Op.js';
import { assertNonEmptyString, assertNoBannedBytes } from './validate.js';

/**
 * Adds a node to the graph's OR-Set with a unique dot.
 */
export default class NodeAdd extends Op {
  /** @type {string} Node ID to add */
  node;

  /** @type {Dot} Causal identifier for this add */
  dot;

  /**
   * Creates a NodeAdd operation.
   *
   * @param {string} node - Non-empty node ID (no NUL bytes)
   * @param {Dot} dot - Must be a Dot instance
   */
  constructor(node, dot) {
    super('NodeAdd');
    assertNonEmptyString(node, 'NodeAdd', 'node');
    assertNoBannedBytes(node, 'NodeAdd', 'node');
    if (!(dot instanceof Dot)) {
      throw new Error('NodeAdd requires dot to be a Dot instance');
    }
    this.node = node;
    this.dot = dot;
    Object.freeze(this);
  }
}
