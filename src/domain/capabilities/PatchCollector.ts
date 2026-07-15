import type Patch from '../types/Patch.ts';
import type WarpState from '../services/state/WarpState.ts';
import type { ProvenanceIndex } from '../services/provenance/ProvenanceIndex.ts';

/** A patch with its content-addressable SHA. */
export type PatchWithSha = { patch: Patch; sha: string };

/** Checkpoint data returned by loadCheckpoint(). */
export type CheckpointData = {
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  provenanceIndex?: ProvenanceIndex | undefined;
};

async function collectPatchEntries(source: AsyncIterable<PatchWithSha>): Promise<PatchWithSha[]> {
  const entries: PatchWithSha[] = [];
  for await (const entry of source) {
    entries.push(entry);
  }
  return entries;
}

function patchWithinCeiling(entry: PatchWithSha, ceiling: number | null): boolean {
  return ceiling === null || entry.patch.lamport <= ceiling;
}

function patchAfterBaseCeiling(entry: PatchWithSha, ceiling: number | null): boolean {
  return ceiling === null || entry.patch.lamport > ceiling;
}

function validTipSha(tipSha: string | undefined): tipSha is string {
  return typeof tipSha === 'string' && tipSha.length > 0;
}

function patchInCoordinateSuffix(
  entry: PatchWithSha,
  ceiling: number | null,
  baseCeiling: number | null,
): boolean {
  return patchWithinCeiling(entry, ceiling) && patchAfterBaseCeiling(entry, baseCeiling);
}

function coordinateStopAtSha(
  writerId: string,
  baseCoordinate: { frontier: Map<string, string>; ceiling: number | null },
): string | null {
  if (baseCoordinate.ceiling !== null) {
    return null;
  }
  const baseTipSha = baseCoordinate.frontier.get(writerId);
  return validTipSha(baseTipSha) ? baseTipSha : null;
}

type PatchChainLoader = {
  loadPatchChain(toSha: string, fromSha?: string | null): Promise<PatchWithSha[]>;
};

type CoordinateSuffixInput = {
  writerId: string;
  tipSha: string;
  ceiling: number | null;
  baseCoordinate: { frontier: Map<string, string>; ceiling: number | null };
};

async function* streamWriterCoordinateSuffix(
  loader: PatchChainLoader,
  input: CoordinateSuffixInput,
): AsyncIterable<PatchWithSha> {
  const stopAtSha = coordinateStopAtSha(input.writerId, input.baseCoordinate);
  for (const entry of await loader.loadPatchChain(input.tipSha, stopAtSha)) {
    if (patchInCoordinateSuffix(entry, input.ceiling, input.baseCoordinate.ceiling)) {
      yield entry;
    }
  }
}

/**
 * Collects patches for materialization.
 *
 * Abstracts away the patch loading, writer discovery, and checkpoint
 * resolution that MaterializeController needs. The adapter wraps
 * WarpRuntime's internal methods.
 */
export default abstract class PatchCollector {
  /** Discover all writer IDs in the graph. */
  abstract discoverWriters(): Promise<string[]>;

  /** Load all patches for a single writer. */
  abstract loadWriterPatches(_writerId: string): Promise<PatchWithSha[]>;

  /** Stream all patches for a single writer. */
  async *streamWriterPatches(writerId: string): AsyncIterable<PatchWithSha> {
    for (const entry of await this.loadWriterPatches(writerId)) {
      yield entry;
    }
  }

  /** Load patches for a frontier, filtered by optional ceiling. */
  async collectForFrontier(frontier: Map<string, string>, ceiling: number | null): Promise<PatchWithSha[]> {
    return await collectPatchEntries(this.streamForFrontier(frontier, ceiling));
  }

  /** Stream patches for a frontier, filtered by optional ceiling. */
  async *streamForFrontier(
    frontier: Map<string, string>,
    ceiling: number | null,
  ): AsyncIterable<PatchWithSha> {
    for (const writerId of frontier.keys()) {
      const tipSha = frontier.get(writerId);
      if (!validTipSha(tipSha)) { continue; }
      for (const entry of await this.loadPatchChain(tipSha)) {
        if (patchWithinCeiling(entry, ceiling)) {
          yield entry;
        }
      }
    }
  }

  collectForFrontierSinceCoordinate(
    frontier: Map<string, string>,
    ceiling: number | null,
    baseCoordinate: { frontier: Map<string, string>; ceiling: number | null },
  ): Promise<PatchWithSha[]> {
    return collectPatchEntries(this.streamForFrontierSinceCoordinate(frontier, ceiling, baseCoordinate));
  }

  async *streamForFrontierSinceCoordinate(
    frontier: Map<string, string>,
    ceiling: number | null,
    baseCoordinate: { frontier: Map<string, string>; ceiling: number | null },
  ): AsyncIterable<PatchWithSha> {
    for (const writerId of frontier.keys()) {
      const tipSha = frontier.get(writerId);
      if (!validTipSha(tipSha)) { continue; }
      yield* streamWriterCoordinateSuffix(this, {
        writerId,
        tipSha,
        ceiling,
        baseCoordinate,
      });
    }
  }

  /** Load the latest checkpoint, or null if none. */
  abstract loadCheckpoint(): Promise<CheckpointData | null>;

  /** Load patches since a checkpoint. */
  abstract loadPatchesSince(_checkpoint: CheckpointData): Promise<PatchWithSha[]>;

  /** Stream patches since a checkpoint. */
  async *streamPatchesSince(checkpoint: CheckpointData): AsyncIterable<PatchWithSha> {
    for (const entry of await this.loadPatchesSince(checkpoint)) {
      yield entry;
    }
  }

  /** Load a patch chain between two SHAs. */
  abstract loadPatchChain(_toSha: string, _fromSha?: string | null): Promise<PatchWithSha[]>;

  /** Return whether one patch commit is an ancestor of another, when available. */
  isAncestor?(_ancestorSha: string, _descendantSha: string): Promise<boolean>;

  /** Get the current writer frontier. */
  abstract getFrontier(): Promise<Map<string, string>>;
}
