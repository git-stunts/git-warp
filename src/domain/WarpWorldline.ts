/**
 * Deprecated worldline compatibility handle for application read/write workflows.
 *
 * @deprecated Use the root intent/timeline/reading/receipt API for new
 * application workflows. `WarpWorldline` is migration-only compatibility.
 */
import WarpError from './errors/WarpError.ts';
import QueryError from './errors/QueryError.ts';

import { type WarpGraphDeps } from './WarpGraph.ts';
import WarpWorldlineCoordinate from './WarpWorldlineCoordinate.ts';
import WarpWorldlineOpticBasis from './WarpWorldlineOpticBasis.ts';
import { openRuntimeHostProduct } from './warp/RuntimeHostProduct.ts';
import type { Aperture } from './types/Aperture.ts';
import type { PatchBuilder } from './services/PatchBuilder.ts';
import type ProjectionHandle from './services/ProjectionHandle.ts';
import type Observer from './services/query/Observer.ts';
import WorldlineOptic from './services/optic/WorldlineOptic.ts';
import CheckpointTailBasisVerifier from './services/optic/CheckpointTailBasisVerifier.ts';
import CoordinateCheckpointTailOpticSource from './services/optic/CoordinateCheckpointTailOpticSource.ts';
import createBoundedMemoryCapabilityReport from './memory/createBoundedMemoryCapabilityReport.ts';
import type { IntentAdmissionReceipt } from './admission/IntentAdmissionReceipt.ts';
import type { WarpIntentDescriptor } from './types/WarpIntentDescriptor.ts';
import type { PatchCommitResult } from './types/PatchCommitResult.ts';
import type { WarpStrandOpticBasis } from './WarpStrandOpticBasis.ts';

export type { WarpStrandOpticBasis } from './WarpStrandOpticBasis.ts';

export type WarpWorldlineOpenOptions = Omit<WarpGraphDeps, 'graphName'> & {
  readonly worldlineName: string;
  readonly graphName?: never;
};

export type WarpWorldlinePatchBuild = (
  patch: PatchBuilder,
) => void | Promise<void>;

type CommitPatch = (build: WarpWorldlinePatchBuild) => Promise<string>;
type CommitPatchWithEvidence = (build: WarpWorldlinePatchBuild) => Promise<PatchCommitResult>;
type CreateDraft = (
  name: string,
  coordinate?: WarpWorldlineCoordinate,
) => Promise<void>;
type WorldlineOptions = Parameters<ProjectionHandle['seek']>[0];
type CreateWorldline = (options?: WorldlineOptions) => ProjectionHandle;
type PatchDraft = (name: string, build: WarpWorldlinePatchBuild) => Promise<string>;
type PatchDraftWithEvidence = (
  name: string,
  build: WarpWorldlinePatchBuild,
) => Promise<PatchCommitResult>;
type PreviewDraftJoin = (name: string) => Promise<readonly string[]>;
type RuntimeGraph = Awaited<ReturnType<typeof openRuntimeHostProduct>>;
type PrepareOpticBasis = () => Promise<WarpWorldlineOpticBasis>;
type PrepareForkOpticBasis = () => Promise<WarpWorldlineOpticBasis>;
type DraftWorldlineOptions = Pick<
  WarpWorldlineConstructionOptions,
  | 'createDraft'
  | 'patchDraft'
  | 'patchDraftWithEvidence'
  | 'prepareStrandOptic'
  | 'previewDraftJoin'
>;
type GetFrontier = () => Promise<Map<string, string>>;
type ReadOpticBasis = () => WarpWorldlineOpticBasis | null;
type ReadCapabilities = typeof createBoundedMemoryCapabilityReport;
type AdmitIntent = (descriptor: WarpIntentDescriptor) => Promise<IntentAdmissionReceipt>;
type PrepareStrandOptic = (
  name: string,
  checkpointSha: string,
) => Promise<WarpStrandOpticBasis>;

