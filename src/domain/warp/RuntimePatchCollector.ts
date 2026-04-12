/**
 * RuntimePatchCollector — adapter wrapping WarpRuntime's patch loading internals.
 *
 * Lives at the infrastructure boundary. Domain code (MaterializeController)
 * programs against PatchCollector; this adapter provides the runtime backing.
 */

import PatchCollector from '../capabilities/PatchCollector.ts';
import type { PatchWithSha, CheckpointData } from '../capabilities/PatchCollector.ts';
import type WarpRuntime from '../WarpRuntime.ts';

export default class RuntimePatchCollector extends PatchCollector {
  private readonly _runtime: WarpRuntime;

  constructor(runtime: WarpRuntime) {
    super();
    this._runtime = runtime;
  }

  async discoverWriters(): Promise<string[]> {
    return await this._runtime.discoverWriters();
  }

  async loadWriterPatches(writerId: string): Promise<PatchWithSha[]> {
    return await this._runtime._loadWriterPatches(writerId);
  }

  async collectForFrontier(frontier: Map<string, string>, ceiling: number | null): Promise<PatchWithSha[]> {
    const all: PatchWithSha[] = [];
    for (const writerId of frontier.keys()) {
      const tipSha = frontier.get(writerId);
      if (typeof tipSha !== 'string' || tipSha.length === 0) { continue; }
      const patches = await this._runtime._loadPatchChainFromSha(tipSha);
      for (const entry of patches) {
        if (ceiling === null || (entry.patch.lamport ?? 0) <= ceiling) {
          all.push(entry);
        }
      }
    }
    return all;
  }

  async loadCheckpoint(): Promise<CheckpointData | null> {
    return await this._runtime._loadLatestCheckpoint();
  }

  async loadPatchesSince(checkpoint: CheckpointData): Promise<PatchWithSha[]> {
    return await this._runtime._loadPatchesSince(checkpoint);
  }

  async loadPatchChain(toSha: string, fromSha?: string | null): Promise<PatchWithSha[]> {
    return await this._runtime._loadPatchChainFromSha(toSha, fromSha);
  }

  async getFrontier(): Promise<Map<string, string>> {
    return await this._runtime.getFrontier();
  }
}
