import { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type {
  MaterializeCoordinateOptions,
  MaterializeStrategyRuntime,
} from './MaterializeStrategyRuntime.ts';
import type { MaterializeResult } from './MaterializeController.ts';
import type WarpStateCachePort from '../../../ports/WarpStateCachePort.ts';
import type {
  WarpStateCoordinate,
  WarpStateSnapshotRecord,
} from '../../../ports/WarpStateCachePort.ts';
import type WarpState from '../state/WarpState.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';

type UsableSnapshotRecord = WarpStateSnapshotRecord & {
  state: WarpState;
};

export default class MaterializeCoordinateStrategy {
  private readonly runtime: MaterializeStrategyRuntime;

  constructor(runtime: MaterializeStrategyRuntime) {
    this.runtime = runtime;
  }

  async materialize(opts: MaterializeCoordinateOptions): Promise<MaterializeResult> {
    if (this.canReturnEmpty(opts)) {
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
    const patches = await this.collectPatchStream(
      this.runtime.deps.patches.streamForFrontier(opts.frontier, opts.ceiling),
    );
    if (this.noPatches(patches)) {
      return await this.runtime.emptyResult(opts.ceiling, opts.frontier);
    }
    return await this.materializeCollectedPatches(opts, patches);
  }

  private async materializeCollectedPatches(
    opts: MaterializeCoordinateOptions,
    patches: PatchWithSha[],
  ): Promise<MaterializeResult> {
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

  private canReturnEmpty(opts: MaterializeCoordinateOptions): boolean {
    return opts.frontier.size === 0 || this.ceilingExcludesAll(opts.ceiling);
  }

  private ceilingExcludesAll(ceiling: number | null): boolean {
    return ceiling !== null && ceiling <= 0;
  }

  private noPatches(patches: readonly object[]): boolean {
    return patches.length === 0;
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
    if (this.canUseSnapshot(exact, opts.receipts)) {
      return await this.snapshotToResult(exact);
    }
    return null;
  }

  private async tryResolvePredecessorSnapshot(
    stateCache: WarpStateCachePort,
    opts: { coordinate: WarpStateCoordinate; receipts: boolean },
  ): Promise<MaterializeResult | null> {
    const predecessor = await stateCache.getBestCompatiblePredecessor(opts.coordinate);
    if (!this.canUseSnapshot(predecessor, opts.receipts)) {
      return null;
    }

    const patches = await this.collectPatchStream(
      this.runtime.deps.patches.streamForFrontierSinceCoordinate(
        opts.coordinate.frontier,
        opts.coordinate.ceiling,
        predecessor.coordinate,
      ),
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

  private async collectPatchStream(stream: AsyncIterable<PatchWithSha>): Promise<PatchWithSha[]> {
    const patches: PatchWithSha[] = [];
    for await (const patch of stream) {
      patches.push(patch);
    }
    return patches;
  }
}
