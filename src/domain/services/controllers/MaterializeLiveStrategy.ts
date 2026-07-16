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
import { snapshotPublicationForReceipts } from './MaterializeSnapshotPublication.ts';

function nonEmptySha(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

export default class MaterializeLiveStrategy {
  private readonly runtime: MaterializeStrategyRuntime;

  constructor(runtime: MaterializeStrategyRuntime) {
    this.runtime = runtime;
  }

  async materialize(opts: MaterializeLiveOptions): Promise<MaterializeResult> {
    const frontier = await this.runtime.deps.patches.getFrontier();
    if (frontier.size === 0) {
      return await this.runtime.emptyResult(null, frontier, snapshotPublicationForReceipts(opts));
    }
    const coordinate = this.snapshotCoordinate(frontier);
    const stateCache = this.runtime.deps.getStateCache?.() ?? null;
    const cacheResolved = await this.tryResolveConfiguredStateCache(
      stateCache,
      coordinate,
      opts,
    );
    if (cacheResolved !== null) {
      return cacheResolved;
    }
    return await this.replayCurrentCoordinate(coordinate, opts);
  }

  private async tryResolveConfiguredStateCache(
    stateCache: WarpStateCachePort | null,
    coordinate: WarpStateCoordinate,
    opts: MaterializeLiveOptions,
  ): Promise<MaterializeResult | null> {
    if (stateCache === null) {
      return null;
    }
    return await this.tryResolveSnapshotCache(stateCache, {
      coordinate,
      receipts: opts.receipts,
      wantDiff: opts.wantDiff,
    });
  }

  private async replayCurrentCoordinate(
    coordinate: WarpStateCoordinate,
    opts: MaterializeLiveOptions,
  ): Promise<MaterializeResult> {
    const checkpoint = await this.runtime.deps.patches.loadCheckpoint();
    if (
      this.isCurrentCheckpoint(checkpoint)
      && await this.checkpointSupportsCoordinate(checkpoint, coordinate)
    ) {
      return await this.fromCheckpoint(checkpoint, opts, coordinate.frontier);
    }
    return await this.fromFrontier(coordinate, opts);
  }

  private isCurrentCheckpoint(
    checkpoint: CheckpointData | null | undefined,
  ): checkpoint is CheckpointData {
    return checkpoint !== null && checkpoint !== undefined && isCurrentCheckpointSchema(checkpoint.schema);
  }

  private async checkpointSupportsCoordinate(
    checkpoint: CheckpointData,
    coordinate: WarpStateCoordinate,
  ): Promise<boolean> {
    for (const [writerId, checkpointTip] of checkpoint.frontier) {
      if (!await this.checkpointWriterTipIsCompatible(
        checkpointTip,
        coordinate.frontier.get(writerId),
      )) {
        return false;
      }
    }
    return true;
  }

  private async checkpointWriterTipIsCompatible(
    checkpointTip: string,
    targetTip: string | undefined,
  ): Promise<boolean> {
    if (!nonEmptySha(checkpointTip) || !nonEmptySha(targetTip)) {
      return false;
    }
    return checkpointTip === targetTip || await this.checkpointTipPrecedesTarget(checkpointTip, targetTip);
  }

  private async checkpointTipPrecedesTarget(
    checkpointTip: string,
    targetTip: string,
  ): Promise<boolean> {
    const { patches } = this.runtime.deps;
    if (typeof patches.isAncestor !== 'function') {
      return false;
    }
    return await patches.isAncestor(checkpointTip, targetTip);
  }

  private async fromCheckpoint(
    checkpoint: CheckpointData,
    opts: MaterializeLiveOptions,
    frontier: Map<string, string> | null,
  ): Promise<MaterializeResult> {
    const provenanceBase = checkpoint.provenanceIndex;
    const reduction = await this.runtime.reducePatchStream(
      this.streamPatchesSinceCheckpoint(checkpoint, frontier),
      checkpoint.state,
      opts,
      this.snapshotCoordinate(frontier ?? checkpoint.frontier),
      provenanceBase,
    );
    return await this.runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: provenanceBase === undefined,
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

  private async fromFrontier(
    coordinate: WarpStateCoordinate,
    opts: MaterializeLiveOptions,
  ): Promise<MaterializeResult> {
    const reduction = await this.runtime.reducePatchStream(
      this.runtime.deps.patches.streamForFrontier(coordinate.frontier, coordinate.ceiling),
      undefined,
      opts,
      coordinate,
    );
    if (reduction.summary.patchCount === 0) {
      await reduction.reduced.workspace?.release();
      return await this.runtime.emptyResult(
        coordinate.ceiling,
        coordinate.frontier,
        snapshotPublicationForReceipts(opts),
      );
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
    if (opts.receipts) {
      return null;
    }
    const exactResult = await this.tryResolveExactSnapshot(stateCache, opts);
    if (exactResult !== null) {
      return exactResult;
    }
    if (opts.wantDiff) {
      return null;
    }
    return await this.tryResolvePredecessorSnapshot(stateCache, opts);
  }

  private async tryResolveExactSnapshot(
    stateCache: WarpStateCachePort,
    opts: { coordinate: WarpStateCoordinate; receipts: boolean; wantDiff: boolean },
  ): Promise<MaterializeResult | null> {
    const exact = await stateCache.getExact(opts.coordinate);
    if (canUseSnapshot(exact, { receipts: opts.receipts })) {
      return await this.runtime.resumeExactMaterialization(exact, {
        wantDiff: opts.wantDiff,
      }) ?? snapshotToMaterializeResult(exact);
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
      opts.coordinate,
    );
    return await this.runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: true,
      ceiling: opts.coordinate.ceiling,
      frontier: opts.coordinate.frontier,
    });
  }
}
