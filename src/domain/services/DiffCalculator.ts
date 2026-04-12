/**
 * DiffCalculator — computes alive-ness transitions and dot reverse
 * indices for an ORSet/state pair.
 *
 * Pure helpers — no state mutation. Used by the reducer's
 * applyWithDiff path and by ReceiptBuilder's *Remove outcome paths
 * (which share the same reverse-index walk).
 *
 * The class exposes only static methods, so there is no instance state
 * or constructor-time freeze contract to satisfy here.
 *
 * @module domain/services/DiffCalculator
 */

import type ORSet from '../crdt/ORSet.ts';
import type WarpState from './state/WarpState.ts';
import type { PatchDiff } from '../types/PatchDiff.ts';
import { decodeEdgeKey } from './KeyCodec.ts';

export default class DiffCalculator {
  /**
   * Builds a reverse map from encoded dot → element ID.
   *
   * Only includes mappings for dots in `targetDots`, so callers can
   * early-terminate the inner loop once every target is accounted for.
   */
  static buildDotToElement(
    orset: ORSet,
    targetDots: ReadonlySet<string>,
  ): Map<string, string> {
    const dotToElement = new Map<string, string>();
    let remaining = targetDots.size;
    for (const [element, dots] of orset.entries) {
      if (remaining === 0) { break; }
      for (const d of dots) {
        if (targetDots.has(d)) {
          dotToElement.set(d, element);
          remaining--;
          if (remaining === 0) { break; }
        }
      }
    }
    return dotToElement;
  }

  /**
   * Collects the set of currently-alive elements that own at least one
   * of `observedDots`. Uses `buildDotToElement` for an O(total_dots +
   * |observedDots|) walk instead of O(N * |observedDots|).
   */
  static aliveElementsForDots(
    orset: ORSet,
    observedDots: ReadonlySet<string>,
  ): Set<string> {
    const result = new Set<string>();
    const dotToElement = DiffCalculator.buildDotToElement(orset, observedDots);
    for (const d of observedDots) {
      const element = dotToElement.get(d);
      if (element !== undefined && !result.has(element) && orset.contains(element)) {
        result.add(element);
      }
    }
    return result;
  }

  /**
   * Records removal only for nodes that were alive BEFORE the op AND
   * are dead AFTER. Mutates `diff.nodesRemoved`.
   */
  static collectNodeRemovals(
    diff: PatchDiff,
    state: WarpState,
    aliveBeforeNodes: ReadonlySet<string> | undefined,
  ): void {
    if (!aliveBeforeNodes) { return; }
    for (const element of aliveBeforeNodes) {
      if (!state.nodeAlive.contains(element)) {
        diff.nodesRemoved.push(element);
      }
    }
  }

  /**
   * Records removal only for edges that were alive BEFORE the op AND
   * are dead AFTER. Mutates `diff.edgesRemoved`.
   */
  static collectEdgeRemovals(
    diff: PatchDiff,
    state: WarpState,
    aliveBeforeEdges: ReadonlySet<string> | undefined,
  ): void {
    if (!aliveBeforeEdges) { return; }
    for (const edgeKey of aliveBeforeEdges) {
      if (!state.edgeAlive.contains(edgeKey)) {
        diff.edgesRemoved.push(decodeEdgeKey(edgeKey));
      }
    }
  }
}
