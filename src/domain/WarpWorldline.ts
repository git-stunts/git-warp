/**
 * Deprecated worldline compatibility handle for application read/write workflows.
 *
 * @deprecated Use the root intent/timeline/reading/receipt API for new
 * application workflows. `WarpWorldline` is migration-only compatibility.
 */
import WarpError from './errors/WarpError.ts';
import type AssetStoragePort from '../ports/AssetStoragePort.ts';

import { type WarpGraphDeps } from './WarpGraph.ts';
import type WarpWorldlineCoordinate from './WarpWorldlineCoordinate.ts';
import { openRuntimeHostProduct } from './warp/RuntimeHostProduct.ts';
import type { Aperture } from './types/Aperture.ts';
import type { PatchBuilder } from './services/PatchBuilder.ts';
import type ProjectionHandle from './services/ProjectionHandle.ts';
import type Observer from './services/query/Observer.ts';
import type WorldlineOptic from './services/optic/WorldlineOptic.ts';
import { captureConeCoordinate, captureRetainedConeCoordinate, liveConeOptic } from './WarpWorldlineConeOptics.ts';
import ConeLaneBasis from './services/cone/ConeLaneBasis.ts';
import type StrandConeBasis from './services/strand/StrandConeBasis.ts';
import createBoundedMemoryCapabilityReport from './memory/createBoundedMemoryCapabilityReport.ts';
import type { IntentAdmissionReceipt } from './admission/IntentAdmissionReceipt.ts';
import type { WarpIntentDescriptor } from './types/WarpIntentDescriptor.ts';
import type { PatchCommitResult } from './types/PatchCommitResult.ts';
import WarpDraftPatchEntry from './WarpDraftPatchEntry.ts';
import { createWorldlineDraft } from './WarpWorldlineDraftStorage.ts';
import { bindEntityAdmissionInventoryRuntime } from './entity/EntityAdmissionInventoryRuntime.ts';

export { WarpDraftPatchEntry };

export type WarpWorldlineOpenOptions = Omit<WarpGraphDeps, 'graphName'> & {
  readonly worldlineName: string;
  readonly graphName?: never;
};

export type WarpWorldlinePatchBuild = (
  patch: PatchBuilder,
) => void | Promise<void>;

type CommitPatch = (build: WarpWorldlinePatchBuild) => Promise<string>;
type CommitPatchWithEvidence = (build: WarpWorldlinePatchBuild) => Promise<PatchCommitResult>;
type CreateDraft = (name: string, coordinate: WarpWorldlineCoordinate) => Promise<void>;
type OpenDraft = (name: string) => Promise<StrandConeBasis>;
type LoadDraftPatchEntries = (strandId: string) => Promise<readonly WarpDraftPatchEntry[]>;
type WorldlineOptions = Parameters<ProjectionHandle['seek']>[0];
type CreateWorldline = (options?: WorldlineOptions) => ProjectionHandle;
type PatchDraftWithEvidence = (strandId: string, build: WarpWorldlinePatchBuild) => Promise<PatchCommitResult>;
type PreviewDraftJoin = (name: string) => Promise<readonly string[]>;
type RuntimeGraph = Awaited<ReturnType<typeof openRuntimeHostProduct>>;
type DraftWorldlineOptions = Pick<
  WarpWorldlineConstructionOptions,
  'createDraft' | 'openDraft' | 'loadDraftPatchEntries' | 'patchDraftWithEvidence' | 'previewDraftJoin'
>;
type ReadCapabilities = typeof createBoundedMemoryCapabilityReport;
type AdmitIntent = (descriptor: WarpIntentDescriptor) => Promise<IntentAdmissionReceipt>;
type WarpWorldlineConstructionOptions = {
  readonly assetStorage?: AssetStoragePort | null;
  readonly worldlineName: string;
  readonly writerId: string;
  readonly commitPatch: CommitPatch;
  readonly commitPatchWithEvidence?: CommitPatchWithEvidence;
  readonly createDraft?: CreateDraft;
  readonly openDraft?: OpenDraft;
  readonly loadDraftPatchEntries?: LoadDraftPatchEntries;
  readonly createWorldline: CreateWorldline;
  readonly patchDraftWithEvidence?: PatchDraftWithEvidence;
  readonly previewDraftJoin?: PreviewDraftJoin;
  readonly readCapabilities?: ReadCapabilities;
  readonly admitIntent: AdmitIntent;
  readonly cone?: ConeLaneBasis | null;
};

