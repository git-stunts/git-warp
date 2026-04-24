import WarpError from './errors/WarpError.ts';
import { callInternalRuntimeMethod } from './utils/callInternalRuntimeMethod.ts';
import { toInternalStrandShape, toPublicStrandShape } from './utils/strandPublicShape.ts';
import {
  linkWarpCorePrototype,
  openWarpCoreRuntime,
} from './warp/WarpCoreRuntimeBridge.ts';
import {
  buildCoordinateComparisonFact,
  buildCoordinateTransferPlanFact,
} from './services/CoordinateFactExport.ts';
import { computeChecksum } from './utils/checksumUtils.ts';

import type CryptoPort from '../ports/CryptoPort.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';
import type { ExternalizationPolicy } from './types/ExternalizationPolicy.ts';
import type {
  CompareCoordinatesOptions,
  CompareStrandOptions,
  ConflictAnalysis,
  ConflictAnalyzeOptions,
  CoordinateComparisonV1,
  CoordinateTransferPlanV1,
  InternalBraidStrandOptions,
  InternalCompareCoordinatesOptions,
  InternalCompareStrandOptions,
  InternalConflictAnalyzeOptions,
  InternalPlanCoordinateTransferOptions,
  InternalPlanStrandTransferOptions,
  PlanCoordinateTransferOptions,
  PlanStrandTransferOptions,
  StrandBraidOptions,
  StrandCreateOptions,
  StrandDescriptor,
  StrandIntentDescriptor,
  StrandMaterializeOptions,
  StrandMaterializeResult,
  StrandPatchEntry,
  StrandPatchListOptions,
  StrandTickRecord,
  WarpCoreOpenOptions,
} from './warp/WarpCoreRuntimeBridge.ts';

type ContentMeta = {
  oid: string;
  mime: string | null;
  size: number | null;
};

async function refreshPublicComparisonDigest(
  graph: WarpCore,
  comparison: CoordinateComparisonV1,
): Promise<CoordinateComparisonV1> {
  const fact = buildCoordinateComparisonFact(comparison);
  return {
    ...comparison,
    comparisonDigest: await computeChecksum(fact, graph._crypto),
  };
}

