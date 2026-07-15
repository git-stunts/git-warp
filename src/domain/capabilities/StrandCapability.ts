/**
 * Strand lifecycle, patching, intent queue, and conflict analysis.
 *
 * 14 methods covering the full strand API.
 */

import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type Patch from '../types/Patch.ts';
import type SnapshotWarpState from '../services/snapshot/SnapshotWarpState.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';
import type {
  StrandDescriptor,
  StrandCreateOptions,
  StrandBraidOptions,
  StrandIntentDescriptor,
  StrandTickRecord,
} from '../types/StrandDescriptor.ts';
import type ConflictAnalysis from '../types/conflict/ConflictAnalysis.ts';
import type { ConflictAnalyzeOptions as AnalyzeConflictsOptions } from '../services/strand/ConflictAnalysisRequest.ts';
import type { PatchCommitResult } from '../services/PatchCommitter.ts';

/** Patch with its content-addressable SHA. */
export type StrandPatchEntry = {
  patch: Patch;
  sha: string;
};

/** Result when receipts are requested from strand materialization. */
export type StrandMaterializeWithReceipts = {
  state: SnapshotWarpState;
  receipts: readonly TickReceipt[];
};

export default abstract class StrandCapability {
  /** Create a new strand descriptor. */
  abstract createStrand(_options?: StrandCreateOptions): Promise<StrandDescriptor>;

  /** Braid an existing strand onto another coordinate. */
  abstract braidStrand(_strandId: string, _options?: StrandBraidOptions): Promise<StrandDescriptor>;

  /** Load a strand descriptor by id, or null when absent. */
  abstract getStrand(_strandId: string): Promise<StrandDescriptor | null>;

  /** List known strand descriptors. */
  abstract listStrands(): Promise<StrandDescriptor[]>;

  /** Drop a strand descriptor and return whether it existed. */
  abstract dropStrand(_strandId: string): Promise<boolean>;

  /** Diagnostic/speculative-lane snapshot inspection; not a first-use application read path. */
  abstract materializeStrand(_strandId: string, _options: { receipts: true; ceiling?: number | null }): Promise<StrandMaterializeWithReceipts>;
  /** Diagnostic/speculative-lane snapshot inspection; not a first-use application read path. */
  abstract materializeStrand(_strandId: string, _options?: { receipts?: false; ceiling?: number | null }): Promise<SnapshotWarpState>;

  /** Return patches written on a strand, optionally bounded by ceiling. */
  abstract getStrandPatches(_strandId: string, _options?: { ceiling?: number | null }): Promise<StrandPatchEntry[]>;

  /** Return patch SHAs in a strand-local backward cone for an entity id. */
  abstract patchesForStrand(_strandId: string, _entityId: string, _options?: { ceiling?: number | null }): Promise<string[]>;

  /** Start a mutable patch builder for a strand. */
  abstract createStrandPatch(_strandId: string): Promise<PatchBuilder>;

  /** Build and commit one patch to a strand. */
  abstract patchStrand(_strandId: string, _build: (_p: PatchBuilder) => void | Promise<void>): Promise<string>;

  abstract patchStrandWithEvidence(
    _strandId: string,
    _build: (_p: PatchBuilder) => void | Promise<void>,
  ): Promise<PatchCommitResult>;

  /** Queue a strand intent for later ticking. */
  abstract queueStrandIntent(_strandId: string, _build: (_p: PatchBuilder) => void | Promise<void>): Promise<StrandIntentDescriptor>;

  /** List queued strand intents. */
  abstract listStrandIntents(_strandId: string): Promise<StrandIntentDescriptor[]>;

  /** Advance a strand by committing queued intents. */
  abstract tickStrand(_strandId: string): Promise<StrandTickRecord>;

  /** Analyze current strand conflicts. */
  abstract analyzeConflicts(_options?: AnalyzeConflictsOptions): Promise<ConflictAnalysis>;
}
