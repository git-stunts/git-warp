import WarpError from './errors/WarpError.ts';
import type WorldlineOptic from './services/optic/WorldlineOptic.ts';

export type WarpWorldlineCoordinateFrontierEntry = {
  readonly writerId: string;
  readonly patchSha: string;
};

/** A coordinate pinned to one cone basis of a Lane (#1039): every Reading through it shares that basis. */
export type WarpWorldlineCoordinateOptions = {
  readonly worldlineName: string;
  /** The cone record trie root the coordinate pins (its text form). */
  readonly coneRoot: string;
  readonly frontier: Map<string, string>;
  readonly createOptic: () => WorldlineOptic;
};

/**
 * A captured read coordinate: one cone basis of a worldline or strand Lane
 * (#1039), named by its record trie root and the writer frontier it folds.
 * Its optic reads that basis and nothing newer.
 */
export default class WarpWorldlineCoordinate {
  readonly kind: 'worldline-coordinate' = 'worldline-coordinate';
  readonly worldlineName: string;
  /** The cone record trie root this coordinate pins. */
  readonly coneRoot: string;
  readonly frontierEntries: readonly WarpWorldlineCoordinateFrontierEntry[];
  private readonly _createOptic: () => WorldlineOptic;

  constructor(options: WarpWorldlineCoordinateOptions) {
    assertFrontier(options.frontier);
    assertNonEmpty(options.worldlineName, 'worldlineName');
    assertNonEmpty(options.coneRoot, 'coneRoot');
    assertOpticFactory(options.createOptic);
    this.worldlineName = options.worldlineName;
    this.coneRoot = options.coneRoot;
    this.frontierEntries = freezeFrontier(options.frontier);
    this._createOptic = options.createOptic;
    Object.freeze(this);
  }

  frontier(): Map<string, string> {
    return new Map(this.frontierEntries.map((entry) => [entry.writerId, entry.patchSha]));
  }

  /** The parts that identify this coordinate's basis. */
  basisIdentity(): readonly string[] {
    return ['cone', this.coneRoot];
  }

  optic(): WorldlineOptic {
    return this._createOptic();
  }
}

function assertOpticFactory(createOptic: () => WorldlineOptic): void {
  if (typeof createOptic !== 'function') {
    throw new WarpError(
      'WarpWorldline coordinate requires an optic factory',
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

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(
      'WarpWorldline coordinate requires non-empty identity fields',
      'E_WARP_WORLDLINE_COORDINATE',
      { context: { field } }
    );
  }
}
