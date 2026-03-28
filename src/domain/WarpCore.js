import WarpRuntime from './WarpRuntime.js';
import { toInternalStrandShape, toPublicStrandShape } from './utils/strandPublicShape.js';
import {
  buildCoordinateComparisonFact,
  buildCoordinateTransferPlanFact,
} from './services/CoordinateFactExport.js';
import { computeChecksum } from './utils/checksumUtils.js';

/** @typedef {Parameters<WarpRuntime['braidWorkingSet']>[1]} InternalBraidWorkingSetOptions */
/** @typedef {Parameters<WarpRuntime['materializeWorkingSet']>[1]} InternalMaterializeWorkingSetOptions */
/** @typedef {Parameters<WarpRuntime['compareWorkingSet']>[1]} InternalCompareWorkingSetOptions */
/** @typedef {Parameters<WarpRuntime['planWorkingSetTransfer']>[1]} InternalPlanWorkingSetTransferOptions */
/** @typedef {Parameters<WarpRuntime['compareCoordinates']>[0]} InternalCompareCoordinatesOptions */
/** @typedef {Parameters<WarpRuntime['planCoordinateTransfer']>[0]} InternalPlanCoordinateTransferOptions */
/** @typedef {Parameters<WarpRuntime['analyzeConflicts']>[0]} InternalConflictAnalyzeOptions */

/**
 * @param {WarpCore} graph
 * @param {import('../../index.js').CoordinateComparisonV1} comparison
 * @returns {Promise<import('../../index.js').CoordinateComparisonV1>}
 */
async function refreshPublicComparisonDigest(graph, comparison) {
  const fact = buildCoordinateComparisonFact(comparison);
  const crypto = /** @type {(WarpCore & { _crypto: import('../../index.js').CryptoPort })} */ (/** @type {unknown} */ (graph))._crypto;
  return {
    ...comparison,
    comparisonDigest: await computeChecksum(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (fact)), crypto),
  };
}

/**
 * @param {WarpCore} graph
 * @param {import('../../index.js').CoordinateTransferPlanV1} transferPlan
 * @returns {Promise<import('../../index.js').CoordinateTransferPlanV1>}
 */
async function refreshPublicTransferDigest(graph, transferPlan) {
  const fact = buildCoordinateTransferPlanFact(transferPlan);
  const crypto = /** @type {(WarpCore & { _crypto: import('../../index.js').CryptoPort })} */ (/** @type {unknown} */ (graph))._crypto;
  return {
    ...transferPlan,
    transferDigest: await computeChecksum(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (fact)), crypto),
  };
}

/**
 * Full plumbing-facing WARP surface.
 *
 * `WarpCore` is the honest substrate/tooling entrypoint for replay,
 * materialization, provenance, comparison, and other low-level mechanics.
 * It adopts the existing runtime implementation rather than forking it.
 */
export default class WarpCore {
  /**
   * Opens or creates a multi-writer graph and returns the full core surface.
   *
   * @param {Parameters<typeof WarpRuntime.open>[0]} options
   * @returns {Promise<WarpCore>}
   */
  static async open(options) {
    const runtime = await WarpRuntime.open(options);
    return WarpCore._adopt(runtime);
  }

  /**
   * @param {WarpRuntime | WarpCore} runtime
   * @returns {WarpCore}
   * @internal
   */
  static _adopt(runtime) {
    if (runtime instanceof WarpCore) {
      return runtime;
    }
    Object.setPrototypeOf(runtime, WarpCore.prototype);
    return /** @type {WarpCore} */ (/** @type {unknown} */ (runtime));
  }

