/**
 * EdgeAdd — adds a directed edge to the graph with a causal dot.
 *
 * @module domain/types/ops/EdgeAdd
 */

import { Dot } from '../../crdt/Dot.js';
import Op from './Op.js';
import { assertNonEmptyString, assertNoReservedBytes } from './validate.js';

/**
 * Adds a directed edge to the graph's OR-Set with a unique dot.
 */
export default class EdgeAdd extends Op {
  /** @type {string} Source node ID */
  from;

  /** @type {string} Target node ID */
  to;

  /** @type {string} Edge label/type */
  label;

  /** @type {Dot} Causal identifier for this add */
  dot;

  /**
   * Creates an EdgeAdd operation.
   *
   * @param {{ from: string, to: string, label: string, dot: Dot }} fields
   */
  constructor({ from, to, label, dot }) {
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
