import { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type {
  MaterializeCoordinateOptions,
  MaterializeStrategyRuntime,
} from './MaterializeStrategyRuntime.ts';
import type { MaterializeResult } from './MaterializeController.ts';
import type {
  WarpStateCoordinate,
  WarpStateSnapshotRecord,
} from '../../../ports/WarpStateCachePort.ts';
import type WarpState from '../state/WarpState.ts';

type UsableSnapshotRecord = WarpStateSnapshotRecord & {
  state: WarpState;
};

export default class MaterializeCoordinateStrategy {
  private readonly runtime: MaterializeStrategyRuntime;

  constructor(runtime: MaterializeStrategyRuntime) {
    this.runtime = runtime;
  }

  async materialize(opts: MaterializeCoordinateOptions): Promise<MaterializeResult> {
    if (opts.frontier.size === 0 || (opts.ceiling !== null && opts.ceiling <= 0)) {
      return await this.runtime.emptyResult(opts.ceiling, opts.frontier);
    }
    const coordinate = this.snapshotCoordinate(opts.frontier, opts.ceiling);
    const cacheResolved = await this.tryResolveSnapshotCache({
      coordinate,
      receipts: opts.receipts,
    });
    if (cacheResolved !== null) {
      return cacheResolved;
    }
    const patches = await this.runtime.deps.patches.collectForFrontier(opts.frontier, opts.ceiling);
    if (patches.length === 0) {
      return await this.runtime.emptyResult(opts.ceiling, opts.frontier);
    }
    const reduced = await this.runtime.reducePatches(patches, undefined, {
      receipts: opts.receipts,
      wantDiff: false,
    });
    return await this.runtime.buildResult({
      reduced,
      patches,
      provenance: this.runtime.buildProvenance(patches),
      degraded: false,
      ceiling: opts.ceiling,
      frontier: opts.frontier,
    });
  }

  private snapshotCoordinate(
    frontier: Map<string, string>,
    ceiling: number | null,
  ): WarpStateCoordinate {
    return {
      frontier,
      ceiling,
    };
  }

  private async tryResolveSnapshotCache(opts: {
    coordinate: WarpStateCoordinate;
    receipts: boolean;
  }): Promise<MaterializeResult | null> {
    const stateCache = this.runtime.deps.getStateCache?.() ?? null;
    if (stateCache === null) {
      return null;
    }

    const exact = await stateCache.getExact(opts.coordinate);
    if (this.canUseSnapshot(exact, opts.receipts)) {
      return await this.snapshotToResult(exact);
    }

    const predecessor = await stateCache.getBestCompatiblePredecessor(opts.coordinate);
    if (!this.canUseSnapshot(predecessor, opts.receipts)) {
      return null;
    }
    if (predecessor === null || predecessor.state === undefined) {
      return null;
    }

    const patches = await this.runtime.deps.patches.collectForFrontierSinceCoordinate(
      opts.coordinate.frontier,
      opts.coordinate.ceiling,
      predecessor.coordinate,
    );
    const reduced = await this.runtime.reducePatches(patches, predecessor.state, {
      receipts: false,
      wantDiff: false,
    });
    return await this.runtime.buildResult({
      reduced,
      patches,
      provenance: this.runtime.buildProvenance(patches),
      degraded: predecessor.provenancePosture === 'degraded',
      ceiling: opts.coordinate.ceiling,
      frontier: opts.coordinate.frontier,
    });
  }

  private canUseSnapshot(
    snapshot: WarpStateSnapshotRecord | null,
    receipts: boolean,
  ): snapshot is UsableSnapshotRecord {
    if (snapshot === null || snapshot.state === undefined) {
      return false;
    }
    if (receipts && snapshot.provenancePosture === 'degraded') {
      return false;
    }
    return true;
  }

  private async snapshotToResult(snapshot: UsableSnapshotRecord): Promise<MaterializeResult> {
    return await this.runtime.buildResult({
      reduced: { state: snapshot.state },
      patches: [],
      provenance: new ProvenanceIndex(),
      degraded: snapshot.provenancePosture === 'degraded',
      ceiling: snapshot.coordinate.ceiling,
      frontier: snapshot.coordinate.frontier,
    });
  }
}
