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

/** A coordinate pinned to a lane's cone basis (#1039): every Reading shares its one basis. */
export type WarpWorldlineConeCoordinateOptions = {
  readonly worldlineName: string;
  /** The cone record trie root the coordinate pins (its text form). */
  readonly coneRoot: string;
  readonly frontier: Map<string, string>;
  readonly createOptic: () => WorldlineOptic;
};

export default class WarpWorldlineCoordinate {
  readonly kind: 'worldline-coordinate' = 'worldline-coordinate';
  readonly worldlineName: string;
  /** The checkpoint a checkpoint-tail coordinate reads from; null for a cone coordinate. */
  readonly checkpointSha: string | null;
  /** The cone root a cone coordinate pins; null for a checkpoint-tail coordinate. */
  readonly coneRoot: string | null;
  readonly frontierEntries: readonly WarpWorldlineCoordinateFrontierEntry[];
  private readonly _createOptic: () => WorldlineOptic;

  constructor(options: WarpWorldlineCoordinateOptions | WarpWorldlineConeCoordinateOptions) {
    assertFrontier(options.frontier);
    assertNonEmpty(options.worldlineName, 'worldlineName');
    this.worldlineName = options.worldlineName;
    this.frontierEntries = freezeFrontier(options.frontier);
    if ('coneRoot' in options) {
      assertNonEmpty(options.coneRoot, 'coneRoot');
      assertOpticFactory(options.createOptic);
      this.checkpointSha = null;
      this.coneRoot = options.coneRoot;
      this._createOptic = options.createOptic;
    } else {
      assertWorldlineFactory(options.createWorldline);
      assertNonEmpty(options.checkpointSha, 'checkpointSha');
      this.checkpointSha = options.checkpointSha;
      this.coneRoot = null;
      this._createOptic = () => options.createWorldline({ source: checkpointSource(options) }).optic();
    }
    Object.freeze(this);
  }

  frontier(): Map<string, string> {
    return new Map(this.frontierEntries.map((entry) => [entry.writerId, entry.patchSha]));
  }

  /** The checkpoint of a checkpoint-tail coordinate, as fork and strand lanes require. */
  requireCheckpointSha(): string {
    if (this.checkpointSha === null) {
      throw new WarpError(
        'WarpWorldline coordinate is pinned to a cone basis, not a checkpoint',
        'E_WARP_WORLDLINE_COORDINATE',
        { context: { field: 'checkpointSha' } }
      );
    }
    return this.checkpointSha;
  }

  /** The parts that identify this coordinate's basis: its checkpoint, or its cone root. */
  basisIdentity(): readonly string[] {
    return this.coneRoot === null ? [this.requireCheckpointSha()] : ['cone', this.coneRoot];
  }

  source(): WorldlineSource {
    return {
      kind: 'coordinate',
      frontier: this.frontier(),
      checkpointSha: this.requireCheckpointSha(),
    };
  }

  optic(): WorldlineOptic {
    return this._createOptic();
  }
}

function checkpointSource(options: WarpWorldlineCoordinateOptions): WorldlineSource {
  return { kind: 'coordinate', frontier: new Map(options.frontier), checkpointSha: options.checkpointSha };
}

function assertOpticFactory(createOptic: () => WorldlineOptic): void {
  if (typeof createOptic !== 'function') {
    throw new WarpError(
      'WarpWorldline cone coordinate requires an optic factory',
      'E_WARP_WORLDLINE_COORDINATE',
      { context: { field: 'createOptic' } }
    );
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
