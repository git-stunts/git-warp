/**
 * GCMetrics — a frozen snapshot of garbage-collection statistics
 * derived from a WARP V5 state.
 *
 * Instances are immutable value objects. Construct via
 * `GCMetrics.fromState(state)`; the factory walks the state's ORSets
 * (which own the counting behavior) and freezes the result.
 *
 * @module domain/services/GCMetrics
 */

import type WarpState from './state/WarpState.ts';

/**
 * Immutable snapshot of GC-relevant counters for a materialized state.
 */
export default class GCMetrics {
  /** Total dot entries (tombstoned + live) in `nodeAlive`. */
  readonly nodeEntries: number;

  /** Total dot entries (tombstoned + live) in `edgeAlive`. */
  readonly edgeEntries: number;

  /** `nodeEntries + edgeEntries`. */
  readonly totalEntries: number;

  /** Tombstoned dots in `nodeAlive` that reference entry dots. */
  readonly nodeTombstones: number;

  /** Tombstoned dots in `edgeAlive` that reference entry dots. */
  readonly edgeTombstones: number;

  /** `nodeTombstones + edgeTombstones`. */
  readonly totalTombstones: number;

  /** Live (non-tombstoned) dots in `nodeAlive`. */
  readonly nodeLiveDots: number;

  /** Live (non-tombstoned) dots in `edgeAlive`. */
  readonly edgeLiveDots: number;

  /** `nodeLiveDots + edgeLiveDots`. */
  readonly totalLiveDots: number;

  /**
   * Ratio of tombstones to `tombstones + liveDots`. `0` when both are
   * zero (empty state). Never `NaN`, never negative, always in `[0, 1]`.
   */
  readonly tombstoneRatio: number;

  constructor(fields: {
    readonly nodeEntries: number;
    readonly edgeEntries: number;
    readonly nodeTombstones: number;
    readonly edgeTombstones: number;
    readonly nodeLiveDots: number;
    readonly edgeLiveDots: number;
  }) {
    this.nodeEntries = fields.nodeEntries;
    this.edgeEntries = fields.edgeEntries;
    this.totalEntries = fields.nodeEntries + fields.edgeEntries;
    this.nodeTombstones = fields.nodeTombstones;
    this.edgeTombstones = fields.edgeTombstones;
    this.totalTombstones = fields.nodeTombstones + fields.edgeTombstones;
    this.nodeLiveDots = fields.nodeLiveDots;
    this.edgeLiveDots = fields.edgeLiveDots;
    this.totalLiveDots = fields.nodeLiveDots + fields.edgeLiveDots;
    const denominator = this.totalTombstones + this.totalLiveDots;
    this.tombstoneRatio = denominator > 0 ? this.totalTombstones / denominator : 0;
    Object.freeze(this);
  }

  /**
   * Collects a GCMetrics snapshot from a materialized WARP state.
   */
  static fromState(state: WarpState): GCMetrics {
    return new GCMetrics({
      nodeEntries: state.nodeAlive.countEntries(),
      edgeEntries: state.edgeAlive.countEntries(),
      nodeTombstones: state.nodeAlive.countTombstones(),
      edgeTombstones: state.edgeAlive.countTombstones(),
      nodeLiveDots: state.nodeAlive.countLiveDots(),
      edgeLiveDots: state.edgeAlive.countLiveDots(),
    });
  }
}