async function refreshPublicTransferDigest(
  graph: WarpCore,
  transferPlan: CoordinateTransferPlanV1,
): Promise<CoordinateTransferPlanV1> {
  const fact = buildCoordinateTransferPlanFact(transferPlan);
  return {
    ...transferPlan,
    transferDigest: await computeChecksum(fact, graph._crypto),
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
  declare _effectPipeline: EffectPipeline | null;
  declare _crypto: CryptoPort;

  static async open(options: WarpCoreOpenOptions): Promise<WarpCore> {
    const runtime = await openWarpCoreRuntime(options);
    return WarpCore._adopt(runtime);
  }

  /**
   * Adopts an existing runtime instance as a WarpCore.
   */
  static _adopt(runtime: object | WarpCore): WarpCore {
    if (runtime instanceof WarpCore) {
      return runtime;
    }

    Object.setPrototypeOf(runtime, WarpCore.prototype);
    if (runtime instanceof WarpCore) {
      return runtime;
    }

    throw new WarpError('failed to adopt runtime as WarpCore', 'E_WARP_CORE_ADOPT');
  }

  get effectPipeline(): EffectPipeline | null {
    return this._effectPipeline;
  }

  set effectPipeline(pipeline: EffectPipeline | null) {
    this._effectPipeline = pipeline;
  }

  get effectEmissions() {
    return this._effectPipeline ? this._effectPipeline.emissions : [];
  }

  get deliveryObservations() {
    return this._effectPipeline ? this._effectPipeline.observations : [];
  }

  get externalizationPolicy(): ExternalizationPolicy | null {
    return this._effectPipeline ? this._effectPipeline.lens : null;
  }

  set externalizationPolicy(newLens: ExternalizationPolicy) {
    if (this._effectPipeline) {
      this._effectPipeline.lens = newLens;
    }
  }

  async getContent(nodeId: string): Promise<Uint8Array | null> {
    return await callInternalRuntimeMethod<Uint8Array | null>(this, 'getContent', nodeId);
  }

  async getContentStream(nodeId: string): Promise<AsyncIterable<Uint8Array> | null> {
    return await callInternalRuntimeMethod<AsyncIterable<Uint8Array> | null>(this, 'getContentStream', nodeId);
  }

  async getContentOid(nodeId: string): Promise<string | null> {
    return await callInternalRuntimeMethod<string | null>(this, 'getContentOid', nodeId);
  }

  async getContentMeta(nodeId: string): Promise<ContentMeta | null> {
    return await callInternalRuntimeMethod<ContentMeta | null>(this, 'getContentMeta', nodeId);
  }

  async getEdgeContent(from: string, to: string, label: string): Promise<Uint8Array | null> {
    return await callInternalRuntimeMethod<Uint8Array | null>(this, 'getEdgeContent', from, to, label);
  }

  async getEdgeContentStream(from: string, to: string, label: string): Promise<AsyncIterable<Uint8Array> | null> {
    return await callInternalRuntimeMethod<AsyncIterable<Uint8Array> | null>(this, 'getEdgeContentStream', from, to, label);
  }

  async getEdgeContentOid(from: string, to: string, label: string): Promise<string | null> {
    return await callInternalRuntimeMethod<string | null>(this, 'getEdgeContentOid', from, to, label);
  }

  async getEdgeContentMeta(from: string, to: string, label: string): Promise<ContentMeta | null> {
    return await callInternalRuntimeMethod<ContentMeta | null>(this, 'getEdgeContentMeta', from, to, label);
  }

  async createStrand(options?: StrandCreateOptions): Promise<StrandDescriptor> {
    return toPublicStrandShape(
      await callInternalRuntimeMethod<StrandDescriptor>(this, 'createStrand', toInternalStrandShape(options)),
    );
  }

  async getStrand(strandId: string): Promise<StrandDescriptor | null> {
    return toPublicStrandShape(
      await callInternalRuntimeMethod<StrandDescriptor | null>(this, 'getStrand', strandId),
    );
  }

  async listStrands(): Promise<StrandDescriptor[]> {
    return toPublicStrandShape(
      await callInternalRuntimeMethod<StrandDescriptor[]>(this, 'listStrands'),
    );
  }

  async braidStrand(strandId: string, options?: StrandBraidOptions): Promise<StrandDescriptor> {
    const internalOptions: InternalBraidStrandOptions | undefined = toInternalStrandShape(options);
    return toPublicStrandShape(
      await callInternalRuntimeMethod<StrandDescriptor>(this, 'braidStrand', strandId, internalOptions),
    );
  }

  async dropStrand(strandId: string): Promise<boolean> {
    return await callInternalRuntimeMethod<boolean>(this, 'dropStrand', strandId);
  }

  async materializeStrand(strandId: string, options?: StrandMaterializeOptions): Promise<StrandMaterializeResult> {
    return await callInternalRuntimeMethod<StrandMaterializeResult>(this, 'materializeStrand', strandId, options);
  }

  async getStrandPatches(
    strandId: string,
    options?: StrandPatchListOptions,
  ): Promise<StrandPatchEntry[]> {
    return await callInternalRuntimeMethod<StrandPatchEntry[]>(this, 'getStrandPatches', strandId, options);
  }

  async patchesForStrand(
    strandId: string,
    entityId: string,
    options?: StrandPatchListOptions,
  ): Promise<string[]> {
    return await callInternalRuntimeMethod<string[]>(this, 'patchesForStrand', strandId, entityId, options);
  }

  async createStrandPatch(strandId: string): Promise<import('./services/PatchBuilder.js').PatchBuilder> {
    return await callInternalRuntimeMethod<import('./services/PatchBuilder.js').PatchBuilder>(
      this,
      'createStrandPatch',
      strandId,
    );
  }

  async patchStrand(
    strandId: string,
    build: (patch: import('./services/PatchBuilder.js').PatchBuilder) => void | Promise<void>,
  ): Promise<string> {
    return await callInternalRuntimeMethod<string>(this, 'patchStrand', strandId, build);
  }

  async queueStrandIntent(
    strandId: string,
    build: (patch: import('./services/PatchBuilder.js').PatchBuilder) => void | Promise<void>,
  ): Promise<StrandIntentDescriptor> {
    return toPublicStrandShape(
      await callInternalRuntimeMethod<StrandIntentDescriptor>(this, 'queueStrandIntent', strandId, build),
    );
  }

  async listStrandIntents(strandId: string): Promise<StrandIntentDescriptor[]> {
    return toPublicStrandShape(
      await callInternalRuntimeMethod<StrandIntentDescriptor[]>(this, 'listStrandIntents', strandId),
    );
  }

  async tickStrand(strandId: string): Promise<StrandTickRecord> {
    return toPublicStrandShape(
      await callInternalRuntimeMethod<StrandTickRecord>(this, 'tickStrand', strandId),
    );
  }

  async compareStrand(
    strandId: string,
    options?: CompareStrandOptions,
  ): Promise<CoordinateComparisonV1> {
    const internalOptions: InternalCompareStrandOptions | undefined = toInternalStrandShape(options);
    const comparison = toPublicStrandShape(
      await callInternalRuntimeMethod<CoordinateComparisonV1>(this, 'compareStrand', strandId, internalOptions),
    );
    return await refreshPublicComparisonDigest(this, comparison);
  }

  async planStrandTransfer(
    strandId: string,
    options?: PlanStrandTransferOptions,
  ): Promise<CoordinateTransferPlanV1> {
    const internalOptions: InternalPlanStrandTransferOptions | undefined = toInternalStrandShape(options);
    const transferPlan = toPublicStrandShape(
      await callInternalRuntimeMethod<CoordinateTransferPlanV1>(this, 'planStrandTransfer', strandId, internalOptions),
    );
    return await refreshPublicTransferDigest(this, transferPlan);
  }

  async compareCoordinates(options: CompareCoordinatesOptions): Promise<CoordinateComparisonV1> {
    const internalOptions: InternalCompareCoordinatesOptions = toInternalStrandShape(options);
    const comparison = toPublicStrandShape(
      await callInternalRuntimeMethod<CoordinateComparisonV1>(this, 'compareCoordinates', internalOptions),
    );
    return await refreshPublicComparisonDigest(this, comparison);
  }

  async planCoordinateTransfer(options: PlanCoordinateTransferOptions): Promise<CoordinateTransferPlanV1> {
    const internalOptions: InternalPlanCoordinateTransferOptions = toInternalStrandShape(options);
    const transferPlan = toPublicStrandShape(
      await callInternalRuntimeMethod<CoordinateTransferPlanV1>(this, 'planCoordinateTransfer', internalOptions),
    );
    return await refreshPublicTransferDigest(this, transferPlan);
  }

  async analyzeConflicts(options?: ConflictAnalyzeOptions): Promise<ConflictAnalysis> {
    const internalOptions: InternalConflictAnalyzeOptions | undefined = toInternalStrandShape(options);
    return toPublicStrandShape(
      await callInternalRuntimeMethod<ConflictAnalysis>(this, 'analyzeConflicts', internalOptions),
    );
  }
}

linkWarpCorePrototype(WarpCore.prototype);
