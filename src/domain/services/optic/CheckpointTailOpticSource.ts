import type CodecPort from '../../../ports/CodecPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';
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
  abstract readonly _persistence: CorePersistence;
  abstract readonly _codec: CodecPort;
  abstract readonly _blobStorage: BlobStoragePort | null;
  abstract readonly _commitMessageCodec: CommitMessageCodecPort;

  abstract discoverWriters(): Promise<string[]>;

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
