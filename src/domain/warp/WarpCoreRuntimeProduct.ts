import type MaterializeCapability from '../capabilities/MaterializeCapability.ts';
import type { EffectPipeline } from '../services/EffectPipeline.ts';
import type { WarpGraphRuntimeSurface } from './WarpGraphRuntimeProduct.ts';
import {
  openRuntimeHostProduct,
  type RuntimeHostOpenInput,
  type RuntimeHostOpenOptions,
  type RuntimeHostProduct,
} from './RuntimeHostProduct.ts';

export type WarpCoreOpenOptions = RuntimeHostOpenOptions;
export type WarpCoreOpenInput = RuntimeHostOpenInput;
export type StrandCreateOptions = Parameters<RuntimeHostProduct['createStrand']>[0];
export type StrandDescriptor = Awaited<ReturnType<RuntimeHostProduct['createStrand']>>;
export type StrandBraidOptions = Parameters<RuntimeHostProduct['braidStrand']>[1];
export type StrandMaterializeOptions = Parameters<RuntimeHostProduct['materializeStrand']>[1];
export type StrandMaterializeResult = Awaited<ReturnType<RuntimeHostProduct['materializeStrand']>>;
export type StrandPatchEntry = Awaited<ReturnType<RuntimeHostProduct['getStrandPatches']>>[number];
export type StrandPatchListOptions = { ceiling?: number | null };
export type StrandIntentDescriptor = Awaited<ReturnType<RuntimeHostProduct['queueStrandIntent']>>;
export type StrandTickRecord = Awaited<ReturnType<RuntimeHostProduct['tickStrand']>>;
export type CompareStrandOptions = Parameters<RuntimeHostProduct['compareStrand']>[1];
export type CoordinateComparison = Awaited<ReturnType<RuntimeHostProduct['compareCoordinates']>>;
export type PlanStrandTransferOptions = Parameters<RuntimeHostProduct['planStrandTransfer']>[1];
export type CoordinateTransferPlan = Awaited<ReturnType<RuntimeHostProduct['planCoordinateTransfer']>>;
export type CompareCoordinatesOptions = Parameters<RuntimeHostProduct['compareCoordinates']>[0];
export type PlanCoordinateTransferOptions = Parameters<RuntimeHostProduct['planCoordinateTransfer']>[0];
export type ConflictAnalyzeOptions = Parameters<RuntimeHostProduct['analyzeConflicts']>[0];
export type ConflictAnalysis = Awaited<ReturnType<RuntimeHostProduct['analyzeConflicts']>>;

export type WarpCoreRuntimeSurface = WarpGraphRuntimeSurface & MaterializeCapability & {
  readonly traverse: RuntimeHostProduct['traverse'];
  readonly persistence: RuntimeHostProduct['persistence'];
  readonly onDeleteWithData: RuntimeHostProduct['onDeleteWithData'];
  readonly gcPolicy: RuntimeHostProduct['gcPolicy'];
  readonly fork: RuntimeHostProduct['fork'];
  readonly createWormhole: RuntimeHostProduct['createWormhole'];
  _effectPipeline: EffectPipeline | null;
  readonly _crypto: RuntimeHostProduct['_crypto'];
};

