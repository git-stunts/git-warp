import WarpRuntime from './WarpRuntime.js';
import { callInternalRuntimeMethod } from './utils/callInternalRuntimeMethod.ts';
import { toInternalStrandShape, toPublicStrandShape } from './utils/strandPublicShape.ts';
import {
  buildCoordinateComparisonFact,
  buildCoordinateTransferPlanFact,
} from './services/CoordinateFactExport.js';
import { computeChecksum } from './utils/checksumUtils.ts';


/** @import { CoordinateComparisonSelectorV1, CoordinateComparisonV1, CoordinateTransferPlanSelectorV1, CoordinateTransferPlanV1, CryptoPort, StrandBraidOptions, StrandCreateOptions, StrandDescriptor, StrandIntentDescriptor, StrandTickRecord, VisibleStateScopeV1 } from '../../index.js' */
/** @typedef {Parameters<WarpRuntime['braidStrand']>[1]} InternalBraidStrandOptions */
/** @typedef {Parameters<WarpRuntime['materializeStrand']>[1]} InternalMaterializeStrandOptions */
/** @typedef {Parameters<WarpRuntime['compareStrand']>[1]} InternalCompareStrandOptions */
/** @typedef {Parameters<WarpRuntime['planStrandTransfer']>[1]} InternalPlanStrandTransferOptions */
/** @typedef {Parameters<WarpRuntime['compareCoordinates']>[0]} InternalCompareCoordinatesOptions */
/** @typedef {Parameters<WarpRuntime['planCoordinateTransfer']>[0]} InternalPlanCoordinateTransferOptions */
/** @typedef {Parameters<WarpRuntime['analyzeConflicts']>[0]} InternalConflictAnalyzeOptions */


/**
 * Refreshes the comparison digest for a coordinate comparison result.
 *
 * @param {WarpCore} graph
 * @param {CoordinateComparisonV1} comparison
 * @returns {Promise<CoordinateComparisonV1>}
 */
async function refreshPublicComparisonDigest(graph, comparison) {
  const fact = buildCoordinateComparisonFact(comparison);
  const crypto = /** @type {(WarpCore & { _crypto: CryptoPort })} */ (/** @type {unknown} */ (graph))._crypto;
  return {
    ...comparison,
    comparisonDigest: await computeChecksum(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (fact)), crypto),
  };
}

/**
 * Refreshes the transfer digest for a coordinate transfer plan.
 *
 * @param {WarpCore} graph
 * @param {CoordinateTransferPlanV1} transferPlan
 * @returns {Promise<CoordinateTransferPlanV1>}
 */
