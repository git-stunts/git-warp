/**
 * StrandController — encapsulates strand and conflict analysis operations.
 *
 * Extracted from strand.methods.js and conflict.methods.js. WarpRuntime
 * delegates directly to this controller via defineProperty loops.
 *
 * @module domain/services/controllers/StrandController
 */

import createStrandCoordinator from '../strand/createStrandCoordinator.ts';
import { ConflictAnalyzerService } from '../strand/ConflictAnalyzerService.ts';
import type WarpRuntime from '../../WarpRuntime.ts';
import type StrandCoordinator from '../strand/StrandCoordinator.ts';
import type { StrandDescriptor, StrandQueuedIntent, StrandTickRecord } from '../strand/strandTypes.ts';
import type { ConflictAnalyzeOptions } from '../strand/ConflictAnalysisRequest.ts';
import type ConflictAnalysis from '../../types/conflict/ConflictAnalysis.ts';
import type { WarpState } from '../JoinReducer.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { PatchBuilder } from '../PatchBuilder.js';
import type Patch from '../../types/Patch.ts';

type StrandHost = WarpRuntime;

/**
 * The build callback shape expected by StrandCoordinator.patch /
 * .queueIntent. StrandCoordinator currently types its builder parameter
 * loosely to break a circular import (see 0025B3 — strand conflict-data
 * modeling). Importing the shape via Parameters<> lets StrandController
 * hand the builder across without introducing `unknown` textually here.
 */
type StrandBuildCallback = Parameters<StrandCoordinator['patch']>[1];

/**
 * Assertion narrowing a WarpRuntime host to the strand coordinator's
 * parameter type. WarpRuntime satisfies the coordinator's structural
 * requirement at runtime; the assertion declares that compatibility
 * without a value-level cast.
 */
function assertStrandCoordinatorHost(
  host: StrandHost,
): asserts host is StrandHost & Parameters<typeof createStrandCoordinator>[0] {
  void host;
}

export default class StrandController {
  _host: StrandHost;
  _strandService: StrandCoordinator;

  constructor(host: StrandHost) {
    assertStrandCoordinatorHost(host);
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

  async materializeStrand(strandId: string, options?: { receipts?: boolean; ceiling?: number | null }): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }> {
    // TODO(0025B3): StrandCoordinator.materialize() returns a loose type
    // to avoid circular imports. When strand conflict-data modeling lands,
    // the coordinator will expose concrete union return types and this
    // cast disappears.
    return await this._strandService.materialize(strandId, options) as WarpState | { state: WarpState; receipts: TickReceipt[] };
  }

  async getStrandPatches(strandId: string, options?: { ceiling?: number | null }): Promise<Array<{ patch: Patch; sha: string }>> {
    // TODO(0025B3): the coordinator returns an untyped patch shape to
    // avoid a circular Patch import. The concrete patch type is known
    // at this controller boundary.
    return await this._strandService.getPatchEntries(strandId, options) as Array<{ patch: Patch; sha: string }>;
  }

  async patchesForStrand(strandId: string, entityId: string, options?: { ceiling?: number | null }): Promise<string[]> {
    return await this._strandService.patchesFor(strandId, entityId, options);
  }

  // ── Strand patching ─────────────────────────────────────────────────────

  async createStrandPatch(strandId: string): Promise<PatchBuilder> {
    // TODO(0025B3): strand coordinator returns a loose builder type.
    return await this._strandService.createPatchBuilder(strandId) as PatchBuilder;
  }

  async patchStrand(strandId: string, build: (p: PatchBuilder) => void | Promise<void>): Promise<string> {
    // TODO(0025B3): strand coordinator accepts a loose builder callback.
    return await this._strandService.patch(strandId, build as StrandBuildCallback);
  }

  // ── Speculative intents ─────────────────────────────────────────────────

  async queueStrandIntent(strandId: string, build: (p: PatchBuilder) => void | Promise<void>): Promise<StrandQueuedIntent> {
    // TODO(0025B3): strand coordinator types this loosely for the same
    // circular-import reason as .patch().
    return await this._strandService.queueIntent(strandId, build as StrandBuildCallback) as StrandQueuedIntent;
  }

  async listStrandIntents(strandId: string): Promise<ReadonlyArray<StrandQueuedIntent>> {
    // TODO(0025B3): concrete return type known here, loose at the coordinator.
    return await this._strandService.listIntents(strandId) as ReadonlyArray<StrandQueuedIntent>;
  }

  async tickStrand(strandId: string): Promise<StrandTickRecord> {
    // TODO(0025B3): concrete return type known here, loose at the coordinator.
    return await this._strandService.tick(strandId) as StrandTickRecord;
  }

  // ── Conflict analysis ───────────────────────────────────────────────────

  async analyzeConflicts(options?: ConflictAnalyzeOptions): Promise<ConflictAnalysis> {
    const analyzer = new ConflictAnalyzerService({ graph: this._host });
    return await analyzer.analyze(options);
  }
}