  /**
   * Creates a durable strand descriptor pinned to the current frontier.
   *
   * @param {import('../../index.js').StrandCreateOptions} [options]
   * @returns {Promise<import('../../index.js').StrandDescriptor>}
   */
  async createStrand(options) {
    return /** @type {import('../../index.js').StrandDescriptor} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.createWorkingSet.call(this, toInternalStrandShape(options)),
        )
      )
    );
  }

  /**
   * Loads a previously-created strand descriptor.
   *
   * @param {string} strandId
   * @returns {Promise<import('../../index.js').StrandDescriptor | null>}
   */
  async getStrand(strandId) {
    return /** @type {import('../../index.js').StrandDescriptor | null} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.getWorkingSet.call(this, strandId),
        )
      )
    );
  }

  /**
   * Lists all strand descriptors stored for this graph.
   *
   * @returns {Promise<import('../../index.js').StrandDescriptor[]>}
   */
  async listStrands() {
    return /** @type {import('../../index.js').StrandDescriptor[]} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.listWorkingSets.call(this),
        )
      )
    );
  }

  /**
   * Pins one or more support overlays as braid inputs on a target strand.
   *
   * @param {string} strandId
   * @param {import('../../index.js').StrandBraidOptions} [options]
   * @returns {Promise<import('../../index.js').StrandDescriptor>}
   */
  async braidStrand(strandId, options) {
    return /** @type {import('../../index.js').StrandDescriptor} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.braidWorkingSet.call(
            this,
            strandId,
            /** @type {InternalBraidWorkingSetOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
          ),
        )
      )
    );
  }

  /**
   * Drops a strand descriptor by id.
   *
   * @param {string} strandId
   * @returns {Promise<boolean>}
   */
  async dropStrand(strandId) {
    return await WarpRuntime.prototype.dropWorkingSet.call(this, strandId);
  }

  /**
   * Advanced substrate replay primitive for a strand's pinned base observation plus overlay.
   *
   * @param {string} strandId
   * @param {{ receipts?: boolean, ceiling?: number|null }} [options]
   * @returns {Promise<import('./services/JoinReducer.js').WarpStateV5|{state: import('./services/JoinReducer.js').WarpStateV5, receipts: import('./types/TickReceipt.js').TickReceipt[]}>}
   */
  async materializeStrand(strandId, options) {
    return await /** @type {Promise<import('./services/JoinReducer.js').WarpStateV5|{state: import('./services/JoinReducer.js').WarpStateV5, receipts: import('./types/TickReceipt.js').TickReceipt[]}>} */ (
      /** @type {unknown} */ (
        WarpRuntime.prototype.materializeWorkingSet.call(
          this,
          strandId,
          /** @type {InternalMaterializeWorkingSetOptions | undefined} */ (/** @type {unknown} */ (options)),
        )
      )
    );
  }

  /**
   * Returns the causal patch entries visible inside a strand.
   *
   * @param {string} strandId
   * @param {Record<string, unknown>} [options]
   * @returns {Promise<unknown>}
   */
  async getStrandPatches(strandId, options) {
    return await /** @type {Promise<Array<{ patch: import('./types/WarpTypesV2.js').PatchV2, sha: string }>>} */ (
      /** @type {unknown} */ (WarpRuntime.prototype.getWorkingSetPatches.call(this, strandId, options))
    );
  }

  /**
   * Returns the visible patch SHAs that touched one entity inside a strand.
   *
   * @param {string} strandId
   * @param {string} entityId
   * @param {Record<string, unknown>} [options]
   * @returns {Promise<string[]>}
   */
  async patchesForStrand(strandId, entityId, options) {
    return await WarpRuntime.prototype.patchesForWorkingSet.call(this, strandId, entityId, options);
  }

  /**
   * Creates a patch builder that writes into a strand's overlay patch-log.
   *
   * @param {string} strandId
   * @returns {Promise<import('./services/PatchBuilderV2.js').PatchBuilderV2>}
   */
  async createStrandPatch(strandId) {
    return await WarpRuntime.prototype.createWorkingSetPatch.call(this, strandId);
  }

  /**
   * Convenience wrapper that creates and commits a strand overlay patch.
   *
   * @param {string} strandId
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void|Promise<void>} build
   * @returns {Promise<string>}
   */
  async patchStrand(strandId, build) {
    return await WarpRuntime.prototype.patchWorkingSet.call(this, strandId, build);
  }

  /**
   * Queues a patch-shaped intent against a strand without advancing its overlay.
   *
   * @param {string} strandId
   * @param {(patch: import('./services/PatchBuilderV2.js').PatchBuilderV2) => void|Promise<void>} build
   * @returns {Promise<import('../../index.js').StrandIntentDescriptor>}
   */
  async queueStrandIntent(strandId, build) {
    return /** @type {import('../../index.js').StrandIntentDescriptor} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.queueWorkingSetIntent.call(this, strandId, build),
        )
      )
    );
  }

  /**
   * Lists the currently queued intents for one strand.
   *
   * @param {string} strandId
   * @returns {Promise<import('../../index.js').StrandIntentDescriptor[]>}
   */
  async listStrandIntents(strandId) {
    return /** @type {import('../../index.js').StrandIntentDescriptor[]} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.listWorkingSetIntents.call(this, strandId),
        )
      )
    );
  }

  /**
   * Deterministically drains the queued intent set for one strand.
   *
   * @param {string} strandId
   * @returns {Promise<import('../../index.js').StrandTickRecord>}
   */
  async tickStrand(strandId) {
    return /** @type {import('../../index.js').StrandTickRecord} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.tickWorkingSet.call(this, strandId),
        )
      )
    );
  }

  /**
   * Compares a strand against its base observation, the live frontier, or another strand.
   *
   * @param {string} strandId
   * @param {{
   *   against?: 'base'|'live'|{ kind: 'strand', strandId: string },
   *   ceiling?: number|null,
   *   againstCeiling?: number|null,
   *   targetId?: string|null,
   *   scope?: import('../../index.js').VisibleStateScopeV1|null
   * }} [options]
   * @returns {Promise<import('../../index.js').CoordinateComparisonV1>}
   */
  async compareStrand(strandId, options) {
    const comparison = /** @type {import('../../index.js').CoordinateComparisonV1} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.compareWorkingSet.call(
            this,
            strandId,
            /** @type {InternalCompareWorkingSetOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
          ),
        )
      )
    );
    return await refreshPublicComparisonDigest(this, comparison);
  }

  /**
   * Plans a deterministic transfer from a strand into live truth, its pinned base observation, or another strand.
   *
   * @param {string} strandId
   * @param {{
   *   into?: 'base'|'live'|{ kind: 'strand', strandId: string },
   *   ceiling?: number|null,
   *   intoCeiling?: number|null,
   *   scope?: import('../../index.js').VisibleStateScopeV1|null
   * }} [options]
   * @returns {Promise<import('../../index.js').CoordinateTransferPlanV1>}
   */
  async planStrandTransfer(strandId, options) {
    const transferPlan = /** @type {import('../../index.js').CoordinateTransferPlanV1} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.planWorkingSetTransfer.call(
            this,
            strandId,
            /** @type {InternalPlanWorkingSetTransferOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
          ),
        )
      )
    );
    return await refreshPublicTransferDigest(this, transferPlan);
  }

  /**
   * @param {{
   *   left: import('../../index.js').CoordinateComparisonSelectorV1,
   *   right: import('../../index.js').CoordinateComparisonSelectorV1,
   *   targetId?: string|null,
   *   scope?: import('../../index.js').VisibleStateScopeV1|null
   * }} options
   * @returns {Promise<import('../../index.js').CoordinateComparisonV1>}
   */
  async compareCoordinates(options) {
    const comparison = /** @type {import('../../index.js').CoordinateComparisonV1} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.compareCoordinates.call(
            this,
            /** @type {InternalCompareCoordinatesOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
          ),
        )
      )
    );
    return await refreshPublicComparisonDigest(this, comparison);
  }

  /**
   * @param {{
   *   source: import('../../index.js').CoordinateTransferPlanSelectorV1,
   *   target: import('../../index.js').CoordinateTransferPlanSelectorV1,
   *   scope?: import('../../index.js').VisibleStateScopeV1|null
   * }} options
   * @returns {Promise<import('../../index.js').CoordinateTransferPlanV1>}
   */
  async planCoordinateTransfer(options) {
    const transferPlan = /** @type {import('../../index.js').CoordinateTransferPlanV1} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.planCoordinateTransfer.call(
            this,
            /** @type {InternalPlanCoordinateTransferOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
          ),
        )
      )
    );
    return await refreshPublicTransferDigest(this, transferPlan);
  }

  /**
   * @param {import('./services/ConflictAnalyzerService.js').ConflictAnalyzeOptions} [options]
   * @returns {Promise<import('./services/ConflictAnalyzerService.js').ConflictAnalysis>}
   */
  async analyzeConflicts(options) {
    return /** @type {import('./services/ConflictAnalyzerService.js').ConflictAnalysis} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.analyzeConflicts.call(
            this,
            /** @type {InternalConflictAnalyzeOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
          ),
        )
      )
    );
  }

  /**
   * Removed in v15. Use `createStrand()`.
   */
  createWorkingSet() {
    throw new Error('createWorkingSet() was removed in v15. Use createStrand().');
  }

  /**
   * Removed in v15. Use `getStrand()`.
   */
  getWorkingSet() {
    throw new Error('getWorkingSet() was removed in v15. Use getStrand().');
  }

  /**
   * Removed in v15. Use `listStrands()`.
   */
  listWorkingSets() {
    throw new Error('listWorkingSets() was removed in v15. Use listStrands().');
  }

  /**
   * Removed in v15. Use `braidStrand()`.
   */
  braidWorkingSet() {
    throw new Error('braidWorkingSet() was removed in v15. Use braidStrand().');
  }

  /**
   * Removed in v15. Use `dropStrand()`.
   */
  dropWorkingSet() {
    throw new Error('dropWorkingSet() was removed in v15. Use dropStrand().');
  }

  /**
   * Removed in v15. Use `materializeStrand()`.
   */
  materializeWorkingSet() {
    throw new Error('materializeWorkingSet() was removed in v15. Use materializeStrand().');
  }

  /**
   * Removed in v15. Use `getStrandPatches()`.
   */
  getWorkingSetPatches() {
    throw new Error('getWorkingSetPatches() was removed in v15. Use getStrandPatches().');
  }

  /**
   * Removed in v15. Use `patchesForStrand()`.
   */
  patchesForWorkingSet() {
    throw new Error('patchesForWorkingSet() was removed in v15. Use patchesForStrand().');
  }

  /**
   * Removed in v15. Use `createStrandPatch()`.
   */
  createWorkingSetPatch() {
    throw new Error('createWorkingSetPatch() was removed in v15. Use createStrandPatch().');
  }

  /**
   * Removed in v15. Use `patchStrand()`.
   */
  patchWorkingSet() {
    throw new Error('patchWorkingSet() was removed in v15. Use patchStrand().');
  }

  /**
   * Removed in v15. Use `queueStrandIntent()`.
   */
  queueWorkingSetIntent() {
    throw new Error('queueWorkingSetIntent() was removed in v15. Use queueStrandIntent().');
  }

  /**
   * Removed in v15. Use `listStrandIntents()`.
   */
  listWorkingSetIntents() {
    throw new Error('listWorkingSetIntents() was removed in v15. Use listStrandIntents().');
  }

  /**
   * Removed in v15. Use `tickStrand()`.
   */
  tickWorkingSet() {
    throw new Error('tickWorkingSet() was removed in v15. Use tickStrand().');
  }

  /**
   * Removed in v15. Use `compareStrand()`.
   */
  compareWorkingSet() {
    throw new Error('compareWorkingSet() was removed in v15. Use compareStrand().');
  }

  /**
   * Removed in v15. Use `planStrandTransfer()`.
   */
  planWorkingSetTransfer() {
    throw new Error('planWorkingSetTransfer() was removed in v15. Use planStrandTransfer().');
  }
}

Object.setPrototypeOf(WarpCore.prototype, WarpRuntime.prototype);
