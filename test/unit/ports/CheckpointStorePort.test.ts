import { describe, expect, it } from 'vitest';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import WarpState from '../../../src/domain/services/state/WarpState.ts';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../../src/domain/storage/StorageRetentionWitness.ts';
import CheckpointStorePort, {
  type CheckpointBasis,
  type CheckpointData,
  type CheckpointMetadata,
  type CheckpointRecord,
} from '../../../src/ports/CheckpointStorePort.ts';

describe('CheckpointStorePort', () => {
  it('declares a semantic checkpoint lifecycle', () => {
    expect(CheckpointStorePort.prototype.publishCheckpoint).toBeUndefined();
    expect(CheckpointStorePort.prototype.resolveHead).toBeUndefined();
    expect(CheckpointStorePort.prototype.loadCheckpoint).toBeUndefined();
    expect(CheckpointStorePort.prototype.readMetadata).toBeUndefined();
    expect(CheckpointStorePort.prototype.loadBasis).toBeUndefined();
    expect(CheckpointStorePort.prototype.publishCoverage).toBeUndefined();
  });

  it('can publish and load checkpoints without physical tree metadata', async () => {
    const data: CheckpointData = {
      state: WarpState.empty(),
      frontier: new Map(),
      stateHash: 'state-hash',
      schema: 5,
      appliedVV: VersionVector.empty(),
      indexShardHandles: null,
    };
    const bundleHandle = new BundleHandle('checkpoint-bundle');
    const retention = new StorageRetentionWitness({
      handle: bundleHandle,
      policy: 'pinned',
      reachability: 'anchored',
      root: new StorageRetentionRoot({
        kind: 'publication',
        namespace: 'g',
        locator: 'checkpoint:g',
        generation: 'checkpoint-sha',
        path: '/',
      }),
      observedAt: new Date(0).toISOString(),
    });
    class TestStore extends CheckpointStorePort {
      async publishCheckpoint(_record: CheckpointRecord) {
        return { checkpointSha: 'checkpoint-sha', bundleHandle, retention };
      }
      async resolveHead(_graphName: string) { return 'checkpoint-sha'; }
      async loadCheckpoint(_sha: string) { return data; }
      async readMetadata(_sha: string): Promise<CheckpointMetadata> {
        return { checkpointSha: 'checkpoint-sha', stateHash: 'state-hash', schema: 5 };
      }
      async loadBasis(_sha: string): Promise<CheckpointBasis> {
        return {
          checkpointSha: 'checkpoint-sha',
          stateHash: 'state-hash',
          schema: 5,
          frontier: new Map(),
          indexShardHandles: {},
        };
      }
      async publishCoverage() { return 'coverage-sha'; }
    }
    const store = new TestStore();

    const published = await store.publishCheckpoint({
      graphName: 'g',
      state: WarpState.empty(),
      frontier: new Map(),
      appliedVV: VersionVector.empty(),
      stateHash: 'state-hash',
      parents: [],
    });
    expect(published).toEqual({ checkpointSha: 'checkpoint-sha', bundleHandle, retention });
    await expect(store.loadCheckpoint(published.checkpointSha)).resolves.toBe(data);
  });
});
