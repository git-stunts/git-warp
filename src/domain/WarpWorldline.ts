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
import type WorldlineOptic from './services/optic/WorldlineOptic.ts';
import CheckpointTailBasisVerifier from './services/optic/CheckpointTailBasisVerifier.ts';
import createBoundedMemoryCapabilityReport from './memory/createBoundedMemoryCapabilityReport.ts';
import type { WarpIntentDescriptor, WarpIntentOutcome } from './types/WarpIntentDescriptor.ts';

export type WarpWorldlineOpenOptions = Omit<WarpGraphDeps, 'graphName'> & {
  readonly worldlineName: string;
  readonly graphName?: never;
};

export type WarpWorldlinePatchBuild = (
  patch: PatchBuilder,
) => void | Promise<void>;

type CommitPatch = (build: WarpWorldlinePatchBuild) => Promise<string>;
type CreateDraft = (name: string) => Promise<void>;
type WorldlineOptions = Parameters<ProjectionHandle['seek']>[0];
type CreateWorldline = (options?: WorldlineOptions) => ProjectionHandle;
type PatchDraft = (name: string, build: WarpWorldlinePatchBuild) => Promise<string>;
type PreviewDraftJoin = (name: string) => Promise<readonly string[]>;
type RuntimeGraph = Awaited<ReturnType<typeof openRuntimeHostProduct>>;
type PrepareOpticBasis = () => Promise<WarpWorldlineOpticBasis>;
type DraftWorldlineOptions = Pick<
  WarpWorldlineConstructionOptions,
  'createDraft' | 'patchDraft' | 'previewDraftJoin'
>;
type GetFrontier = () => Promise<Map<string, string>>;
type ReadOpticBasis = () => WarpWorldlineOpticBasis | null;
type ReadCapabilities = typeof createBoundedMemoryCapabilityReport;
type AdmitIntent = (descriptor: WarpIntentDescriptor) => Promise<WarpIntentOutcome>;

type WarpWorldlineConstructionOptions = {
  readonly worldlineName: string;
  readonly writerId: string;
  readonly commitPatch: CommitPatch;
  readonly createDraft?: CreateDraft;
  readonly createWorldline: CreateWorldline;
  readonly patchDraft?: PatchDraft;
  readonly previewDraftJoin?: PreviewDraftJoin;
  readonly prepareOpticBasis?: PrepareOpticBasis;
  readonly getFrontier?: GetFrontier;
  readonly readOpticBasis?: ReadOpticBasis;
  readonly readCapabilities?: ReadCapabilities;
  readonly admitIntent: AdmitIntent;
};

export default class WarpWorldline {
  readonly worldlineName: string;
  readonly writerId: string;
  private readonly _commitPatch: CommitPatch;
  private readonly _createDraft: CreateDraft | null;
  private readonly _createWorldline: CreateWorldline;
  private readonly _patchDraft: PatchDraft | null;
  private readonly _previewDraftJoin: PreviewDraftJoin | null;
  private readonly _prepareOpticBasis: PrepareOpticBasis | null;
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
    this._createDraft = optionalPort(options.createDraft);
    this._createWorldline = options.createWorldline;
    this._patchDraft = optionalPort(options.patchDraft);
    this._previewDraftJoin = optionalPort(options.previewDraftJoin);
    this._prepareOpticBasis = optionalPort(options.prepareOpticBasis);
    this._getFrontier = optionalPort(options.getFrontier);
    this._readOpticBasis = optionalPort(options.readOpticBasis);
    this._readCapabilities = options.readCapabilities ?? createBoundedMemoryCapabilityReport;
    this._admitIntent = options.admitIntent;
    Object.freeze(this);
  }

  async commit(build: WarpWorldlinePatchBuild): Promise<string> {
    return await this._commitPatch(build);
  }

  async admitIntent(descriptor: WarpIntentDescriptor): Promise<WarpIntentOutcome> {
    return await this._admitIntent(descriptor);
  }

  async createDraft(name: string): Promise<void> {
    if (this._createDraft === null) {
      throw new WarpError('WarpWorldline was not opened with draft support', 'E_WARP_WORLDLINE_DRAFT_UNAVAILABLE');
    }
    await this._createDraft(name);
  }

  async patchDraft(name: string, build: WarpWorldlinePatchBuild): Promise<string> {
    if (this._patchDraft === null) {
      throw new WarpError('WarpWorldline was not opened with draft support', 'E_WARP_WORLDLINE_DRAFT_UNAVAILABLE');
    }
    return await this._patchDraft(name, build);
  }

  async previewDraftJoin(name: string): Promise<readonly string[]> {
    if (this._previewDraftJoin === null) {
      throw new WarpError('WarpWorldline was not opened with draft support', 'E_WARP_WORLDLINE_DRAFT_UNAVAILABLE');
    }
    return await this._previewDraftJoin(name);
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

  return new WarpWorldline({
    worldlineName,
    writerId: graph.writerId,
    commitPatch: async (build) => await graph.patch(build),
    ...draftWorldlineOptions(graph),
    createWorldline: (worldlineOptions) => graph.worldline(worldlineOptions),
    prepareOpticBasis: async () => {
      const basis = await new CheckpointTailBasisVerifier({ source: graph }).verify();
      preparedOpticBasis = new WarpWorldlineOpticBasis({
        worldlineName,
        checkpointSha: basis.checkpointSha,
      });
      return preparedOpticBasis;
    },
    getFrontier: async () => await graph.getFrontier(),
    readOpticBasis: () => preparedOpticBasis,
    admitIntent: async (descriptor) => await graph.admitIntent(descriptor),
  });
}

function draftWorldlineOptions(graph: RuntimeGraph): DraftWorldlineOptions {
  return {
    createDraft: async (name) => {
      await graph.createStrand({
        strandId: name,
        owner: graph.writerId,
      });
    },
    patchDraft: async (name, build) => await graph.patchStrand(name, build),
    previewDraftJoin: async (name) => {
      await graph.materializeStrand(name, { receipts: true });
      return (await graph.getStrandPatches(name)).map((entry) => entry.sha);
    },
  };
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
