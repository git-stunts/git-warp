import WarpError from './errors/WarpError.ts';
import {
  openWarpCoreRuntimeProduct,
  type WarpCoreOpenInput,
  type WarpCoreRuntimeSurface,
} from './warp/WarpCoreRuntimeProduct.ts';

import type CryptoPort from '../ports/CryptoPort.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';
import type { DeliveryObservation } from './types/DeliveryObservation.ts';
import type { EffectEmission } from './types/EffectEmission.ts';
import type { ExternalizationPolicy } from './types/ExternalizationPolicy.ts';

/**
 * Full plumbing-facing WARP surface.
 *
 * `WarpCore` is the honest substrate/tooling entrypoint for replay,
 * materialization, provenance, comparison, and other low-level mechanics.
 * It now adopts an explicit structural core product rather than linking
 * itself onto the `WarpRuntime` prototype.
 *
 * @deprecated Use the root intent/timeline/reading/receipt API for new
 * application workflows. `WarpCore` is migration-only for substrate tooling,
 * diagnostics, replay, and existing graph-first integrations.
 */
export default class WarpCore {
  declare readonly graphName: WarpCoreRuntimeSurface['graphName'];
  declare readonly writerId: WarpCoreRuntimeSurface['writerId'];
  declare readonly traverse: WarpCoreRuntimeSurface['traverse'];
  declare readonly persistence: WarpCoreRuntimeSurface['persistence'];
  declare readonly onDeleteWithData: WarpCoreRuntimeSurface['onDeleteWithData'];
  declare readonly gcPolicy: WarpCoreRuntimeSurface['gcPolicy'];
  declare readonly hasNode: WarpCoreRuntimeSurface['hasNode'];
  declare readonly getNodeProps: WarpCoreRuntimeSurface['getNodeProps'];
  declare readonly getEdgeProps: WarpCoreRuntimeSurface['getEdgeProps'];
  declare readonly neighbors: WarpCoreRuntimeSurface['neighbors'];
  declare readonly getStateSnapshot: WarpCoreRuntimeSurface['getStateSnapshot'];
  declare readonly getNodes: WarpCoreRuntimeSurface['getNodes'];
  declare readonly getEdges: WarpCoreRuntimeSurface['getEdges'];
  declare readonly getPropertyCount: WarpCoreRuntimeSurface['getPropertyCount'];
  declare readonly query: WarpCoreRuntimeSurface['query'];
  declare readonly worldline: WarpCoreRuntimeSurface['worldline'];
  declare readonly observer: WarpCoreRuntimeSurface['observer'];
  declare readonly translationCost: WarpCoreRuntimeSurface['translationCost'];
  /**
   * Returns the content blob OID attached to a node.
   */
  declare readonly getContentOid: WarpCoreRuntimeSurface['getContentOid'];
  /**
   * Returns metadata for the content blob attached to a node.
   */
  declare readonly getContentMeta: WarpCoreRuntimeSurface['getContentMeta'];
  /**
   * Returns the decoded content payload attached to a node.
   */
  declare readonly getContent: WarpCoreRuntimeSurface['getContent'];
  /**
   * Returns the content blob OID attached to an edge.
   */
  declare readonly getEdgeContentOid: WarpCoreRuntimeSurface['getEdgeContentOid'];
  /**
   * Returns metadata for the content blob attached to an edge.
   */
  declare readonly getEdgeContentMeta: WarpCoreRuntimeSurface['getEdgeContentMeta'];
  /**
   * Returns the decoded content payload attached to an edge.
   */
  declare readonly getEdgeContent: WarpCoreRuntimeSurface['getEdgeContent'];
  /**
   * Opens a stream for the content blob attached to a node.
   */
  declare readonly getContentStream: WarpCoreRuntimeSurface['getContentStream'];
  /**
   * Opens a stream for the content blob attached to an edge.
   */
  declare readonly getEdgeContentStream: WarpCoreRuntimeSurface['getEdgeContentStream'];
  declare readonly createPatch: WarpCoreRuntimeSurface['createPatch'];
  declare readonly patch: WarpCoreRuntimeSurface['patch'];
  declare readonly patchMany: WarpCoreRuntimeSurface['patchMany'];
  declare readonly getWriterPatches: WarpCoreRuntimeSurface['getWriterPatches'];
  declare readonly writer: WarpCoreRuntimeSurface['writer'];
  declare readonly discoverWriters: WarpCoreRuntimeSurface['discoverWriters'];
  declare readonly discoverTicks: WarpCoreRuntimeSurface['discoverTicks'];
  declare readonly join: WarpCoreRuntimeSurface['join'];
  /** @deprecated ALL materialization APIs are deprecated in favor of pure Optic lenses and unmaterialized Intent admission. */
  declare readonly materialize: WarpCoreRuntimeSurface['materialize'];
  /** @deprecated ALL materialization APIs are deprecated in favor of pure Optic lenses and unmaterialized Intent admission. */
  declare readonly materializeCoordinate: WarpCoreRuntimeSurface['materializeCoordinate'];
  /** @deprecated ALL materialization APIs are deprecated in favor of pure Optic lenses and unmaterialized Intent admission. */
  declare readonly materializeAt: WarpCoreRuntimeSurface['materializeAt'];
  /** Diagnostic/substrate index verification; not an application read path. */
  declare readonly verifyIndex: WarpCoreRuntimeSurface['verifyIndex'];
  /** Diagnostic/substrate cache invalidation; not an application read path. */
  declare readonly invalidateIndex: WarpCoreRuntimeSurface['invalidateIndex'];
  declare readonly getFrontier: WarpCoreRuntimeSurface['getFrontier'];
  declare readonly hasFrontierChanged: WarpCoreRuntimeSurface['hasFrontierChanged'];
  declare readonly status: WarpCoreRuntimeSurface['status'];
  declare readonly createSyncRequest: WarpCoreRuntimeSurface['createSyncRequest'];
  declare readonly processSyncRequest: WarpCoreRuntimeSurface['processSyncRequest'];
  declare readonly applySyncResponse: WarpCoreRuntimeSurface['applySyncResponse'];
  declare readonly syncNeeded: WarpCoreRuntimeSurface['syncNeeded'];
  declare readonly syncWith: WarpCoreRuntimeSurface['syncWith'];
  declare readonly serve: WarpCoreRuntimeSurface['serve'];
  declare readonly createStrand: WarpCoreRuntimeSurface['createStrand'];
  declare readonly braidStrand: WarpCoreRuntimeSurface['braidStrand'];
  declare readonly getStrand: WarpCoreRuntimeSurface['getStrand'];
  declare readonly listStrands: WarpCoreRuntimeSurface['listStrands'];
  declare readonly dropStrand: WarpCoreRuntimeSurface['dropStrand'];
  /** @deprecated ALL materialization APIs are deprecated in favor of pure Optic lenses and unmaterialized Intent admission. */
  declare readonly materializeStrand: WarpCoreRuntimeSurface['materializeStrand'];
  declare readonly getStrandPatches: WarpCoreRuntimeSurface['getStrandPatches'];
  declare readonly patchesForStrand: WarpCoreRuntimeSurface['patchesForStrand'];
  declare readonly createStrandPatch: WarpCoreRuntimeSurface['createStrandPatch'];
  declare readonly patchStrand: WarpCoreRuntimeSurface['patchStrand'];
  declare readonly queueStrandIntent: WarpCoreRuntimeSurface['queueStrandIntent'];
  declare readonly listStrandIntents: WarpCoreRuntimeSurface['listStrandIntents'];
  declare readonly tickStrand: WarpCoreRuntimeSurface['tickStrand'];
  declare readonly analyzeConflicts: WarpCoreRuntimeSurface['analyzeConflicts'];
  declare readonly createCheckpoint: WarpCoreRuntimeSurface['createCheckpoint'];
  declare readonly syncCoverage: WarpCoreRuntimeSurface['syncCoverage'];
  declare readonly maybeRunGC: WarpCoreRuntimeSurface['maybeRunGC'];
  declare readonly runGC: WarpCoreRuntimeSurface['runGC'];
  declare readonly getGCMetrics: WarpCoreRuntimeSurface['getGCMetrics'];
  declare readonly patchesFor: WarpCoreRuntimeSurface['patchesFor'];
  /** @deprecated ALL materialization APIs are deprecated in favor of pure Optic lenses and unmaterialized Intent admission. */
  declare readonly materializeSlice: WarpCoreRuntimeSurface['materializeSlice'];
  declare readonly loadPatchBySha: WarpCoreRuntimeSurface['loadPatchBySha'];
  declare readonly buildPatchDivergence: WarpCoreRuntimeSurface['buildPatchDivergence'];
  declare readonly compareStrand: WarpCoreRuntimeSurface['compareStrand'];
  declare readonly planStrandTransfer: WarpCoreRuntimeSurface['planStrandTransfer'];
  declare readonly compareCoordinates: WarpCoreRuntimeSurface['compareCoordinates'];
  declare readonly diff: WarpCoreRuntimeSurface['diff'];
  declare readonly planCoordinateTransfer: WarpCoreRuntimeSurface['planCoordinateTransfer'];
  declare readonly subscribe: WarpCoreRuntimeSurface['subscribe'];
  declare readonly watch: WarpCoreRuntimeSurface['watch'];
  declare readonly fork: WarpCoreRuntimeSurface['fork'];
  declare readonly createWormhole: WarpCoreRuntimeSurface['createWormhole'];
  declare _effectPipeline: EffectPipeline | null;
  declare readonly _crypto: CryptoPort;

  static async open(options: WarpCoreOpenInput): Promise<WarpCore> {
    return WarpCore._adopt(await openWarpCoreRuntimeProduct(options));
  }

  /**
   * Adopts an explicit structural core surface as a WarpCore instance.
   */
  static _adopt(surface: object | WarpCore): WarpCore {
    if (surface instanceof WarpCore) {
      return surface;
    }

    Object.setPrototypeOf(surface, WarpCore.prototype);
    if (surface instanceof WarpCore) {
      return Object.freeze(surface);
    }

    throw new WarpError('failed to adopt runtime as WarpCore', 'E_WARP_CORE_ADOPT');
  }

  get effectPipeline(): EffectPipeline | null {
    return this._effectPipeline;
  }

  set effectPipeline(pipeline: EffectPipeline | null) {
    this._effectPipeline = pipeline;
  }

  get effectEmissions(): ReadonlyArray<EffectEmission> {
    return this._effectPipeline ? this._effectPipeline.emissions : [];
  }

  get deliveryObservations(): ReadonlyArray<DeliveryObservation> {
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
}
