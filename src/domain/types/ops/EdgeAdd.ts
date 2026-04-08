/**
 * EdgeAdd — adds a directed edge to the graph with a causal dot.
 *
 * @module domain/types/ops/EdgeAdd
 */

import { Dot } from '../../crdt/Dot.js';
import Op from './Op.ts';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.ts';

/**
 * Adds a directed edge to the graph's OR-Set with a unique dot.
 */
export default class EdgeAdd extends Op {
  /** Source node ID */
  readonly from: string;

  /** Target node ID */
  readonly to: string;

  /** Edge label/type */
  readonly label: string;

  /** Causal identifier for this add */
  readonly dot: Dot;

  /**
   * Creates an EdgeAdd operation.
   */
  constructor({ from, to, label, dot }: { from: string; to: string; label: string; dot: Dot }) {
    super('EdgeAdd');
    assertNonEmptyString(from, 'EdgeAdd', 'from');
    assertNonEmptyString(to, 'EdgeAdd', 'to');
    assertNonEmptyString(label, 'EdgeAdd', 'label');
    assertNoReservedBytes(from, 'EdgeAdd', 'from');
    assertNoReservedBytes(to, 'EdgeAdd', 'to');
    assertNoReservedBytes(label, 'EdgeAdd', 'label');
    if (!(dot instanceof Dot)) {
      throw new Error('EdgeAdd requires dot to be a Dot instance');
    }
    this.from = from;
    this.to = to;
    this.label = label;
    this.dot = dot;
    Object.freeze(this);
  }
}
