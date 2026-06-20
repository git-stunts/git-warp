import { materializeIncremental } from '../state/checkpointLoad.ts';
import { createFrontier, updateFrontier } from '../Frontier.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';
import type { MaterializeResult } from './MaterializeController.ts';
import type { MaterializeStrategyRuntime } from './MaterializeStrategyRuntime.ts';

export default class MaterializeCheckpointStrategy {
  private readonly runtime: MaterializeStrategyRuntime;

  constructor(runtime: MaterializeStrategyRuntime) {
    this.runtime = runtime;
  }

  async materializeAt(checkpointSha: string): Promise<MaterializeResult> {
    if (this.runtime.deps.openStateSession !== undefined) {
      throw new SchemaUnsupportedError(
        'materializeAt() is not supported on the session-backed runtime line. ' +
        'Run the offline checkpoint migration first.',
      );
    }
    const frontier = await this.buildTargetFrontier();
    const patchLoader = async (_writerId: string, from: string | null, to: string) =>
      await this.runtime.deps.patches.loadPatchChain(to, from);

    const state = await materializeIncremental({
      persistence: this.runtime.loadPersistence(),
      graphName: this.runtime.deps.graphName,
      checkpointSha,
      targetFrontier: frontier,
      patchLoader,
      codec: this.runtime.deps.codec,
    });
    return await this.runtime.wrapState(state, null, null);
  }

  private async buildTargetFrontier(): Promise<Map<string, string>> {
    const writers = await this.runtime.deps.patches.discoverWriters();
    const frontier = createFrontier();
    for (const writerId of writers) {
      const ref = buildWriterRef(this.runtime.deps.graphName, writerId);
      const tipSha = await this.runtime.deps.persistence.readRef(ref);
      if (typeof tipSha === 'string' && tipSha.length > 0) {
        updateFrontier(frontier, writerId, tipSha);
      }
    }
    return frontier;
  }
}
