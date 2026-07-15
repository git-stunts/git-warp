import type CodecPort from '../../../ports/CodecPort.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type IndexStorePort from '../../../ports/IndexStorePort.ts';
import type Patch from '../../types/Patch.ts';

export type CheckpointTailPatchEntry = {
  readonly patch: Patch;
  readonly sha: string;
};

export type CheckpointTailCheckpointFrontier = {
  readonly schema: number;
  readonly frontier: Map<string, string>;
};

export default abstract class CheckpointTailOpticSource {
  abstract readonly graphName: string;
  abstract readonly _codec: CodecPort;
  abstract readonly _checkpointStore: CheckpointStorePort;
  abstract readonly _indexStore: IndexStorePort;

  abstract discoverWriters(): Promise<string[]>;

  abstract _readCheckpointSha(): Promise<string | null>;

  abstract _loadPatchChainFromSha(
    _tipSha: string,
    _stopAtSha?: string | null,
  ): Promise<CheckpointTailPatchEntry[]>;

  abstract _loadWriterPatches(
    _writerId: string,
    _stopAtSha?: string | null,
  ): Promise<CheckpointTailPatchEntry[]>;

  abstract _validatePatchAgainstCheckpoint(
    _writerId: string,
    _incomingSha: string,
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined,
  ): Promise<void>;
}
