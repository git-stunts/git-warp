import { describe, expect, it } from 'vitest';
import NeighborProviderPort from '../../../src/ports/NeighborProviderPort.js';

describe('NeighborProviderPort', () => {
  it('throws on direct call to getNeighbors()', async () => {
    const port = new NeighborProviderPort();
    await expect(port.getNeighbors('node:1', 'out')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to hasNode()', async () => {
    const port = new NeighborProviderPort();
    await expect(port.hasNode('node:1')).rejects.toThrow('not implemented');
  });

  it('defaults latencyClass to async-local', () => {
    const port = new NeighborProviderPort();
    expect(port.latencyClass).toBe('async-local');
  });
});
