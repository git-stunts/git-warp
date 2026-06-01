import { describe, expect, it } from 'vitest';

import Worldline from '../../../../src/domain/services/Worldline.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import type { Aperture } from '../../../../src/domain/types/Aperture.ts';
import type { WorldlineSource } from '../../../../src/domain/capabilities/QueryCapability.ts';
import type BlobStoragePort from '../../../../src/ports/BlobStoragePort.ts';
import type CodecPort from '../../../../src/ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../../src/ports/CommitMessageCodecPort.ts';
import type { CorePersistence } from '../../../../src/domain/types/WarpPersistence.ts';

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

const graph = {
  observer(
    _nameOrConfig: string | Aperture,
    _configOrOptions?: Aperture | { readonly source: WorldlineSource },
    _maybeOptions?: { readonly source: WorldlineSource }
  ): Promise<never> {
    return Promise.reject();
  },
};

describe('Worldline', () => {
  it('reports the supported optic selector family when selector is unsupported', () => {
    const worldline = new Worldline({
      graph,
      source: { kind: 'strand', strandId: 'strand-1' },
      opticSource: new TestCheckpointTailOpticSource(),
    });

    expect(() => worldline.optic()).toThrow(
      'v17 foundation optics support live and coordinate worldlines only'
    );
  });
});
