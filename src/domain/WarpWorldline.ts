/**
 * Worldline-first public handle for application read/write workflows.
 *
 * This surface intentionally wraps only the minimum commitment and revelation
 * functions needed by first-use application code. Substrate diagnostics remain
 * on WarpCore/openWarpGraph compatibility surfaces.
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

export type WarpWorldlineOpenOptions = Omit<WarpGraphDeps, 'graphName'> & {
  readonly worldlineName: string;
  readonly graphName?: never;
};

export type WarpWorldlinePatchBuild = (
  patch: PatchBuilder,
) => void | Promise<void>;

type CommitPatch = (build: WarpWorldlinePatchBuild) => Promise<string>;
type WorldlineOptions = Parameters<ProjectionHandle['seek']>[0];
type CreateWorldline = (options?: WorldlineOptions) => ProjectionHandle;
type PrepareOpticBasis = () => Promise<WarpWorldlineOpticBasis>;
type GetFrontier = () => Promise<Map<string, string>>;
type ReadOpticBasis = () => WarpWorldlineOpticBasis | null;
type ReadCapabilities = typeof createBoundedMemoryCapabilityReport;

type WarpWorldlineConstructionOptions = {
  readonly worldlineName: string;
  readonly writerId: string;
  readonly commitPatch: CommitPatch;
  readonly createWorldline: CreateWorldline;
  readonly prepareOpticBasis?: PrepareOpticBasis;
  readonly getFrontier?: GetFrontier;
  readonly readOpticBasis?: ReadOpticBasis;
  readonly readCapabilities?: ReadCapabilities;
};

export default class WarpWorldline {
  readonly worldlineName: string;
  readonly writerId: string;
  private readonly _commitPatch: CommitPatch;
  private readonly _createWorldline: CreateWorldline;
  private readonly _prepareOpticBasis: PrepareOpticBasis | null;
  private readonly _getFrontier: GetFrontier | null;
  private readonly _readOpticBasis: ReadOpticBasis | null;
  private readonly _readCapabilities: ReadCapabilities;

  constructor(options: WarpWorldlineConstructionOptions) {
    assertNonEmpty(options.worldlineName, 'worldlineName');
    assertNonEmpty(options.writerId, 'writerId');
    this.worldlineName = options.worldlineName;
    this.writerId = options.writerId;
    this._commitPatch = options.commitPatch;
    this._createWorldline = options.createWorldline;
    this._prepareOpticBasis = options.prepareOpticBasis ?? null;
    this._getFrontier = options.getFrontier ?? null;
    this._readOpticBasis = options.readOpticBasis ?? null;
    this._readCapabilities = options.readCapabilities ?? createBoundedMemoryCapabilityReport;
    Object.freeze(this);
  }

  async commit(build: WarpWorldlinePatchBuild): Promise<string> {
    return await this._commitPatch(build);
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
  let preparedOpticBasis: WarpWorldlineOpticBasis | null = null;

  return new WarpWorldline({
    worldlineName,
    writerId: graph.writerId,
    commitPatch: async (build) => await graph.patch(build),
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
  });
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
