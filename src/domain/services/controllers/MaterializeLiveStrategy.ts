import { isCurrentCheckpointSchema } from '../state/checkpointHelpers.ts';
import type {
  MaterializeLiveOptions,
  MaterializeStrategyRuntime,
} from './MaterializeStrategyRuntime.ts';
import type { MaterializeResult } from './MaterializeController.ts';
import type {
  CheckpointData,
  PatchWithSha,
} from '../../capabilities/PatchCollector.ts';
import type WarpStateCachePort from '../../../ports/WarpStateCachePort.ts';
import type {
  WarpStateCoordinate,
} from '../../../ports/WarpStateCachePort.ts';
import {
  canUseSnapshot,
  snapshotToMaterializeResult,
} from './MaterializeSnapshotCacheResult.ts';

export default class MaterializeLiveStrategy {
  private readonly runtime: MaterializeStrategyRuntime;

  constructor(runtime: MaterializeStrategyRuntime) {
    this.runtime = runtime;
  }

  async materialize(opts: MaterializeLiveOptions): Promise<MaterializeResult> {
    const stateCache = this.runtime.deps.getStateCache?.() ?? null;
    if (stateCache !== null) {
      return await this.materializeWithStateCache(stateCache, opts);
    }
    return await this.materializeWithoutStateCache(opts);
  }

  private async materializeWithoutStateCache(opts: MaterializeLiveOptions): Promise<MaterializeResult> {
    const checkpoint = await this.runtime.deps.patches.loadCheckpoint();
    if (checkpoint !== null && checkpoint !== undefined && isCurrentCheckpointSchema(checkpoint.schema)) {
      return await this.fromCheckpoint(checkpoint, opts, null);
    }
    return await this.fromScratch(opts);
  }

  private async materializeWithStateCache(
    stateCache: WarpStateCachePort,
    opts: MaterializeLiveOptions,
  ): Promise<MaterializeResult> {
    const frontier = await this.runtime.deps.patches.getFrontier();
    if (frontier.size === 0) {
      return await this.runtime.emptyResult(null, frontier);
    }
    const coordinate = this.snapshotCoordinate(frontier);
    const cacheResolved = await this.tryResolveSnapshotCache(stateCache, {
      coordinate,
      receipts: opts.receipts,
      wantDiff: opts.wantDiff,
    });
    if (cacheResolved !== null) {
      return cacheResolved;
    }
    return await this.replayCurrentCoordinate(coordinate, opts);
  }

  private async replayCurrentCoordinate(
    coordinate: WarpStateCoordinate,
    opts: MaterializeLiveOptions,
  ): Promise<MaterializeResult> {
    const checkpoint = await this.runtime.deps.patches.loadCheckpoint();
    if (checkpoint !== null && checkpoint !== undefined && isCurrentCheckpointSchema(checkpoint.schema)) {
      return await this.fromCheckpoint(checkpoint, opts, coordinate.frontier);
    }
    return await this.fromFrontier(coordinate, opts);
  }

  private async fromCheckpoint(
    checkpoint: CheckpointData,
    opts: MaterializeLiveOptions,
    frontier: Map<string, string> | null,
  ): Promise<MaterializeResult> {
    const reduction = await this.runtime.reducePatchStream(
      this.streamPatchesSinceCheckpoint(checkpoint, frontier),
      checkpoint.state,
      opts,
      checkpoint.provenanceIndex,
    );
    return await this.runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: false,
      ceiling: null,
      frontier,
    });
  }

  private async *streamPatchesSinceCheckpoint(
    checkpoint: CheckpointData,
    frontier: Map<string, string> | null,
  ): AsyncIterable<PatchWithSha> {
    if (frontier !== null) {
      yield* this.runtime.deps.patches.streamForFrontierSinceCoordinate(
        frontier,
        null,
        this.checkpointCoordinate(checkpoint),
      );
      return;
    }
    yield* this.streamPatchesSince(checkpoint);
  }

  private checkpointCoordinate(checkpoint: CheckpointData): WarpStateCoordinate {
    return {
      frontier: checkpoint.frontier,
      ceiling: null,
    };
  }

  private async *streamPatchesSince(checkpoint: CheckpointData): AsyncIterable<PatchWithSha> {
    if (typeof this.runtime.deps.patches.streamPatchesSince === 'function') {
      yield* this.runtime.deps.patches.streamPatchesSince(checkpoint);
      return;
    }
    for (const entry of await this.runtime.deps.patches.loadPatchesSince(checkpoint)) {
      yield entry;
    }
  }

  private async fromScratch(opts: MaterializeLiveOptions): Promise<MaterializeResult> {
    const writers = await this.runtime.deps.patches.discoverWriters();
    if (writers.length === 0) {
      return await this.runtime.emptyResult();
    }
    const reduction = await this.runtime.reducePatchStream(
      this.streamAllPatches(writers),
      undefined,
      opts,
    );
    if (reduction.summary.patchCount === 0) {
      return await this.runtime.emptyResult();
    }
    return await this.runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: false,
      ceiling: null,
      frontier: null,
    });
  }

  private async fromFrontier(
    coordinate: WarpStateCoordinate,
    opts: MaterializeLiveOptions,
  ): Promise<MaterializeResult> {
    const reduction = await this.runtime.reducePatchStream(
      this.runtime.deps.patches.streamForFrontier(coordinate.frontier, coordinate.ceiling),
      undefined,
      opts,
    );
    if (reduction.summary.patchCount === 0) {
      return await this.runtime.emptyResult(coordinate.ceiling, coordinate.frontier);
    }
    return await this.runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: false,
      ceiling: coordinate.ceiling,
      frontier: coordinate.frontier,
    });
  }

  private snapshotCoordinate(frontier: Map<string, string>): WarpStateCoordinate {
    return {
      frontier,
      ceiling: null,
    };
  }

  private async tryResolveSnapshotCache(
    stateCache: WarpStateCachePort,
    opts: { coordinate: WarpStateCoordinate; receipts: boolean; wantDiff: boolean },
  ): Promise<MaterializeResult | null> {
    if (opts.receipts || opts.wantDiff) {
      return null;
    }
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

  private async *streamAllPatches(writers: string[]): AsyncIterable<PatchWithSha> {
    for (const writerId of writers) {
      yield* this.runtime.deps.patches.streamWriterPatches(writerId);
    }
  }
}
