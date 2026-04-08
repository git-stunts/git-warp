/**
 * EdgeRemove — removes an edge by tombstoning observed dots.
 *
 * @module domain/types/ops/EdgeRemove
 */

import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes, assertArray } from './validate.ts';

/**
 * Removes a directed edge from the graph's OR-Set by tombstoning observed dots.
 */
export default class EdgeRemove extends Op {
  /** Source node ID */
  readonly from: string;

  /** Target node ID */
  readonly to: string;

  /** Edge label/type */
  readonly label: string;

  /** Encoded dot strings being removed */
  readonly observedDots: readonly string[];

  /**
   * Creates an EdgeRemove operation.
   */
  constructor({ from, to, label, observedDots }: { from: string; to: string; label: string; observedDots: string[] }) {
    super('EdgeRemove');
    assertNonEmptyString(from, 'EdgeRemove', 'from');
    assertNonEmptyString(to, 'EdgeRemove', 'to');
    assertNonEmptyString(label, 'EdgeRemove', 'label');
    assertNoReservedBytes(from, 'EdgeRemove', 'from');
    assertNoReservedBytes(to, 'EdgeRemove', 'to');
    assertNoReservedBytes(label, 'EdgeRemove', 'label');
    assertArray(observedDots, 'EdgeRemove', 'observedDots');
    for (let i = 0; i < observedDots.length; i += 1) {
      assertNonEmptyString(observedDots[i], 'EdgeRemove', `observedDots[${i}]`);
    }
    this.from = from;
    this.to = to;
    this.label = label;
    this.observedDots = Object.freeze([...observedDots]);
    Object.freeze(this);
  }
}