async function refreshPublicTransferDigest(graph, transferPlan) {
  const fact = buildCoordinateTransferPlanFact(transferPlan);
  const crypto = /** @type {(WarpCore & { _crypto: CryptoPort })} */ (/** @type {unknown} */ (graph))._crypto;
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
   * Adopts an existing runtime instance as a WarpCore.
   *
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

  // ── Effect pipeline ──────────────────────────────────────────────────

  /**
   * Returns the attached effect pipeline, or null if none is configured.
   *
   * @returns {import('./services/EffectPipeline.js').EffectPipeline|null}
   */
  get effectPipeline() {
    return this._asRuntime()._effectPipeline;
  }

  /**
   * Attaches an effect pipeline after construction.
   *
   * @param {import('./services/EffectPipeline.js').EffectPipeline|null} pipeline
   */
  set effectPipeline(pipeline) {
    this._asRuntime()._effectPipeline = pipeline;
  }

  /**
   * Returns all effect emissions from the pipeline, or an empty array.
   *
   * @returns {ReadonlyArray<import('./types/EffectEmission.ts').EffectEmission>}
   */
  get effectEmissions() {
    const p = this._asRuntime()._effectPipeline;
    return p ? p.emissions : [];
  }

  /**
   * Returns all delivery observations from the pipeline, or an empty array.
   *
   * @returns {ReadonlyArray<import('./types/DeliveryObservation.ts').DeliveryObservation>}
   */
  get deliveryObservations() {
    const p = this._asRuntime()._effectPipeline;
    return p ? p.observations : [];
  }

  /**
   * Returns the current externalization policy, or null if no pipeline is configured.
   *
   * @returns {import('./types/ExternalizationPolicy.ts').ExternalizationPolicy|null}
   */
  get externalizationPolicy() {
    const p = this._asRuntime()._effectPipeline;
    return p ? p.lens : null;
  }

  /**
   * Updates the externalization policy on the attached pipeline.
   *
   * @param {import('./types/ExternalizationPolicy.ts').ExternalizationPolicy} newLens
   */
  set externalizationPolicy(newLens) {
    const p = this._asRuntime()._effectPipeline;
    if (p) {
      p.lens = newLens;
    }
  }

  // ── Content attachment reads ──────────────────────────────────────────
  // Delegated to the runtime's QueryController via prototype methods.

  /**
   * Returns the internal WarpRuntime instance.
   *
   * @private
   * @returns {WarpRuntime}
   */
  _asRuntime() {
    return /** @type {WarpRuntime} */ (/** @type {unknown} */ (this));
  }

  /** Returns a content attachment by node ID. @param {string} nodeId @returns {Promise<Uint8Array|null>} */
  async getContent(nodeId) { return /** @type {Uint8Array|null} */ (await callInternalRuntimeMethod(this._asRuntime(), 'getContent', nodeId)); }

  /** Returns a content stream by node ID. @param {string} nodeId @returns {Promise<AsyncIterable<Uint8Array>|null>} */
  async getContentStream(nodeId) { return /** @type {AsyncIterable<Uint8Array>|null} */ (await callInternalRuntimeMethod(this._asRuntime(), 'getContentStream', nodeId)); }

  /** Returns the OID for a content attachment. @param {string} nodeId @returns {Promise<string|null>} */
  async getContentOid(nodeId) { return /** @type {string|null} */ (await callInternalRuntimeMethod(this._asRuntime(), 'getContentOid', nodeId)); }

  /** Returns content metadata. @param {string} nodeId @returns {Promise<{ oid: string, mime: string|null, size: number|null }|null>} */
  async getContentMeta(nodeId) { return /** @type {{ oid: string, mime: string|null, size: number|null }|null} */ (await callInternalRuntimeMethod(this._asRuntime(), 'getContentMeta', nodeId)); }

  /** Returns a content attachment for an edge. @param {string} from @param {string} to @param {string} label @returns {Promise<Uint8Array|null>} */
  async getEdgeContent(from, to, label) { return /** @type {Uint8Array|null} */ (await callInternalRuntimeMethod(this._asRuntime(), 'getEdgeContent', from, to, label)); }

  /** Returns a content stream for an edge. @param {string} from @param {string} to @param {string} label @returns {Promise<AsyncIterable<Uint8Array>|null>} */
  async getEdgeContentStream(from, to, label) { return /** @type {AsyncIterable<Uint8Array>|null} */ (await callInternalRuntimeMethod(this._asRuntime(), 'getEdgeContentStream', from, to, label)); }

  /** Returns the OID for an edge content attachment. @param {string} from @param {string} to @param {string} label @returns {Promise<string|null>} */
  async getEdgeContentOid(from, to, label) { return /** @type {string|null} */ (await callInternalRuntimeMethod(this._asRuntime(), 'getEdgeContentOid', from, to, label)); }

  /** Returns metadata for an edge content attachment. @param {string} from @param {string} to @param {string} label @returns {Promise<{ oid: string, mime: string|null, size: number|null }|null>} */
  async getEdgeContentMeta(from, to, label) { return /** @type {{ oid: string, mime: string|null, size: number|null }|null} */ (await callInternalRuntimeMethod(this._asRuntime(), 'getEdgeContentMeta', from, to, label)); }

  // ── Strands ─────────────────────────────────────────────────────────

  /**
   * Creates a durable strand descriptor pinned to the current frontier.
   *
   * @param {StrandCreateOptions} [options]
   * @returns {Promise<StrandDescriptor>}
   */
  async createStrand(options) {
    return /** @type {StrandDescriptor} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.createStrand.call(this, toInternalStrandShape(options)),
        )
      )
    );
  }

  /**
   * Loads a previously-created strand descriptor.
   *
   * @param {string} strandId
   * @returns {Promise<StrandDescriptor | null>}
   */
  async getStrand(strandId) {
    return /** @type {StrandDescriptor | null} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.getStrand.call(this, strandId),
        )
      )
    );
  }

  /**
   * Lists all strand descriptors stored for this graph.
   *
   * @returns {Promise<StrandDescriptor[]>}
   */
  async listStrands() {
    return /** @type {StrandDescriptor[]} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.listStrands.call(this),
        )
      )
    );
  }

  /**
   * Pins one or more support overlays as braid inputs on a target strand.
   *
   * @param {string} strandId
   * @param {StrandBraidOptions} [options]
   * @returns {Promise<StrandDescriptor>}
   */
  async braidStrand(strandId, options) {
    return /** @type {StrandDescriptor} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.braidStrand.call(
            this,
            strandId,
            /** @type {InternalBraidStrandOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
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
    return await WarpRuntime.prototype.dropStrand.call(this, strandId);
  }

  /**
   * Advanced substrate replay primitive for a strand's pinned base observation plus overlay.
   *
   * @param {string} strandId
   * @param {{ receipts?: boolean, ceiling?: number|null }} [options]
   * @returns {Promise<import('./services/JoinReducer.ts').WarpStateV5|{state: import('./services/JoinReducer.ts').WarpStateV5, receipts: import('./types/TickReceipt.ts').TickReceipt[]}>}
   */
  async materializeStrand(strandId, options) {
    return await /** @type {Promise<import('./services/JoinReducer.ts').WarpStateV5|{state: import('./services/JoinReducer.ts').WarpStateV5, receipts: import('./types/TickReceipt.ts').TickReceipt[]}>} */ (
      /** @type {unknown} */ (
        WarpRuntime.prototype.materializeStrand.call(
          this,
          strandId,
          /** @type {InternalMaterializeStrandOptions | undefined} */ (/** @type {unknown} */ (options)),
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
    return await /** @type {Promise<Array<{ patch: import('./types/Patch.ts').default, sha: string }>>} */ (
      /** @type {unknown} */ (WarpRuntime.prototype.getStrandPatches.call(this, strandId, options))
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
    return await WarpRuntime.prototype.patchesForStrand.call(this, strandId, entityId, options);
  }

  /**
   * Creates a patch builder that writes into a strand's overlay patch-log.
   *
   * @param {string} strandId
   * @returns {Promise<import('./services/PatchBuilder.js').PatchBuilder>}
   */
  async createStrandPatch(strandId) {
    return await WarpRuntime.prototype.createStrandPatch.call(this, strandId);
  }

  /**
   * Convenience wrapper that creates and commits a strand overlay patch.
   *
   * @param {string} strandId
   * @param {(patch: import('./services/PatchBuilder.js').PatchBuilder) => void|Promise<void>} build
   * @returns {Promise<string>}
   */
  async patchStrand(strandId, build) {
    return await WarpRuntime.prototype.patchStrand.call(this, strandId, build);
  }

  /**
   * Queues a patch-shaped intent against a strand without advancing its overlay.
   *
   * @param {string} strandId
   * @param {(patch: import('./services/PatchBuilder.js').PatchBuilder) => void|Promise<void>} build
   * @returns {Promise<StrandIntentDescriptor>}
   */
  async queueStrandIntent(strandId, build) {
    return /** @type {StrandIntentDescriptor} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.queueStrandIntent.call(this, strandId, build),
        )
      )
    );
  }

  /**
   * Lists the currently queued intents for one strand.
   *
   * @param {string} strandId
   * @returns {Promise<StrandIntentDescriptor[]>}
   */
  async listStrandIntents(strandId) {
    return /** @type {StrandIntentDescriptor[]} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.listStrandIntents.call(this, strandId),
        )
      )
    );
  }

  /**
   * Deterministically drains the queued intent set for one strand.
   *
   * @param {string} strandId
   * @returns {Promise<StrandTickRecord>}
   */
  async tickStrand(strandId) {
    return /** @type {StrandTickRecord} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.tickStrand.call(this, strandId),
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
   *   scope?: VisibleStateScopeV1|null
   * }} [options]
   * @returns {Promise<CoordinateComparisonV1>}
   */
  async compareStrand(strandId, options) {
    const comparison = /** @type {CoordinateComparisonV1} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.compareStrand.call(
            this,
            strandId,
            /** @type {InternalCompareStrandOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
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
   *   scope?: VisibleStateScopeV1|null
   * }} [options]
   * @returns {Promise<CoordinateTransferPlanV1>}
   */
  async planStrandTransfer(strandId, options) {
    const transferPlan = /** @type {CoordinateTransferPlanV1} */ (
      /** @type {unknown} */ (
        toPublicStrandShape(
          await WarpRuntime.prototype.planStrandTransfer.call(
            this,
            strandId,
            /** @type {InternalPlanStrandTransferOptions} */ (/** @type {unknown} */ (toInternalStrandShape(options))),
          ),
        )
      )
    );
    return await refreshPublicTransferDigest(this, transferPlan);
  }

  /**
   * Compares two coordinate sets and returns the divergence.
   *
   * @param {{
   *   left: CoordinateComparisonSelectorV1,
   *   right: CoordinateComparisonSelectorV1,
   *   targetId?: string|null,
   *   scope?: VisibleStateScopeV1|null
   * }} options
   * @returns {Promise<CoordinateComparisonV1>}
   */
  async compareCoordinates(options) {
    const comparison = /** @type {CoordinateComparisonV1} */ (
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
   * Plans a transfer between two coordinate sets.
   *
   * @param {{
   *   source: CoordinateTransferPlanSelectorV1,
   *   target: CoordinateTransferPlanSelectorV1,
   *   scope?: VisibleStateScopeV1|null
   * }} options
   * @returns {Promise<CoordinateTransferPlanV1>}
   */
  async planCoordinateTransfer(options) {
    const transferPlan = /** @type {CoordinateTransferPlanV1} */ (
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
   * Analyzes conflicts in the current graph state.
   *
   * @param {import('./services/strand/ConflictAnalyzerService.js').ConflictAnalyzeOptions} [options]
   * @returns {Promise<import('./services/strand/ConflictAnalyzerService.js').ConflictAnalysis>}
   */
  async analyzeConflicts(options) {
    return /** @type {import('./services/strand/ConflictAnalyzerService.js').ConflictAnalysis} */ (
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
}

Object.setPrototypeOf(WarpCore.prototype, WarpRuntime.prototype);
