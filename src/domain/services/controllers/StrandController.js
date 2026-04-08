/**
 * StrandController — encapsulates strand and conflict analysis operations.
 *
 * Extracted from strand.methods.js and conflict.methods.js. WarpRuntime
 * delegates directly to this controller via defineProperty loops.
 *
 * @module domain/services/controllers/StrandController
 */

import StrandService from '../strand/StrandService.js';
import ConflictAnalyzerService from '../strand/ConflictAnalyzerService.js';

/**
 * The host interface that StrandController depends on.
 *
 * StrandService and ConflictAnalyzerService both accept `{ graph }` where
 * graph is the full WarpRuntime instance. This typedef documents that
 * coupling explicitly.
 *
 * @typedef {import('../../WarpRuntime.js').default} StrandHost
 */

export default class StrandController {
  /** @type {StrandHost} */
  _host;

  /** @type {StrandService} */
  _strandService;

  /**
   * Creates a StrandController bound to a WarpRuntime host.
   * @param {StrandHost} host - The WarpRuntime instance
   */
  constructor(host) {
    this._host = host;
    this._strandService = new StrandService({ graph: host });
  }

  // ── Strand lifecycle ────────────────────────────────────────────────────

  /**
   * Creates a new strand with the given options.
   * @param {import('../strand/StrandService.js').StrandCreateOptions} [options]
   * @returns {Promise<import('../strand/StrandService.js').StrandDescriptor>}
   */
  async createStrand(options) {
    return await this._strandService.create(options);
  }

  /**
   * Braids a strand, merging its overlay back into the base graph.
   * @param {string} strandId
   * @param {import('../strand/StrandService.js').StrandBraidOptions} [options]
   * @returns {Promise<import('../strand/StrandService.js').StrandDescriptor>}
   */
  async braidStrand(strandId, options) {
    return await this._strandService.braid(strandId, options);
  }

  /**
   * Retrieves the descriptor for a strand by its identifier.
   * @param {string} strandId
   * @returns {Promise<import('../strand/StrandService.js').StrandDescriptor|null>}
   */
  async getStrand(strandId) {
    return await this._strandService.get(strandId);
  }

  /**
   * Lists all strand descriptors in the current graph.
   * @returns {Promise<import('../strand/StrandService.js').StrandDescriptor[]>}
   */
  async listStrands() {
    return await this._strandService.list();
  }

  /**
   * Drops (deletes) a strand, removing its refs and overlay data.
   * @param {string} strandId
   * @returns {Promise<boolean>}
   */
  async dropStrand(strandId) {
    return await this._strandService.drop(strandId);
  }

  // ── Strand materialization & queries ─────────────────────────────────────

  /**
   * Materializes the graph state scoped to a single strand.
   * @param {string} strandId
   * @param {{ receipts?: boolean, ceiling?: number|null }} [options]
   * @returns {Promise<import('../JoinReducer.js').WarpStateV5|{state: import('../JoinReducer.js').WarpStateV5, receipts: import('../../types/TickReceipt.ts').TickReceipt[]}>}
   */
  async materializeStrand(strandId, options) {
    return await this._strandService.materialize(strandId, options);
  }

  /**
   * Retrieves all patch entries belonging to a strand.
   * @param {string} strandId
   * @param {{ ceiling?: number|null }} [options]
   * @returns {Promise<Array<{ patch: import('../../types/Patch.ts').default, sha: string }>>}
   */
  async getStrandPatches(strandId, options) {
    return await this._strandService.getPatchEntries(strandId, options);
  }

  /**
   * Returns the patch SHAs that touched a given entity within a strand.
   * @param {string} strandId
   * @param {string} entityId
   * @param {{ ceiling?: number|null }} [options]
   * @returns {Promise<string[]>}
   */
  async patchesForStrand(strandId, entityId, options) {
    return await this._strandService.patchesFor(strandId, entityId, options);
  }

  // ── Strand patching ─────────────────────────────────────────────────────

  /**
   * Creates a PatchBuilderV2 scoped to a strand for manual patch construction.
   * @param {string} strandId
   * @returns {Promise<import('../PatchBuilderV2.js').PatchBuilderV2>}
   */
  async createStrandPatch(strandId) {
    return await this._strandService.createPatchBuilder(strandId);
  }

  /**
   * Applies a patch to a strand using a builder callback and commits it.
   * @param {string} strandId
   * @param {(p: import('../PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patchStrand(strandId, build) {
    return await this._strandService.patch(strandId, build);
  }

  // ── Speculative intents ─────────────────────────────────────────────────

  /**
   * Queues a speculative intent on a strand without committing it.
   * @param {string} strandId
   * @param {(p: import('../PatchBuilderV2.js').PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<{ intentId: string, enqueuedAt: string, patch: import('../../types/Patch.ts').default, reads: string[], writes: string[], contentBlobOids: string[] }>}
   */
  async queueStrandIntent(strandId, build) {
    return await this._strandService.queueIntent(strandId, build);
  }

  /**
   * Lists all pending intents queued on a strand.
   * @param {string} strandId
   * @returns {Promise<ReadonlyArray<{ intentId: string, enqueuedAt: string, patch: import('../../types/Patch.ts').default, reads: string[], writes: string[], contentBlobOids: string[] }>>}
   */
  async listStrandIntents(strandId) {
    return await this._strandService.listIntents(strandId);
  }

  /**
   * Advances a strand by one tick, draining queued intents with conflict detection.
   * @param {string} strandId
   * @returns {Promise<{ tickId: string, strandId: string, tickIndex: number, createdAt: string, drainedIntentCount: number, admittedIntentIds: string[], rejected: Array<{ intentId: string, reason: string, conflictsWith: string[], reads: string[], writes: string[] }>, baseOverlayHeadPatchSha: string|null, overlayHeadPatchSha: string|null, overlayPatchShas: string[] }>}
   */
  async tickStrand(strandId) {
    return await this._strandService.tick(strandId);
  }

  // ── Conflict analysis ───────────────────────────────────────────────────

  /**
   * Analyze read-only conflict provenance over either the current frontier
   * or an explicit strand, with an optional Lamport ceiling.
   * @param {import('../strand/ConflictAnalyzerService.js').ConflictAnalyzeOptions} [options]
   * @returns {Promise<import('../strand/ConflictAnalyzerService.js').ConflictAnalysis>}
   */
  async analyzeConflicts(options) {
    const analyzer = new ConflictAnalyzerService({ graph: this._host });
    return await analyzer.analyze(options);
  }
}
