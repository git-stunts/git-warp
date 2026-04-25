import { openRuntimeHostProduct } from './RuntimeHostProduct.ts';

import type {
  RuntimeGraphHostProduct,
  RuntimeHostOpenOptions,
} from './RuntimeHostProduct.ts';

export type WarpGraphRuntimeOpenOptions = RuntimeHostOpenOptions;

export type WarpGraphRuntimeSurface = RuntimeGraphHostProduct;

export function buildWarpGraphRuntimeSurface(runtime: RuntimeGraphHostProduct): WarpGraphRuntimeSurface {
  const surface: WarpGraphRuntimeSurface = {
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
    planCoordinateTransfer: runtime.planCoordinateTransfer.bind(runtime),
    subscribe: runtime.subscribe.bind(runtime),
    watch: runtime.watch.bind(runtime),
  };
  return Object.freeze(surface);
}

export async function openWarpGraphRuntimeProduct(
  options: WarpGraphRuntimeOpenOptions,
): Promise<WarpGraphRuntimeSurface> {
  const runtime = await openRuntimeHostProduct(options);
  return buildWarpGraphRuntimeSurface(runtime);
}
