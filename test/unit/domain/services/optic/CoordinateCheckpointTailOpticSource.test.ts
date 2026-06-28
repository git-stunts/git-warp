import { describe, expect, it } from 'vitest';

import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import CoordinateCheckpointTailOpticSource from '../../../../../src/domain/services/optic/CoordinateCheckpointTailOpticSource.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import InMemoryGraphAdapter from '../../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import type BlobStoragePort from '../../../../../src/ports/BlobStoragePort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import type { CorePersistence } from '../../../../../src/domain/types/WarpPersistence.ts';

class TestCheckpointTailOpticSource extends CheckpointTailOpticSource {
  readonly graphName = 'events';
  readonly _persistence: CorePersistence = new InMemoryGraphAdapter();
  readonly _codec: CodecPort = defaultCodec;
  readonly _blobStorage: BlobStoragePort | null = null;
  readonly _commitMessageCodec: CommitMessageCodecPort = DEFAULT_COMMIT_MESSAGE_CODEC;

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

class MalformedPersistenceSource extends TestCheckpointTailOpticSource {
  // @ts-expect-error exercising runtime source-port validation for JavaScript callers
  override readonly _persistence: CorePersistence = {
    showNode: () => Promise.resolve('checkpoint'),
  };
}

class MalformedBlobStorageSource extends TestCheckpointTailOpticSource {
  // @ts-expect-error exercising runtime source-port validation for JavaScript callers
  override readonly _blobStorage: BlobStoragePort | null = {
    store: () => Promise.resolve('storage-oid'),
  };
}

class MalformedCodecSource extends TestCheckpointTailOpticSource {
  // @ts-expect-error exercising runtime source-port validation for JavaScript callers
  override readonly _codec: CodecPort = {
    encode: () => new Uint8Array(),
  };
}

class MalformedCommitMessageCodecSource extends TestCheckpointTailOpticSource {
  // @ts-expect-error exercising runtime source-port validation for JavaScript callers
  override readonly _commitMessageCodec: CommitMessageCodecPort = {
    decodeCheckpoint: () => ({
      kind: 'checkpoint',
      graph: 'events',
      stateHash: 'state',
      frontierOid: 'frontier',
      indexOid: 'index',
      schema: 5,
      checkpointVersion: null,
    }),
  };
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

  it('rejects malformed source ports at the constructor boundary', () => {
    const sources = [
      new MalformedPersistenceSource(),
      new MalformedBlobStorageSource(),
      new MalformedCodecSource(),
      new MalformedCommitMessageCodecSource(),
    ] as const;

    for (const source of sources) {
      expect(
        () =>
          new CoordinateCheckpointTailOpticSource({
            source,
            checkpointSha: 'checkpoint-sha',
            frontier: new Map([['writer-1', 'patch-sha']]),
          })
      ).toThrow('Coordinate checkpoint-tail optic source requires a checkpoint-tail source');
    }
  });
});