type WarpWorldlineConstructionOptions = {
  readonly worldlineName: string;
  readonly writerId: string;
  readonly commitPatch: CommitPatch;
  readonly commitPatchWithEvidence?: CommitPatchWithEvidence;
  readonly createDraft?: CreateDraft;
  readonly createWorldline: CreateWorldline;
  readonly patchDraft?: PatchDraft;
  readonly patchDraftWithEvidence?: PatchDraftWithEvidence;
  readonly previewDraftJoin?: PreviewDraftJoin;
  readonly prepareStrandOptic?: PrepareStrandOptic;
  readonly prepareOpticBasis?: PrepareOpticBasis;
  readonly prepareForkOpticBasis?: PrepareForkOpticBasis;
  readonly getFrontier?: GetFrontier;
  readonly readOpticBasis?: ReadOpticBasis;
  readonly readCapabilities?: ReadCapabilities;
  readonly admitIntent: AdmitIntent;
};

export default class WarpWorldline {
  readonly worldlineName: string;
  readonly writerId: string;
  private readonly _commitPatch: CommitPatch;
  private readonly _commitPatchWithEvidence: CommitPatchWithEvidence | null;
  private readonly _createDraft: CreateDraft | null;
  private readonly _createWorldline: CreateWorldline;
  private readonly _patchDraft: PatchDraft | null;
  private readonly _patchDraftWithEvidence: PatchDraftWithEvidence | null;
  private readonly _previewDraftJoin: PreviewDraftJoin | null;
  private readonly _prepareStrandOptic: PrepareStrandOptic | null;
  private readonly _prepareOpticBasis: PrepareOpticBasis | null;
  private readonly _prepareForkOpticBasis: PrepareForkOpticBasis | null;
  private readonly _getFrontier: GetFrontier | null;
  private readonly _readOpticBasis: ReadOpticBasis | null;
  private readonly _readCapabilities: ReadCapabilities;
  private readonly _admitIntent: AdmitIntent;

