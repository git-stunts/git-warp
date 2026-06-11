/**
 * GCPolicy — garbage collection thresholds for the current WARP state.
 *
 * Instances are immutable value objects. `evaluate()` checks a set of
 * runtime metrics against the thresholds and returns a frozen
 * `GCShouldRunResult` naming every threshold that was exceeded.
 *
 * @module domain/services/GCPolicy
 */

import GCShouldRunResult from './GCShouldRunResult.ts';

/**
 * Runtime measurements supplied to `evaluate()`. This is a parameter
 * bag — a value object named `GCInputMetrics` would be overkill for a
 * single evaluation boundary with four numeric fields.
 */
export type GCPolicyInput = {
  readonly tombstoneRatio: number;
  readonly totalEntries: number;
  readonly patchesSinceCompaction: number;
  readonly ticksSinceCompaction: number;
};

/**
 * Partial configuration accepted at the API boundary
 * (`RuntimeHost.open({ gcPolicy })`). Any fields the caller omits are
 * filled from `GCPolicy.DEFAULT`.
 */
export type GCPolicyConfig = {
  readonly enabled?: boolean;
  readonly tombstoneRatioThreshold?: number;
  readonly entryCountThreshold?: number;
  readonly minPatchesSinceCompaction?: number;
  readonly maxTicksSinceCompaction?: number;
  readonly compactOnCheckpoint?: boolean;
};

const DEFAULT_TOMBSTONE_RATIO_THRESHOLD = 0.3;
const DEFAULT_ENTRY_COUNT_THRESHOLD = 50_000;
const DEFAULT_MIN_PATCHES_SINCE_COMPACTION = 1_000;
const DEFAULT_MAX_TICKS_SINCE_COMPACTION = 10_000;

export default class GCPolicy {
  /** When false, automatic GC is disabled even if thresholds are met. */
  readonly enabled: boolean;

  /** Tombstone ratio (0..1) that triggers GC. */
  readonly tombstoneRatioThreshold: number;

  /** Total entry count that triggers GC. */
  readonly entryCountThreshold: number;

  /** Minimum patches between GCs. */
  readonly minPatchesSinceCompaction: number;

  /** Maximum lamport ticks between GCs. */
  readonly maxTicksSinceCompaction: number;

  /** Whether to auto-compact on checkpoint. */
  readonly compactOnCheckpoint: boolean;

  constructor(fields: {
    readonly enabled: boolean;
    readonly tombstoneRatioThreshold: number;
    readonly entryCountThreshold: number;
    readonly minPatchesSinceCompaction: number;
    readonly maxTicksSinceCompaction: number;
    readonly compactOnCheckpoint: boolean;
  }) {
    this.enabled = fields.enabled;
    this.tombstoneRatioThreshold = fields.tombstoneRatioThreshold;
    this.entryCountThreshold = fields.entryCountThreshold;
    this.minPatchesSinceCompaction = fields.minPatchesSinceCompaction;
    this.maxTicksSinceCompaction = fields.maxTicksSinceCompaction;
    this.compactOnCheckpoint = fields.compactOnCheckpoint;
    Object.freeze(this);
  }

  /** Default policy — conservative, GC disabled by default (opt-in). */
  static readonly DEFAULT: GCPolicy = new GCPolicy({
    enabled: false,
    tombstoneRatioThreshold: DEFAULT_TOMBSTONE_RATIO_THRESHOLD,
    entryCountThreshold: DEFAULT_ENTRY_COUNT_THRESHOLD,
    minPatchesSinceCompaction: DEFAULT_MIN_PATCHES_SINCE_COMPACTION,
    maxTicksSinceCompaction: DEFAULT_MAX_TICKS_SINCE_COMPACTION,
    compactOnCheckpoint: true,
  });

  /**
   * Evaluates runtime metrics against this policy's thresholds.
   * Returns a `GCShouldRunResult` naming every threshold exceeded;
   * `shouldRun` is true iff any threshold tripped.
   */
  evaluate(input: GCPolicyInput): GCShouldRunResult {
    const reasons: string[] = [];
    if (input.tombstoneRatio > this.tombstoneRatioThreshold) {
      reasons.push(
        `Tombstone ratio ${(input.tombstoneRatio * 100).toFixed(1)}% ` +
        `exceeds threshold ${(this.tombstoneRatioThreshold * 100).toFixed(1)}%`,
      );
    }
    if (input.totalEntries > this.entryCountThreshold) {
      reasons.push(
        `Entry count ${input.totalEntries} exceeds threshold ${this.entryCountThreshold}`,
      );
    }
    if (input.patchesSinceCompaction > this.minPatchesSinceCompaction) {
      reasons.push(
        `Patches since compaction ${input.patchesSinceCompaction} ` +
        `exceeds minimum ${this.minPatchesSinceCompaction}`,
      );
    }
    if (input.ticksSinceCompaction > this.maxTicksSinceCompaction) {
      reasons.push(
        `Ticks since compaction ${input.ticksSinceCompaction} ` +
        `exceeds maximum ${this.maxTicksSinceCompaction}`,
      );
    }
    return new GCShouldRunResult(reasons);
  }
}
