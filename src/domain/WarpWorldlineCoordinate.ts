import WarpError from './errors/WarpError.ts';
import type WorldlineOptic from './services/optic/WorldlineOptic.ts';
import type ProjectionHandle from './services/ProjectionHandle.ts';
import type { WorldlineOptions, WorldlineSource } from './capabilities/QueryCapability.ts';

export type WarpWorldlineCoordinateFrontierEntry = {
  readonly writerId: string;
  readonly patchSha: string;
};

export type WarpWorldlineCoordinateOptions = {
  readonly worldlineName: string;
  readonly checkpointSha: string;
  readonly frontier: Map<string, string>;
  readonly createWorldline: (options?: WorldlineOptions) => ProjectionHandle;
};

export default class WarpWorldlineCoordinate {
  readonly kind: 'worldline-coordinate' = 'worldline-coordinate';
  readonly worldlineName: string;
  readonly checkpointSha: string;
  readonly frontierEntries: readonly WarpWorldlineCoordinateFrontierEntry[];
  private readonly _createWorldline: (options?: WorldlineOptions) => ProjectionHandle;

  constructor(options: WarpWorldlineCoordinateOptions) {
    assertFrontier(options.frontier);
    assertWorldlineFactory(options.createWorldline);
    assertNonEmpty(options.worldlineName, 'worldlineName');
    assertNonEmpty(options.checkpointSha, 'checkpointSha');
    this.worldlineName = options.worldlineName;
    this.checkpointSha = options.checkpointSha;
    this.frontierEntries = freezeFrontier(options.frontier);
    this._createWorldline = options.createWorldline;
    Object.freeze(this);
  }

  frontier(): Map<string, string> {
    return new Map(this.frontierEntries.map((entry) => [entry.writerId, entry.patchSha]));
  }

  source(): WorldlineSource {
    return {
      kind: 'coordinate',
      frontier: this.frontier(),
      checkpointSha: this.checkpointSha,
    };
  }

  optic(): WorldlineOptic {
    return this._createWorldline({ source: this.source() }).optic();
  }
}

function freezeFrontier(
  frontier: Map<string, string>
): readonly WarpWorldlineCoordinateFrontierEntry[] {
  return Object.freeze(
    [...frontier.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([writerId, patchSha]) => {
        assertNonEmpty(writerId, 'writerId');
        assertNonEmpty(patchSha, 'patchSha');
        return Object.freeze({ writerId, patchSha });
      })
  );
}

function assertFrontier(frontier: Map<string, string>): void {
  if (!(frontier instanceof Map)) {
    throw new WarpError(
      'WarpWorldline coordinate requires a frontier Map',
      'E_WARP_WORLDLINE_COORDINATE',
      { context: { field: 'frontier' } }
    );
  }
}

function assertWorldlineFactory(createWorldline: (options?: WorldlineOptions) => ProjectionHandle): void {
  if (typeof createWorldline !== 'function') {
    throw new WarpError(
      'WarpWorldline coordinate requires a worldline factory',
      'E_WARP_WORLDLINE_COORDINATE',
      { context: { field: 'createWorldline' } }
    );
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(
      'WarpWorldline coordinate requires non-empty identity fields',
      'E_WARP_WORLDLINE_COORDINATE',
      { context: { field } }
    );
  }
}
