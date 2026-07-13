import { describe, it, expect } from 'vitest';
import CheckpointStorePort, {
  type CheckpointRecord,
  type CheckpointData,
} from '../../../src/ports/CheckpointStorePort.ts';

describe('CheckpointStorePort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(CheckpointStorePort.prototype.writeCheckpoint).toBeUndefined();
    expect(CheckpointStorePort.prototype.readCheckpoint).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestStore extends CheckpointStorePort {
      async writeCheckpoint(_record: CheckpointRecord) {
        return {
          nodeAliveBlobOid: 'nodeAlive',
          edgeAliveBlobOid: 'edgeAlive',
          propBlobOid: 'prop',
          observedFrontierBlobOid: 'observedFrontier',
          edgeBirthEventBlobOid: 'edgeBirthEvent',
          frontierBlobOid: 'frontier',
          appliedVVBlobOid: 'appliedVV',
          provenanceIndexBlobOid: null,
        };
      }
      async readCheckpoint(_treeOids: Record<string, string>) {
        return { state: {}, frontier: new Map(), appliedVV: null, stateHash: '', schema: 5, indexShardOids: null } as unknown as CheckpointData;
      }
    }
    const store = new TestStore();
    expect(store).toBeInstanceOf(CheckpointStorePort);
    const result = await store.writeCheckpoint({} as unknown as CheckpointRecord);
    expect(result.nodeAliveBlobOid).toBe('nodeAlive');
  });
});
