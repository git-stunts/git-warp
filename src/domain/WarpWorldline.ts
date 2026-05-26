/**
 * Worldline-first public handle for application read/write workflows.
 *
 * This surface intentionally wraps only the minimum commitment and revelation
 * functions needed by first-use application code. Substrate diagnostics remain
 * on WarpCore/openWarpGraph compatibility surfaces.
 */
import WarpError from './errors/WarpError.ts';

import type { WarpGraphDeps } from './WarpGraph.ts';
import type { Aperture } from './types/Aperture.ts';
import type { PatchBuilder } from './services/PatchBuilder.ts';
import type Worldline from './services/Worldline.ts';
import type Observer from './services/query/Observer.ts';
import type WorldlineOptic from './services/optic/WorldlineOptic.ts';
import type { WorldlineOptions } from './capabilities/QueryCapability.ts';

export type WarpWorldlineOpenOptions = Omit<WarpGraphDeps, 'graphName'> & {
  readonly worldlineName: string;
  readonly graphName?: never;
};

export type WarpWorldlinePatchBuild = (
  patch: PatchBuilder,
) => void | Promise<void>;

type CommitPatch = (build: WarpWorldlinePatchBuild) => Promise<string>;
type CreateWorldline = (options?: WorldlineOptions) => Worldline;

type WarpWorldlineConstructionOptions = {
  readonly worldlineName: string;
  readonly writerId: string;
  readonly commitPatch: CommitPatch;
  readonly createWorldline: CreateWorldline;
};

export default class WarpWorldline {
  readonly worldlineName: string;
  readonly writerId: string;
  private readonly _commitPatch: CommitPatch;
  private readonly _createWorldline: CreateWorldline;

  constructor(options: WarpWorldlineConstructionOptions) {
    assertNonEmpty(options.worldlineName, 'worldlineName');
    assertNonEmpty(options.writerId, 'writerId');
    this.worldlineName = options.worldlineName;
    this.writerId = options.writerId;
    this._commitPatch = options.commitPatch;
    this._createWorldline = options.createWorldline;
    Object.freeze(this);
  }

  async commit(build: WarpWorldlinePatchBuild): Promise<string> {
    return await this._commitPatch(build);
  }

  live(): Worldline {
    return this._createWorldline();
  }

  async seek(options?: WorldlineOptions): Promise<Worldline> {
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
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) {
    throw new WarpError(
      'WarpWorldline requires non-empty identity fields',
      'E_WARP_WORLDLINE_IDENTITY',
      { context: { field } },
    );
  }
}