export default class WarpWorldline {
  readonly assetStorage: AssetStoragePort | null;
  readonly worldlineName: string;
  readonly writerId: string;
  private readonly _commitPatch: CommitPatch;
  private readonly _commitPatchWithEvidence: CommitPatchWithEvidence | null;
  private readonly _createDraft: CreateDraft | null;
  private readonly _openDraft: OpenDraft | null;
  private readonly _createWorldline: CreateWorldline;
  private readonly _loadDraftPatchEntries: LoadDraftPatchEntries | null;
  private readonly _patchDraftWithEvidence: PatchDraftWithEvidence | null;
  private readonly _previewDraftJoin: PreviewDraftJoin | null;
  private readonly _readCapabilities: ReadCapabilities;
  private readonly _admitIntent: AdmitIntent;
  private readonly _cone: ConeLaneBasis | null;

  constructor(options: WarpWorldlineConstructionOptions) {
    this.assetStorage = options.assetStorage ?? null;
    assertNonEmpty(options.worldlineName, 'worldlineName');
    assertNonEmpty(options.writerId, 'writerId');
    this.worldlineName = options.worldlineName;
    this.writerId = options.writerId;
    this._commitPatch = options.commitPatch;
    this._commitPatchWithEvidence = optionalPort(options.commitPatchWithEvidence);
    this._createDraft = optionalPort(options.createDraft);
    this._openDraft = optionalPort(options.openDraft);
    this._createWorldline = options.createWorldline;
    this._loadDraftPatchEntries = optionalPort(options.loadDraftPatchEntries);
    this._patchDraftWithEvidence = optionalPort(options.patchDraftWithEvidence);
    this._previewDraftJoin = optionalPort(options.previewDraftJoin);
    this._readCapabilities = options.readCapabilities ?? createBoundedMemoryCapabilityReport;
    this._admitIntent = options.admitIntent;
    this._cone = options.cone ?? null;
    Object.freeze(this);
  }

  async commit(build: WarpWorldlinePatchBuild): Promise<string> {
    return await this._commitPatch(build);
  }

  async commitWithEvidence(build: WarpWorldlinePatchBuild): Promise<PatchCommitResult> {
    if (this._commitPatchWithEvidence === null) {
      throw new WarpError(
        'WarpWorldline was not opened with storage evidence support',
        'E_WARP_WORLDLINE_STORAGE_EVIDENCE_UNAVAILABLE',
      );
    }
    return await this._commitPatchWithEvidence(build);
  }

  async admitIntent(descriptor: WarpIntentDescriptor): Promise<IntentAdmissionReceipt> {
    return await this._admitIntent(descriptor);
  }

  /** Creates a strand forked at `coordinate`, pinning the cone basis it captured as the strand's base (#1039). */
  async createDraft(name: string, coordinate: WarpWorldlineCoordinate): Promise<void> {
    await requireDraftPort(this._createDraft)(name, coordinate);
  }

  /** Opens a strand's pinned base and its own cone basis (#1039). */
  async openDraft(name: string): Promise<StrandConeBasis> {
    return await requireDraftPort(this._openDraft)(name);
  }

  async loadDraftPatchEntries(strandId: string): Promise<readonly WarpDraftPatchEntry[]> {
    const entries = await requireDraftPort(this._loadDraftPatchEntries)(strandId);
    return Object.freeze(entries.map((entry) =>
      entry instanceof WarpDraftPatchEntry
        ? entry
        : new WarpDraftPatchEntry(entry)
    ));
  }

  /** One strand write over the strand's cone records (#1039). */
  async patchDraftWithEvidence(
    strandId: string,
    build: WarpWorldlinePatchBuild,
  ): Promise<PatchCommitResult> {
    return await requireDraftPort(this._patchDraftWithEvidence)(strandId, build);
  }

  async previewDraftJoin(name: string): Promise<readonly string[]> {
    return await requireDraftPort(this._previewDraftJoin)(name);
  }

  live(): ProjectionHandle {
    return this._createWorldline();
  }

  async seek(options?: WorldlineOptions): Promise<ProjectionHandle> {
    return await this.live().seek(options);
  }

  async observer(config: Aperture): Promise<Observer>;
  async observer(name: string, config: Aperture): Promise<Observer>;
  async observer(
    nameOrConfig: string | Aperture,
    config?: Aperture,
  ): Promise<Observer> {
    const worldline = this.live();
    if (typeof nameOrConfig === 'string') {
      if (config === undefined) {
        throw new WarpError(
          'WarpWorldline observer requires an aperture config',
          'E_WARP_WORLDLINE_OBSERVER_CONFIG',
        );
      }
      return await worldline.observer(nameOrConfig, config);
    }
    return await worldline.observer(nameOrConfig);
  }

