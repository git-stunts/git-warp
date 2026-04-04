import { describe, it, expect } from 'vitest';
import CheckpointStorePort from '../../../src/ports/CheckpointStorePort.js';

describe('CheckpointStorePort', () => {
  it('throws on direct call to writeState()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.writeState({})).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readState()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.readState('abc123')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to writeAppliedVV()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.writeAppliedVV({})).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readAppliedVV()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.readAppliedVV('abc123')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to writeFrontier()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.writeFrontier(new Map())).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readFrontier()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.readFrontier('abc123')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to computeStateHash()', async () => {
    const port = new CheckpointStorePort();
    await expect(port.computeStateHash({})).rejects.toThrow('not implemented');
  });
});
