/**
 * NodeRemove — removes a node by tombstoning observed dots.
 *
 * @module domain/types/ops/NodeRemove
 */

import Op from './Op.js';
import { assertNonEmptyString, assertArray } from './validate.js';

/**
 * Removes a node from the graph's OR-Set by tombstoning observed dots.
 */
export default class NodeRemove extends Op {
  /** @type {string} Node ID to remove */
  node;

  /** @type {readonly string[]} Encoded dot strings being removed */
  observedDots;

  /**
   * Creates a NodeRemove operation.
   *
   * @param {string} node - Non-empty node ID
   * @param {string[]} observedDots - Encoded dot strings (add events observed)
   */
  constructor(node, observedDots) {
    super('NodeRemove');
    assertNonEmptyString(node, 'NodeRemove', 'node');
    assertArray(observedDots, 'NodeRemove', 'observedDots');
    this.node = node;
    this.observedDots = Object.freeze([...observedDots]);
    Object.freeze(this);
  }
}
