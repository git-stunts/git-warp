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
    const patches = await this.runtime.deps.patches.loadPatchesSince(checkpoint);
    const reduced = await this.runtime.reducePatches(patches, checkpoint.state, opts);
    const provenance = this.runtime.buildProvenance(
      patches,
      checkpoint.provenanceIndex,
    );
    return await this.runtime.buildResult({
      reduced,
      patches,
      provenance,
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
    const patches = await this.loadAllPatches(writers);
    if (patches.length === 0) {
      return await this.runtime.emptyResult();
    }
    const reduced = await this.runtime.reducePatches(patches, undefined, opts);
    return await this.runtime.buildResult({
      reduced,
      patches,
      provenance: this.runtime.buildProvenance(patches),
      degraded: false,
      ceiling: null,
      frontier: null,
    });
  }

  private async loadAllPatches(writers: string[]): Promise<PatchWithSha[]> {
    const all: PatchWithSha[] = [];
    for (const writerId of writers) {
      const patches = await this.runtime.deps.patches.loadWriterPatches(writerId);
      for (const patch of patches) {
        all.push(patch);
      }
    }
    return all;
  }
}
