/**
 * NodeRemove — removes a node by tombstoning observed dots.
 *
 * @module domain/types/ops/NodeRemove
 */

import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes, assertArray } from './validate.ts';

/**
 * Removes a node from the graph's OR-Set by tombstoning observed dots.
 */
export default class NodeRemove extends Op {
  /** Node ID to remove */
  readonly node: string;

  /** Encoded dot strings being removed */
  readonly observedDots: readonly string[];

  /**
   * Creates a NodeRemove operation.
   */
  constructor(node: string, observedDots: string[]) {
    super('NodeRemove');
    assertNonEmptyString(node, 'NodeRemove', 'node');
    assertNoReservedBytes(node, 'NodeRemove', 'node');
    assertArray(observedDots, 'NodeRemove', 'observedDots');
    for (let i = 0; i < observedDots.length; i += 1) {
      assertNonEmptyString(observedDots[i], 'NodeRemove', `observedDots[${i}]`);
    }
    this.node = node;
    this.observedDots = Object.freeze([...observedDots]);
    Object.freeze(this);
  }
}