export function buildWarpCoreRuntimeSurface(runtime: RuntimeHostProduct): WarpCoreRuntimeSurface {
  const surface: WarpCoreRuntimeSurface = {
    graphName: runtime.graphName,
    writerId: runtime.writerId,
    hasNode: runtime.hasNode.bind(runtime),
    getNodeProps: runtime.getNodeProps.bind(runtime),
    getEdgeProps: runtime.getEdgeProps.bind(runtime),
    neighbors: runtime.neighbors.bind(runtime),
    getStateSnapshot: runtime.getStateSnapshot.bind(runtime),
    getNodes: runtime.getNodes.bind(runtime),
    getEdges: runtime.getEdges.bind(runtime),
    getPropertyCount: runtime.getPropertyCount.bind(runtime),
    query: runtime.query.bind(runtime),
    worldline: runtime.worldline.bind(runtime),
    observer: runtime.observer.bind(runtime),
    translationCost: runtime.translationCost.bind(runtime),
    getContentOid: runtime.getContentOid.bind(runtime),
    getContentMeta: runtime.getContentMeta.bind(runtime),
    getContent: runtime.getContent.bind(runtime),
    getEdgeContentOid: runtime.getEdgeContentOid.bind(runtime),
    getEdgeContentMeta: runtime.getEdgeContentMeta.bind(runtime),
    getEdgeContent: runtime.getEdgeContent.bind(runtime),
    getContentStream: runtime.getContentStream.bind(runtime),
    getEdgeContentStream: runtime.getEdgeContentStream.bind(runtime),
    createPatch: runtime.createPatch.bind(runtime),
    patch: runtime.patch.bind(runtime),
    patchMany: runtime.patchMany.bind(runtime),
    getWriterPatches: runtime.getWriterPatches.bind(runtime),
    writer: runtime.writer.bind(runtime),
    discoverWriters: runtime.discoverWriters.bind(runtime),
    discoverTicks: runtime.discoverTicks.bind(runtime),
    join: runtime.join.bind(runtime),
    materialize: runtime.materialize.bind(runtime),
    materializeCoordinate: runtime.materializeCoordinate.bind(runtime),
    materializeAt: runtime.materializeAt.bind(runtime),
    verifyIndex: runtime.verifyIndex.bind(runtime),
    invalidateIndex: runtime.invalidateIndex.bind(runtime),
    getFrontier: runtime.getFrontier.bind(runtime),
    hasFrontierChanged: runtime.hasFrontierChanged.bind(runtime),
    status: runtime.status.bind(runtime),
    createSyncRequest: runtime.createSyncRequest.bind(runtime),
    processSyncRequest: runtime.processSyncRequest.bind(runtime),
    applySyncResponse: runtime.applySyncResponse.bind(runtime),
    syncNeeded: runtime.syncNeeded.bind(runtime),
    syncWith: runtime.syncWith.bind(runtime),
    serve: runtime.serve.bind(runtime),
    createStrand: runtime.createStrand.bind(runtime),
    braidStrand: runtime.braidStrand.bind(runtime),
    getStrand: runtime.getStrand.bind(runtime),
    listStrands: runtime.listStrands.bind(runtime),
    dropStrand: runtime.dropStrand.bind(runtime),
    materializeStrand: runtime.materializeStrand.bind(runtime),
    getStrandPatches: runtime.getStrandPatches.bind(runtime),
    patchesForStrand: runtime.patchesForStrand.bind(runtime),
    createStrandPatch: runtime.createStrandPatch.bind(runtime),
    patchStrand: runtime.patchStrand.bind(runtime),
    queueStrandIntent: runtime.queueStrandIntent.bind(runtime),
    listStrandIntents: runtime.listStrandIntents.bind(runtime),
    tickStrand: runtime.tickStrand.bind(runtime),
    analyzeConflicts: runtime.analyzeConflicts.bind(runtime),
    admitIntent: runtime.admitIntent.bind(runtime),
    queueIntent: runtime.queueIntent.bind(runtime),
    getWriterIntents: runtime.getWriterIntents.bind(runtime),
    createCheckpoint: runtime.createCheckpoint.bind(runtime),
    syncCoverage: runtime.syncCoverage.bind(runtime),
    maybeRunGC: runtime.maybeRunGC.bind(runtime),
    runGC: runtime.runGC.bind(runtime),
    getGCMetrics: runtime.getGCMetrics.bind(runtime),
    patchesFor: runtime.patchesFor.bind(runtime),
    materializeSlice: runtime.materializeSlice.bind(runtime),
    loadPatchBySha: runtime.loadPatchBySha.bind(runtime),
    buildPatchDivergence: runtime.buildPatchDivergence.bind(runtime),
    compareStrand: runtime.compareStrand.bind(runtime),
    planStrandTransfer: runtime.planStrandTransfer.bind(runtime),
    compareCoordinates: runtime.compareCoordinates.bind(runtime),
    diff: runtime.diff.bind(runtime),
    planCoordinateTransfer: runtime.planCoordinateTransfer.bind(runtime),
    subscribe: runtime.subscribe.bind(runtime),
    watch: runtime.watch.bind(runtime),
    get traverse() {
      return runtime.traverse;
    },
    get persistence() {
      return runtime.persistence;
    },
    get onDeleteWithData() {
      return runtime.onDeleteWithData;
    },
    get gcPolicy() {
      return runtime.gcPolicy;
    },
    fork: runtime.fork.bind(runtime),
    createWormhole: runtime.createWormhole.bind(runtime),
    get _effectPipeline() {
      return runtime._effectPipeline;
    },
    set _effectPipeline(pipeline: EffectPipeline | null) {
      runtime._effectPipeline = pipeline;
    },
    get _crypto() {
      return runtime._crypto;
    },
  };
  return surface;
}

export async function openWarpCoreRuntimeProduct(
  options: WarpCoreOpenInput,
): Promise<WarpCoreRuntimeSurface> {
  const runtime = await openRuntimeHostProduct(options);
  return buildWarpCoreRuntimeSurface(runtime);
}