  constructor(options: WarpWorldlineConstructionOptions) {
    assertNonEmpty(options.worldlineName, 'worldlineName');
    assertNonEmpty(options.writerId, 'writerId');
    this.worldlineName = options.worldlineName;
    this.writerId = options.writerId;
    this._commitPatch = options.commitPatch;
    this._commitPatchWithEvidence = optionalPort(options.commitPatchWithEvidence);
    this._createDraft = optionalPort(options.createDraft);
    this._createWorldline = options.createWorldline;
    this._patchDraft = optionalPort(options.patchDraft);
    this._patchDraftWithEvidence = optionalPort(options.patchDraftWithEvidence);
    this._previewDraftJoin = optionalPort(options.previewDraftJoin);
    this._prepareStrandOptic = optionalPort(options.prepareStrandOptic);
    this._prepareOpticBasis = optionalPort(options.prepareOpticBasis);
    this._prepareForkOpticBasis = optionalPort(options.prepareForkOpticBasis);
    this._getFrontier = optionalPort(options.getFrontier);
    this._readOpticBasis = optionalPort(options.readOpticBasis);
    this._readCapabilities = options.readCapabilities ?? createBoundedMemoryCapabilityReport;
    this._admitIntent = options.admitIntent;
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

  async createDraft(
    name: string,
    coordinate?: WarpWorldlineCoordinate,
  ): Promise<void> {
    if (this._createDraft === null) {
      throw new WarpError('WarpWorldline was not opened with draft support', 'E_WARP_WORLDLINE_DRAFT_UNAVAILABLE');
    }
    await this._createDraft(name, coordinate);
  }

  async patchDraft(name: string, build: WarpWorldlinePatchBuild): Promise<string> {
    if (this._patchDraft === null) {
      throw new WarpError('WarpWorldline was not opened with draft support', 'E_WARP_WORLDLINE_DRAFT_UNAVAILABLE');
    }
    return await this._patchDraft(name, build);
  }

  async patchDraftWithEvidence(
    name: string,
    build: WarpWorldlinePatchBuild,
  ): Promise<PatchCommitResult> {
    if (this._patchDraftWithEvidence === null) {
      throw new WarpError(
        'WarpWorldline was not opened with draft storage evidence support',
        'E_WARP_WORLDLINE_STORAGE_EVIDENCE_UNAVAILABLE',
      );
    }
    return await this._patchDraftWithEvidence(name, build);
  }

  async previewDraftJoin(name: string): Promise<readonly string[]> {
    if (this._previewDraftJoin === null) {
      throw new WarpError('WarpWorldline was not opened with draft support', 'E_WARP_WORLDLINE_DRAFT_UNAVAILABLE');
    }
    return await this._previewDraftJoin(name);
  }

  async prepareStrandOptic(
    name: string,
    checkpointSha: string,
  ): Promise<WarpStrandOpticBasis> {
    if (this._prepareStrandOptic === null) {
      throw new WarpError(
        'WarpWorldline was not opened with bounded strand read support',
        'E_WARP_WORLDLINE_STRAND_OPTIC_UNAVAILABLE',
      );
    }
    return await this._prepareStrandOptic(name, checkpointSha);
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

  optic(): WorldlineOptic {
    return this.live().optic();
  }

  capabilities(): ReturnType<ReadCapabilities> {
    return this._readCapabilities();
  }

  async prepareOpticBasis(): Promise<WarpWorldlineOpticBasis> {
    if (this._prepareOpticBasis === null) {
      throw new WarpError(
        'WarpWorldline was not opened with optic basis preparation support',
        'E_WARP_WORLDLINE_OPTIC_BASIS_UNAVAILABLE',
      );
    }
    return await this._prepareOpticBasis();
  }

  async prepareForkOpticBasis(): Promise<WarpWorldlineOpticBasis> {
    if (this._prepareForkOpticBasis === null) {
      throw new WarpError(
        'WarpWorldline was not opened with fork coordinate support',
        'E_WARP_WORLDLINE_FORK_BASIS_UNAVAILABLE',
      );
    }
    return await this._prepareForkOpticBasis();
  }

  async coordinate(): Promise<WarpWorldlineCoordinate> {
    if (this._getFrontier === null || this._readOpticBasis === null) {
      throw new WarpError(
        'WarpWorldline was not opened with coordinate support',
        'E_WARP_WORLDLINE_COORDINATE_UNAVAILABLE',
      );
    }
    const basis = this._readOpticBasis();
    if (basis === null) {
      throw new QueryError('worldline coordinate requires a prepared checkpoint-tail optic basis', {
        code: 'E_OPTIC_NO_BOUNDED_BASIS',
        context: {
          graphName: this.worldlineName,
          reason: 'missing-prepared-worldline-coordinate-basis',
        },
      });
    }
    return new WarpWorldlineCoordinate({
      worldlineName: this.worldlineName,
      checkpointSha: basis.checkpointSha,
      frontier: await this._getFrontier(),
      createWorldline: this._createWorldline,
    });
  }
}

function optionalPort<TPort>(port: TPort | undefined): TPort | null {
  return port ?? null;
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
  let preparedOpticBasis: WarpWorldlineOpticBasis | null = null;
  const prepareOpticBasis = async (): Promise<WarpWorldlineOpticBasis> => {
    const basis = await new CheckpointTailBasisVerifier({ source: graph }).verify();
    preparedOpticBasis = new WarpWorldlineOpticBasis({
      worldlineName,
      checkpointSha: basis.checkpointSha,
    });
    return preparedOpticBasis;
  };

  return new WarpWorldline({
    worldlineName,
    writerId: graph.writerId,
    commitPatch: async (build) => await graph.patch(build),
    commitPatchWithEvidence: async (build) => await graph.patchWithEvidence(build),
    ...draftWorldlineOptions(graph),
    createWorldline: (worldlineOptions) => graph.worldline(worldlineOptions),
    prepareOpticBasis,
    prepareForkOpticBasis: async () =>
      await prepareForkOpticBasis(graph, prepareOpticBasis),
    getFrontier: async () => await graph.getFrontier(),
    readOpticBasis: () => preparedOpticBasis,
    admitIntent: async (descriptor) => await graph.admitIntent(descriptor),
  });
}

async function prepareForkOpticBasis(
  graph: RuntimeGraph,
  prepare: PrepareOpticBasis,
): Promise<WarpWorldlineOpticBasis> {
  try {
    return await prepare();
  } catch (error) {
    if (!(error instanceof QueryError) || error.code !== 'E_OPTIC_NO_BOUNDED_BASIS') {
      throw error;
    }
  }
  await graph.materialize();
  await graph.createCheckpoint();
  return await prepare();
}

function draftWorldlineOptions(graph: RuntimeGraph): DraftWorldlineOptions {
  return {
    createDraft: async (name, coordinate) =>
      await createDraft(graph, name, coordinate),
    patchDraft: async (name, build) => await graph.patchStrand(name, build),
    patchDraftWithEvidence: async (name, build) =>
      await graph.patchStrandWithEvidence(name, build),
    previewDraftJoin: async (name) => await previewDraftJoin(graph, name),
    prepareStrandOptic: async (name, checkpointSha) =>
      await prepareStrandOpticBasis(graph, name, checkpointSha),
  };
}

async function createDraft(
  graph: RuntimeGraph,
  name: string,
  coordinate: WarpWorldlineCoordinate | undefined,
): Promise<void> {
  await graph.createStrand({
    strandId: name,
    owner: graph.writerId,
    ...(coordinate === undefined ? {} : { baseFrontier: coordinate.frontier() }),
  });
}

async function previewDraftJoin(
  graph: RuntimeGraph,
  name: string,
): Promise<readonly string[]> {
  await graph.materializeStrand(name, { receipts: true });
  return (await graph.getStrandPatches(name)).map((entry) => entry.sha);
}

async function prepareStrandOpticBasis(
  graph: RuntimeGraph,
  name: string,
  checkpointSha: string,
): Promise<WarpStrandOpticBasis> {
  const descriptor = await graph.getStrand(name);
  if (descriptor === null) {
    throw new WarpError(
      `Strand '${name}' is unavailable`,
      'E_WARP_WORLDLINE_STRAND_UNAVAILABLE',
      { context: { name } },
    );
  }
  // A strand overlay already has its own writer identity. Adding its pinned
  // head to the captured parent frontier lets the checkpoint-tail optic scan
  // it as one more bounded writer tail, without materializing the graph.
  const frontier = strandFrontier(descriptor);
  return Object.freeze({
    checkpointSha,
    frontierEntries: freezeFrontierEntries(frontier),
    optic: new WorldlineOptic({
      source: new CoordinateCheckpointTailOpticSource({
        source: graph,
        checkpointSha,
        frontier,
      }),
    }),
  });
}

function strandFrontier(
  descriptor: NonNullable<Awaited<ReturnType<RuntimeGraph['getStrand']>>>,
): Map<string, string> {
  const frontier = new Map(Object.entries(descriptor.baseObservation.frontier));
  addOverlayHead(frontier, descriptor.overlay);
  for (const overlay of descriptor.braid.readOverlays) {
    addOverlayHead(frontier, overlay);
  }
  return frontier;
}

function addOverlayHead(
  frontier: Map<string, string>,
  overlay: { readonly overlayId: string; readonly headPatchSha: string | null },
): void {
  if (overlay.headPatchSha !== null) {
    frontier.set(overlay.overlayId, overlay.headPatchSha);
  }
}

function freezeFrontierEntries(frontier: Map<string, string>) {
  return Object.freeze(
    [...frontier.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([writerId, patchSha]) => Object.freeze({ writerId, patchSha })),
  );
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
