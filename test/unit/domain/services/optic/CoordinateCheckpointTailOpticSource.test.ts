import { describe, expect, it } from 'vitest';

import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import CoordinateCheckpointTailOpticSource from '../../../../../src/domain/services/optic/CoordinateCheckpointTailOpticSource.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import type BlobStoragePort from '../../../../../src/ports/BlobStoragePort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import type { CorePersistence } from '../../../../../src/domain/types/WarpPersistence.ts';

class TestCheckpointTailOpticSource extends CheckpointTailOpticSource {
  readonly graphName = 'events';
  declare readonly _persistence: CorePersistence;
  declare readonly _codec: CodecPort;
  readonly _blobStorage: BlobStoragePort | null = null;
  declare readonly _commitMessageCodec: CommitMessageCodecPort;

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve('checkpoint-sha');
  }

  _loadPatchChainFromSha(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _loadWriterPatches(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _validatePatchAgainstCheckpoint(
    _writerId: string,
    _incomingSha: string,
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined
  ): Promise<void> {
    return Promise.resolve();
  }
}

describe('CoordinateCheckpointTailOpticSource', () => {
  it('rejects malformed constructor frontier before copying entries', () => {
    expect(
      () =>
        new CoordinateCheckpointTailOpticSource({
          source: new TestCheckpointTailOpticSource(),
          checkpointSha: 'checkpoint-sha',
          // @ts-expect-error exercising runtime validation for JavaScript callers
          frontier: 'not-a-frontier',
        })
    ).toThrow(WarpError);

    expect(
      () =>
        new CoordinateCheckpointTailOpticSource({
          source: new TestCheckpointTailOpticSource(),
          checkpointSha: 'checkpoint-sha',
          // @ts-expect-error exercising runtime validation for JavaScript callers
          frontier: 'not-a-frontier',
        })
    ).toThrow('Coordinate checkpoint-tail optic source requires a frontier Map');
  });

  it('rejects blank identity fields', () => {
    expect(
      () =>
        new CoordinateCheckpointTailOpticSource({
          source: new TestCheckpointTailOpticSource(),
          checkpointSha: '   ',
          frontier: new Map([['writer-1', 'patch-sha']]),
        })
    ).toThrow('Coordinate checkpoint-tail optic source requires non-empty identity fields');

    expect(
      () =>
        new CoordinateCheckpointTailOpticSource({
          source: new TestCheckpointTailOpticSource(),
          checkpointSha: 'checkpoint-sha',
          frontier: new Map([['writer-1', '   ']]),
        })
    ).toThrow('Coordinate checkpoint-tail optic source requires non-empty identity fields');
  });
});
