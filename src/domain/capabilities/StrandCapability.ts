/**
 * Strand lifecycle, patching, intent queue, and conflict analysis.
 *
 * 14 methods covering the full strand API.
 */

import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type Patch from '../types/Patch.ts';
import type { WarpState } from '../services/JoinReducer.ts';
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

/** Patch with its content-addressable SHA. */
export type StrandPatchEntry = {
  patch: Patch;
  sha: string;
};

/** Result when receipts are requested from strand materialization. */
export type StrandMaterializeWithReceipts = {
  state: WarpState;
  receipts: TickReceipt[];
};

export default abstract class StrandCapability {
  abstract createStrand(_options?: StrandCreateOptions): Promise<StrandDescriptor>;
  abstract braidStrand(_strandId: string, _options?: StrandBraidOptions): Promise<StrandDescriptor>;
  abstract getStrand(_strandId: string): Promise<StrandDescriptor | null>;
  abstract listStrands(): Promise<StrandDescriptor[]>;
  abstract dropStrand(_strandId: string): Promise<boolean>;

  abstract materializeStrand(_strandId: string, _options: { receipts: true; ceiling?: number | null }): Promise<StrandMaterializeWithReceipts>;
  abstract materializeStrand(_strandId: string, _options?: { receipts?: false; ceiling?: number | null }): Promise<WarpState>;

  abstract getStrandPatches(_strandId: string, _options?: { ceiling?: number | null }): Promise<StrandPatchEntry[]>;
  abstract patchesForStrand(_strandId: string, _entityId: string, _options?: { ceiling?: number | null }): Promise<string[]>;
  abstract createStrandPatch(_strandId: string): Promise<PatchBuilder>;
  abstract patchStrand(_strandId: string, _build: (_p: PatchBuilder) => void | Promise<void>): Promise<string>;
  abstract queueStrandIntent(_strandId: string, _build: (_p: PatchBuilder) => void | Promise<void>): Promise<StrandIntentDescriptor>;
  abstract listStrandIntents(_strandId: string): Promise<StrandIntentDescriptor[]>;
  abstract tickStrand(_strandId: string): Promise<StrandTickRecord>;
  abstract analyzeConflicts(_options?: AnalyzeConflictsOptions): Promise<ConflictAnalysis>;
}
