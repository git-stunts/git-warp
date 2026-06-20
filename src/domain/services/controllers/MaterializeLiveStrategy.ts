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

export default class MaterializeLiveStrategy {
  private readonly runtime: MaterializeStrategyRuntime;

  constructor(runtime: MaterializeStrategyRuntime) {
    this.runtime = runtime;
  }

  async materialize(opts: MaterializeLiveOptions): Promise<MaterializeResult> {
    const checkpoint = await this.runtime.deps.patches.loadCheckpoint();
    if (checkpoint !== null && checkpoint !== undefined && isCurrentCheckpointSchema(checkpoint.schema)) {
      return await this.fromCheckpoint(checkpoint, opts);
    }
    return await this.fromScratch(opts);
  }

  private async fromCheckpoint(
    checkpoint: CheckpointData,
    opts: MaterializeLiveOptions,
  ): Promise<MaterializeResult> {
    const reduction = await this.runtime.reducePatchStream(
      this.runtime.deps.patches.streamPatchesSince(checkpoint),
      checkpoint.state,
      opts,
      checkpoint.provenanceIndex,
    );
    return await this.runtime.buildResult({
      reduced: reduction.reduced,
      summary: reduction.summary,
      degraded: false,
      ceiling: null,
      frontier: null,
    });
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

  private async *streamAllPatches(writers: string[]): AsyncIterable<PatchWithSha> {
    for (const writerId of writers) {
      yield* this.runtime.deps.patches.streamWriterPatches(writerId);
    }
  }
}
