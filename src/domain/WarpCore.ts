import WarpRuntime from './WarpRuntime.js';
import WarpError from './errors/WarpError.ts';
import { callInternalRuntimeMethod } from './utils/callInternalRuntimeMethod.ts';
import { toInternalStrandShape, toPublicStrandShape } from './utils/strandPublicShape.ts';
import {
  buildCoordinateComparisonFact,
  buildCoordinateTransferPlanFact,
} from './services/CoordinateFactExport.ts';
import { computeChecksum } from './utils/checksumUtils.ts';

import type CryptoPort from '../ports/CryptoPort.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';
import type { ExternalizationPolicy } from './types/ExternalizationPolicy.ts';

type ContentMeta = {
  oid: string;
  mime: string | null;
  size: number | null;
};

type StrandCreateOptions = Parameters<WarpRuntime['createStrand']>[0];
type StrandDescriptor = Awaited<ReturnType<WarpRuntime['createStrand']>>;
type StrandBraidOptions = Parameters<WarpRuntime['braidStrand']>[1];
type StrandMaterializeOptions = Parameters<WarpRuntime['materializeStrand']>[1];
type StrandMaterializeResult = Awaited<ReturnType<WarpRuntime['materializeStrand']>>;
type StrandPatchEntry = Awaited<ReturnType<WarpRuntime['getStrandPatches']>>[number];
type StrandIntentDescriptor = Awaited<ReturnType<WarpRuntime['queueStrandIntent']>>;
type StrandTickRecord = Awaited<ReturnType<WarpRuntime['tickStrand']>>;
type CompareStrandOptions = Parameters<WarpRuntime['compareStrand']>[1];
type CoordinateComparisonV1 = Awaited<ReturnType<WarpRuntime['compareCoordinates']>>;
type PlanStrandTransferOptions = Parameters<WarpRuntime['planStrandTransfer']>[1];
type CoordinateTransferPlanV1 = Awaited<ReturnType<WarpRuntime['planCoordinateTransfer']>>;
type CompareCoordinatesOptions = Parameters<WarpRuntime['compareCoordinates']>[0];
type PlanCoordinateTransferOptions = Parameters<WarpRuntime['planCoordinateTransfer']>[0];
type ConflictAnalyzeOptions = Parameters<WarpRuntime['analyzeConflicts']>[0];
type ConflictAnalysis = Awaited<ReturnType<WarpRuntime['analyzeConflicts']>>;
type InternalBraidStrandOptions = Parameters<WarpRuntime['braidStrand']>[1];
type InternalCompareStrandOptions = Parameters<WarpRuntime['compareStrand']>[1];
type InternalPlanStrandTransferOptions = Parameters<WarpRuntime['planStrandTransfer']>[1];
type InternalCompareCoordinatesOptions = Parameters<WarpRuntime['compareCoordinates']>[0];
type InternalPlanCoordinateTransferOptions = Parameters<WarpRuntime['planCoordinateTransfer']>[0];
type InternalConflictAnalyzeOptions = Parameters<WarpRuntime['analyzeConflicts']>[0];

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

  static async open(options: Parameters<typeof WarpRuntime.open>[0]): Promise<WarpCore> {
    const runtime = await WarpRuntime.open(options);
    return WarpCore._adopt(runtime);
  }

  /**
   * Adopts an existing runtime instance as a WarpCore.
   */
  static _adopt(runtime: WarpRuntime | WarpCore): WarpCore {
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
      await WarpRuntime.prototype.createStrand.call(this, toInternalStrandShape(options)),
    );
  }

  async getStrand(strandId: string): Promise<StrandDescriptor | null> {
    return toPublicStrandShape(
      await WarpRuntime.prototype.getStrand.call(this, strandId),
    );
  }

  async listStrands(): Promise<StrandDescriptor[]> {
    return toPublicStrandShape(
      await WarpRuntime.prototype.listStrands.call(this),
    );
  }

  async braidStrand(strandId: string, options?: StrandBraidOptions): Promise<StrandDescriptor> {
    const internalOptions: InternalBraidStrandOptions | undefined = toInternalStrandShape(options);
    return toPublicStrandShape(
      await WarpRuntime.prototype.braidStrand.call(this, strandId, internalOptions),
    );
  }

  async dropStrand(strandId: string): Promise<boolean> {
    return await WarpRuntime.prototype.dropStrand.call(this, strandId);
  }

  async materializeStrand(strandId: string, options?: StrandMaterializeOptions): Promise<StrandMaterializeResult> {
    return await WarpRuntime.prototype.materializeStrand.call(this, strandId, options);
  }

  async getStrandPatches(
    strandId: string,
    options?: Record<string, unknown>,
  ): Promise<StrandPatchEntry[]> {
    return await WarpRuntime.prototype.getStrandPatches.call(this, strandId, options);
  }

  async patchesForStrand(
    strandId: string,
    entityId: string,
    options?: Record<string, unknown>,
  ): Promise<string[]> {
    return await WarpRuntime.prototype.patchesForStrand.call(this, strandId, entityId, options);
  }

  async createStrandPatch(strandId: string): Promise<import('./services/PatchBuilder.js').PatchBuilder> {
    return await WarpRuntime.prototype.createStrandPatch.call(this, strandId);
  }

  async patchStrand(
    strandId: string,
    build: (patch: import('./services/PatchBuilder.js').PatchBuilder) => void | Promise<void>,
  ): Promise<string> {
    return await WarpRuntime.prototype.patchStrand.call(this, strandId, build);
  }

  async queueStrandIntent(
    strandId: string,
    build: (patch: import('./services/PatchBuilder.js').PatchBuilder) => void | Promise<void>,
  ): Promise<StrandIntentDescriptor> {
    return toPublicStrandShape(
      await WarpRuntime.prototype.queueStrandIntent.call(this, strandId, build),
    );
  }

  async listStrandIntents(strandId: string): Promise<StrandIntentDescriptor[]> {
    return toPublicStrandShape(
      await WarpRuntime.prototype.listStrandIntents.call(this, strandId),
    );
  }

  async tickStrand(strandId: string): Promise<StrandTickRecord> {
    return toPublicStrandShape(
      await WarpRuntime.prototype.tickStrand.call(this, strandId),
    );
  }

  async compareStrand(
    strandId: string,
    options?: CompareStrandOptions,
  ): Promise<CoordinateComparisonV1> {
    const internalOptions: InternalCompareStrandOptions | undefined = toInternalStrandShape(options);
    const comparison = toPublicStrandShape(
      await WarpRuntime.prototype.compareStrand.call(this, strandId, internalOptions),
    );
    return await refreshPublicComparisonDigest(this, comparison);
  }

  async planStrandTransfer(
    strandId: string,
    options?: PlanStrandTransferOptions,
  ): Promise<CoordinateTransferPlanV1> {
    const internalOptions: InternalPlanStrandTransferOptions | undefined = toInternalStrandShape(options);
    const transferPlan = toPublicStrandShape(
      await WarpRuntime.prototype.planStrandTransfer.call(this, strandId, internalOptions),
    );
    return await refreshPublicTransferDigest(this, transferPlan);
  }

  async compareCoordinates(options: CompareCoordinatesOptions): Promise<CoordinateComparisonV1> {
    const internalOptions: InternalCompareCoordinatesOptions = toInternalStrandShape(options);
    const comparison = toPublicStrandShape(
      await WarpRuntime.prototype.compareCoordinates.call(this, internalOptions),
    );
    return await refreshPublicComparisonDigest(this, comparison);
  }

  async planCoordinateTransfer(options: PlanCoordinateTransferOptions): Promise<CoordinateTransferPlanV1> {
    const internalOptions: InternalPlanCoordinateTransferOptions = toInternalStrandShape(options);
    const transferPlan = toPublicStrandShape(
      await WarpRuntime.prototype.planCoordinateTransfer.call(this, internalOptions),
    );
    return await refreshPublicTransferDigest(this, transferPlan);
  }

  async analyzeConflicts(options?: ConflictAnalyzeOptions): Promise<ConflictAnalysis> {
    const internalOptions: InternalConflictAnalyzeOptions | undefined = toInternalStrandShape(options);
    return toPublicStrandShape(
      await WarpRuntime.prototype.analyzeConflicts.call(this, internalOptions),
    );
  }
}

Object.setPrototypeOf(WarpCore.prototype, WarpRuntime.prototype);
