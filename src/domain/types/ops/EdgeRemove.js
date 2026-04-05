/**
 * EdgeRemove — removes an edge by tombstoning observed dots.
 *
 * @module domain/types/ops/EdgeRemove
 */

import Op from './Op.js';
import { assertNonEmptyString, assertArray } from './validate.js';

/**
 * Removes a directed edge from the graph's OR-Set by tombstoning observed dots.
 */
export default class EdgeRemove extends Op {
  /** @type {string} Source node ID */
  from;

  /** @type {string} Target node ID */
  to;

  /** @type {string} Edge label/type */
  label;

  /** @type {readonly string[]} Encoded dot strings being removed */
  observedDots;

  /**
   * Creates an EdgeRemove operation.
   *
   * @param {{ from: string, to: string, label: string, observedDots: string[] }} fields
   */
  constructor({ from, to, label, observedDots }) {
    super('EdgeRemove');
    assertNonEmptyString(from, 'EdgeRemove', 'from');
    assertNonEmptyString(to, 'EdgeRemove', 'to');
    assertNonEmptyString(label, 'EdgeRemove', 'label');
    assertArray(observedDots, 'EdgeRemove', 'observedDots');
    this.from = from;
    this.to = to;
    this.label = label;
    this.observedDots = Object.freeze([...observedDots]);
    Object.freeze(this);
  }
}
