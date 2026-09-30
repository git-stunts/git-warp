/**
 * A checkpoint whose materialization predates the current descriptor schema
 * holds property indexes built without the current visibility rules. A
 * bounded read must not use it: the loader reports that no bounded basis is
 * available, which is the error callers fall back on.
 */
import { describe, expect, it } from 'vitest';

import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';
import CheckpointTailBasisLoader from '../../../../../src/domain/services/optic/CheckpointTailBasisLoader.ts';
import CheckpointTailBasisVerifier from '../../../../../src/domain/services/optic/CheckpointTailBasisVerifier.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import { E_CHECKPOINT_STALE_MATERIALIZATION } from '../../../../../src/domain/services/state/StaleCheckpointMaterialization.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import type { CheckpointBasis } from '../../../../../src/ports/CheckpointStorePort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import MockIndexStorage from '../../../../helpers/MockIndexStorage.ts';

const GRAPH_NAME = 'checkpoint-tail-stale-materialization';
const CHECKPOINT_SHA = '2'.repeat(40);

class StaleCheckpointStore extends InMemoryCheckpointStore {
  override async loadBasis(checkpointSha: string): Promise<CheckpointBasis> {
    throw new PersistenceError(
      `Materialization for ${checkpointSha} predates descriptor schema 6`,
      E_CHECKPOINT_STALE_MATERIALIZATION,
    );
  }
}

class StaleCheckpointSource extends CheckpointTailOpticSource {
  readonly graphName = GRAPH_NAME;
  readonly _codec: CodecPort = defaultCodec;
  readonly _indexStore = new MockIndexStorage();
  readonly _checkpointStore = new StaleCheckpointStore();

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve(CHECKPOINT_SHA);
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
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined,
  ): Promise<void> {
    return Promise.resolve();
  }
}

const NO_BOUNDED_BASIS = {
  code: 'E_OPTIC_NO_BOUNDED_BASIS',
  context: { graphName: GRAPH_NAME, reason: 'checkpoint-without-index-tree' },
};

describe('checkpoint-tail basis over a checkpoint from an older descriptor schema', () => {
  it('reports no bounded basis from the loader', async () => {
    const loader = new CheckpointTailBasisLoader({ source: new StaleCheckpointSource() });

    await expect(loader.load()).rejects.toMatchObject(NO_BOUNDED_BASIS);
  });

  it('reports no bounded basis from the verifier', async () => {
    const verifier = new CheckpointTailBasisVerifier({ source: new StaleCheckpointSource() });

    await expect(verifier.verify()).rejects.toMatchObject(NO_BOUNDED_BASIS);
  });
});
