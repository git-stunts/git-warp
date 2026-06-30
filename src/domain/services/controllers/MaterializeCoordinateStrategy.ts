import type {
  MaterializeCoordinateOptions,
  MaterializeStrategyRuntime,
} from './MaterializeStrategyRuntime.ts';
import type { MaterializeResult } from './MaterializeController.ts';
import type WarpStateCachePort from '../../../ports/WarpStateCachePort.ts';
import type {
  WarpStateCoordinate,
} from '../../../ports/WarpStateCachePort.ts';
import {
  canUseSnapshot,
  snapshotToMaterializeResult,
} from './MaterializeSnapshotCacheResult.ts';
import { snapshotPublicationForReceipts } from './MaterializeSnapshotPublication.ts';

export default class MaterializeCoordinateStrategy {
  private readonly runtime: MaterializeStrategyRuntime;

  constructor(runtime: MaterializeStrategyRuntime) {
    this.runtime = runtime;
  }

  async materialize(opts: MaterializeCoordinateOptions): Promise<MaterializeResult> {
    if (this.canReturnEmpty(opts)) {
      return await this.emptyResult(opts);
    }
    const coordinate = this.snapshotCoordinate(opts.frontier, opts.ceiling);
    const cacheResolved = await this.tryResolveSnapshotCache({
      coordinate,
      receipts: opts.receipts,
    });
    if (cacheResolved !== null) {
      return cacheResolved;
    }
    const reduction = await this.reduceFrontierPatches(opts);
    if (reduction.summary.patchCount === 0) {
      return await this.emptyResult(opts);
    }
    return await this.runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: false,
      ceiling: opts.ceiling,
      frontier: opts.frontier,
    });
  }

  private async emptyResult(opts: MaterializeCoordinateOptions): Promise<MaterializeResult> {
    return await this.runtime.emptyResult(
      opts.ceiling,
      opts.frontier,
      snapshotPublicationForReceipts(opts),
    );
  }

  private async reduceFrontierPatches(opts: MaterializeCoordinateOptions) {
    return await this.runtime.reducePatchStream(
      this.runtime.deps.patches.streamForFrontier(opts.frontier, opts.ceiling),
      undefined,
      {
        receipts: opts.receipts,
        wantDiff: false,
      },
    );
  }

  private canReturnEmpty(opts: MaterializeCoordinateOptions): boolean {
    return opts.frontier.size === 0 || this.ceilingExcludesAll(opts.ceiling);
  }

  private ceilingExcludesAll(ceiling: number | null): boolean {
    return ceiling !== null && ceiling <= 0;
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
    if (opts.receipts) {
      return null;
    }
    const stateCache = this.runtime.deps.getStateCache?.() ?? null;
    if (stateCache === null) {
      return null;
    }
    return await this.tryResolveCachedSnapshot(stateCache, opts);
  }

  private async tryResolveCachedSnapshot(
    stateCache: WarpStateCachePort,
    opts: { coordinate: WarpStateCoordinate; receipts: boolean },
  ): Promise<MaterializeResult | null> {
    const exactResult = await this.tryResolveExactSnapshot(stateCache, opts);
    if (exactResult !== null) {
      return exactResult;
    }
    return await this.tryResolvePredecessorSnapshot(stateCache, opts);
  }

  private async tryResolveExactSnapshot(
    stateCache: WarpStateCachePort,
    opts: { coordinate: WarpStateCoordinate; receipts: boolean },
  ): Promise<MaterializeResult | null> {
    const exact = await stateCache.getExact(opts.coordinate);
    if (canUseSnapshot(exact, { receipts: opts.receipts })) {
      return snapshotToMaterializeResult(exact);
    }
    return null;
  }

  private async tryResolvePredecessorSnapshot(
    stateCache: WarpStateCachePort,
    opts: { coordinate: WarpStateCoordinate; receipts: boolean },
  ): Promise<MaterializeResult | null> {
    const predecessor = await stateCache.getBestCompatiblePredecessor(opts.coordinate);
    if (!canUseSnapshot(predecessor, { receipts: opts.receipts })) {
      return null;
    }

    const reduction = await this.runtime.reducePatchStream(
      this.runtime.deps.patches.streamForFrontierSinceCoordinate(
        opts.coordinate.frontier,
        opts.coordinate.ceiling,
        predecessor.coordinate,
      ),
      predecessor.state,
      {
        receipts: false,
        wantDiff: false,
      },
    );
    return await this.runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: predecessor.provenancePosture === 'degraded',
      ceiling: opts.coordinate.ceiling,
      frontier: opts.coordinate.frontier,
    });
  }
}
