import { describe, it, expect } from 'vitest';
import CheckpointStorePort from '../../../src/ports/CheckpointStorePort.js';

describe('CheckpointStorePort', () => {
  it('throws on direct call to writeCheckpoint()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.writeCheckpoint({})).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readCheckpoint()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.readCheckpoint({})).rejects.toThrow('not implemented');
  });
});
