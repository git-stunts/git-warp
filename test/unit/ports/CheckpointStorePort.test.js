import { describe, it, expect } from 'vitest';
import CheckpointStorePort from '../../../src/ports/CheckpointStorePort.ts';

describe('CheckpointStorePort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(CheckpointStorePort.prototype.writeCheckpoint).toBeUndefined();
    expect(CheckpointStorePort.prototype.readCheckpoint).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestStore extends CheckpointStorePort {
      async writeCheckpoint() {
        return { stateBlobOid: 'a', frontierBlobOid: 'b', appliedVVBlobOid: 'c', provenanceIndexBlobOid: null };
      }
      async readCheckpoint() {
        return /** @type {any} */ ({ state: {}, frontier: new Map(), appliedVV: null, stateHash: '', schema: 5, indexShardOids: null });
      }
    }
    const store = new TestStore();
    expect(store).toBeInstanceOf(CheckpointStorePort);
    const result = await (/** @type {any} */ (store)).writeCheckpoint({});
    expect(result.stateBlobOid).toBe('a');
  });
});
