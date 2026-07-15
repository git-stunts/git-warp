/**
 * RuntimePatchCollector — adapter wrapping WarpRuntime's patch loading internals.
 *
 * Lives at the infrastructure boundary. Domain code (MaterializeController)
 * programs against PatchCollector; this adapter provides the runtime backing.
 */

import PatchCollector, { type PatchWithSha, type CheckpointData } from '../capabilities/PatchCollector.ts';
import type WarpState from '../services/state/WarpState.ts';

type RuntimeCheckpointData = {
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  provenanceIndex?: object | null;
};

type RuntimePatchCollectorHost = {
  discoverWriters(): Promise<string[]>;
  _loadWriterPatches(writerId: string): Promise<PatchWithSha[]>;
  _loadPatchChainFromSha(toSha: string, fromSha?: string | null): Promise<PatchWithSha[]>;
  _loadLatestCheckpoint(): Promise<RuntimeCheckpointData | null>;
  _loadPatchesSince(checkpoint: RuntimeCheckpointData): Promise<PatchWithSha[]>;
  getFrontier(): Promise<Map<string, string>>;
  _isAncestor?(ancestorSha: string, descendantSha: string): Promise<boolean>;
};

function isProvenanceIndexShape(value: object | null | undefined): value is NonNullable<CheckpointData['provenanceIndex']> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }
  return (
    typeof Reflect.get(value, 'clone') === 'function' &&
    typeof Reflect.get(value, 'addPatch') === 'function'
  );
}

function toCheckpointData(checkpoint: RuntimeCheckpointData | null): CheckpointData | null {
  if (checkpoint === null) {
    return null;
  }

  return {
    state: checkpoint.state,
    frontier: checkpoint.frontier,
    stateHash: checkpoint.stateHash,
    schema: checkpoint.schema,
    ...(isProvenanceIndexShape(checkpoint.provenanceIndex)
      ? { provenanceIndex: checkpoint.provenanceIndex }
      : {}),
  };
}

function toRuntimeCheckpointData(checkpoint: CheckpointData): RuntimeCheckpointData {
  return {
    state: checkpoint.state,
    frontier: checkpoint.frontier,
    stateHash: checkpoint.stateHash,
    schema: checkpoint.schema,
    ...(checkpoint.provenanceIndex !== undefined ? { provenanceIndex: checkpoint.provenanceIndex } : {}),
  };
}

export default class RuntimePatchCollector extends PatchCollector {
  private readonly _runtime: RuntimePatchCollectorHost;

  constructor(runtime: RuntimePatchCollectorHost) {
    super();
    this._runtime = runtime;
  }

  async discoverWriters(): Promise<string[]> {
    return await this._runtime.discoverWriters();
  }

  async loadWriterPatches(writerId: string): Promise<PatchWithSha[]> {
    return await this._runtime._loadWriterPatches(writerId);
  }

  override async *streamForFrontier(
    frontier: Map<string, string>,
    ceiling: number | null,
  ): AsyncIterable<PatchWithSha> {
    for (const writerId of frontier.keys()) {
      const tipSha = frontier.get(writerId);
      if (typeof tipSha !== 'string' || tipSha.length === 0) { continue; }
      const patches = await this._runtime._loadPatchChainFromSha(tipSha);
      for (const entry of patches) {
        if (ceiling === null || entry.patch.lamport <= ceiling) {
          yield entry;
        }
      }
    }
  }

  async loadCheckpoint(): Promise<CheckpointData | null> {
    return toCheckpointData(await this._runtime._loadLatestCheckpoint());
  }

  async loadPatchesSince(checkpoint: CheckpointData): Promise<PatchWithSha[]> {
    return await this._runtime._loadPatchesSince(toRuntimeCheckpointData(checkpoint));
  }

  async loadPatchChain(toSha: string, fromSha?: string | null): Promise<PatchWithSha[]> {
    return await this._runtime._loadPatchChainFromSha(toSha, fromSha);
  }

  override async isAncestor(ancestorSha: string, descendantSha: string): Promise<boolean> {
    if (typeof this._runtime._isAncestor !== 'function') {
      return false;
    }
    return await this._runtime._isAncestor(ancestorSha, descendantSha);
  }

  async getFrontier(): Promise<Map<string, string>> {
    return await this._runtime.getFrontier();
  }
}