  /** A live public optic over the lane's cone basis (#1039). */
  optic(): WorldlineOptic {
    return liveConeOptic(this.worldlineName, this.coneBasis());
  }

  /**
   * The lane's cone basis, which every public read and write uses (#1039).
   * A handle opened over storage that keeps no cone records serves only the
   * deprecated compatibility reads and refuses public paths.
   */
  coneBasis(): ConeLaneBasis {
    if (this._cone === null) {
      throw new WarpError(
        'WarpWorldline storage keeps no cone records for public reads and writes',
        'E_WARP_WORLDLINE_CONE_UNAVAILABLE',
        { context: { worldlineName: this.worldlineName } },
      );
    }
    return this._cone;
  }

  /** Captures one coordinate for an Observation's Readings: the lane's cone basis advanced once (#1039). */
  async captureReadCoordinate(): Promise<WarpWorldlineCoordinate> {
    return await captureConeCoordinate(this.worldlineName, this.coneBasis());
  }

  /** Captures a coordinate an application keeps: advanced once and retained through Git GC (#1039). */
  async captureCoordinate(): Promise<WarpWorldlineCoordinate> {
    return await captureRetainedConeCoordinate(this.worldlineName, this.coneBasis());
  }

  capabilities(): ReturnType<ReadCapabilities> {
    return this._readCapabilities();
  }
}

function optionalPort<TPort>(port: TPort | undefined): TPort | null {
  return port ?? null;
}

function requireDraftPort<TPort>(port: TPort | null): TPort {
  if (port === null) {
    throw new WarpError('WarpWorldline was not opened with draft support', 'E_WARP_WORLDLINE_DRAFT_UNAVAILABLE');
  }
  return port;
}

/**
 * Opens a deprecated worldline compatibility handle.
 *
 * @deprecated Use the root `openWarp().timeline(name)` API for new
 * application workflows. This function is migration-only.
 */
export async function openWarpWorldline(
  options: WarpWorldlineOpenOptions,
): Promise<WarpWorldline> {
  assertNonEmpty(options.worldlineName, 'worldlineName');
  assertNonEmpty(options.writerId, 'writerId');
  const { worldlineName, ...graphOptions } = options;
  const graph = await openRuntimeHostProduct({
    ...graphOptions,
    graphName: worldlineName,
  });
  return createWarpWorldline(worldlineName, graph);
}

function createWarpWorldline(worldlineName: string, graph: RuntimeGraph): WarpWorldline {
  const cone = coneLaneBasis(worldlineName, graph);
  const worldline = new WarpWorldline({
    worldlineName, writerId: graph.writerId, assetStorage: graph._assetStorage,
    commitPatch: async (build) => await graph.patch(build),
    commitPatchWithEvidence: async (build) => await graph.patchWithEvidence(build),
    ...draftWorldlineOptions(graph),
    createWorldline: (worldlineOptions) => graph.worldline(worldlineOptions),
    admitIntent: async (descriptor) => await graph.admitIntent(descriptor),
    cone,
  });
  if (cone !== null) {
    bindEntityAdmissionInventoryRuntime(worldline, cone);
  }
  return worldline;
}

function coneLaneBasis(worldlineName: string, graph: RuntimeGraph): ConeLaneBasis | null {
  if (graph._coneRecords === null || graph._conePatches === null) {
    return null;
  }
  return ConeLaneBasis.ofLane({ store: graph._coneRecords, feed: graph._conePatches, lane: worldlineName });
}

function draftWorldlineOptions(graph: RuntimeGraph): DraftWorldlineOptions {
  return {
    createDraft: async (name, coordinate) => await createWorldlineDraft(graph, name, coordinate),
    openDraft: async (name) => await graph.openStrandCone(name),
    loadDraftPatchEntries: async (strandId) =>
      Object.freeze(
        (await graph.getStrandOverlayPatches(strandId))
          .map((entry) => new WarpDraftPatchEntry(entry)),
      ),
    patchDraftWithEvidence: async (strandId, build) =>
      await graph.patchStrandOnConeWithEvidence(strandId, build),
    previewDraftJoin: async (name) => await previewDraftJoin(graph, name),
  };
}

async function previewDraftJoin(
  graph: RuntimeGraph,
  name: string,
): Promise<readonly string[]> {
  await graph.materializeStrand(name, { receipts: true });
  return (await graph.getStrandPatches(name)).map((entry) => entry.sha);
}

function assertNonEmpty(value: string | null | undefined, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(
      'WarpWorldline requires non-empty identity fields',
      'E_WARP_WORLDLINE_IDENTITY',
      { context: { field } },
    );
  }
}
