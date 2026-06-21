/**
 * StrandController — encapsulates strand and conflict analysis operations.
 *
 * Extracted from strand.methods.js and conflict.methods.js. WarpRuntime
 * delegates directly to this controller via defineProperty loops.
 *
 * @module domain/services/controllers/StrandController
 */

import createStrandCoordinator, { type StrandCoordinatorGraphRuntime } from '../strand/createStrandCoordinator.ts';
import { ConflictAnalyzerService } from '../strand/ConflictAnalyzerService.ts';
import type StrandCoordinator from '../strand/StrandCoordinator.ts';
import type { StrandDescriptor, StrandQueuedIntent, StrandTickRecord } from '../strand/strandTypes.ts';
import type { ConflictAnalyzeOptions } from '../strand/ConflictAnalysisRequest.ts';
import type ConflictAnalysis from '../../types/conflict/ConflictAnalysis.ts';
import type { WarpState } from '../JoinReducer.ts';
import type SnapshotWarpState from '../snapshot/SnapshotWarpState.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { PatchBuilder } from '../PatchBuilder.ts';
import type Patch from '../../types/Patch.ts';

export type StrandHost = StrandCoordinatorGraphRuntime & {
  _loadWriterPatches(writerId: string): Promise<Array<{ patch: Patch; sha: string }>>;
};

export default class StrandController {
  _host: StrandHost;
  _strandService: StrandCoordinator;

  constructor(host: StrandHost) {
    this._host = host;
    this._strandService = createStrandCoordinator(host);
  }

  // ── Strand lifecycle ────────────────────────────────────────────────────

  async createStrand(options?: { strandId?: string; lamportCeiling?: number | null; owner?: string | null; scope?: string | null; leaseExpiresAt?: string | null }): Promise<StrandDescriptor> {
    return await this._strandService.create(options);
  }

  async braidStrand(strandId: string, options?: { braidedStrandIds?: string[]; writable?: boolean | null }): Promise<StrandDescriptor> {
    return await this._strandService.braid(strandId, options);
  }

  async getStrand(strandId: string): Promise<StrandDescriptor | null> {
    return await this._strandService.get(strandId);
  }

  async listStrands(): Promise<StrandDescriptor[]> {
    return await this._strandService.list();
  }

  async dropStrand(strandId: string): Promise<boolean> {
    return await this._strandService.drop(strandId);
  }

  // ── Strand materialization & queries ─────────────────────────────────────

  async materializeStrand(strandId: string, options?: { receipts?: boolean; ceiling?: number | null }): Promise<SnapshotWarpState | { state: SnapshotWarpState; receipts: readonly TickReceipt[] }> {
    return await this._strandService.materialize(strandId, options);
  }

  async _materializeStrandLive(strandId: string, options?: { receipts?: boolean; ceiling?: number | null }): Promise<{ state: WarpState; receipts: readonly TickReceipt[] }> {
    return await this._strandService.materializeLiveState(strandId, options);
  }

  async _materializeStrandRead(strandId: string, options?: { receipts?: boolean; ceiling?: number | null }): Promise<{ state: WarpState; receipts: readonly TickReceipt[] }> {
    return await this._strandService.materializeReadState(strandId, options);
  }

  async getStrandPatches(strandId: string, options?: { ceiling?: number | null }): Promise<Array<{ patch: Patch; sha: string }>> {
    return await this._strandService.getPatchEntries(strandId, options) as Array<{ patch: Patch; sha: string }>;
  }

  async patchesForStrand(strandId: string, entityId: string, options?: { ceiling?: number | null }): Promise<string[]> {
    return await this._strandService.patchesFor(strandId, entityId, options);
  }

  // ── Strand patching ─────────────────────────────────────────────────────

  async createStrandPatch(strandId: string): Promise<PatchBuilder> {
    return await this._strandService.createPatchBuilder(strandId);
  }

  async patchStrand(strandId: string, build: (p: PatchBuilder) => void | Promise<void>): Promise<string> {
    return await this._strandService.patch(strandId, build);
  }

  // ── Speculative intents ─────────────────────────────────────────────────

  async queueStrandIntent(strandId: string, build: (p: PatchBuilder) => void | Promise<void>): Promise<StrandQueuedIntent> {
    return await this._strandService.queueIntent(strandId, build);
  }

  async listStrandIntents(strandId: string): Promise<ReadonlyArray<StrandQueuedIntent>> {
    return await this._strandService.listIntents(strandId);
  }

  async tickStrand(strandId: string): Promise<StrandTickRecord> {
    return await this._strandService.tick(strandId);
  }

  // ── Conflict analysis ───────────────────────────────────────────────────

  async analyzeConflicts(options?: ConflictAnalyzeOptions): Promise<ConflictAnalysis> {
    const analyzer = new ConflictAnalyzerService({ graph: this._host });
    return await analyzer.analyze(options);
  }
}
