import { describe, expect, it } from 'vitest';
import NeighborProviderPort from '../../../src/ports/NeighborProviderPort.ts';

describe('NeighborProviderPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(NeighborProviderPort.prototype.getNeighbors).toBeUndefined();
    expect(NeighborProviderPort.prototype.hasNode).toBeUndefined();
  });

  it('defaults latencyClass to async-local', () => {
    class TestProvider extends NeighborProviderPort {
      async getNeighbors() { return []; }
      async hasNode() { return false; }
    }
    const provider = new TestProvider();
    expect(provider.latencyClass).toBe('async-local');
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestProvider extends NeighborProviderPort {
      async getNeighbors() { return [{ neighborId: 'b', label: 'knows' }]; }
      async hasNode() { return true; }
    }
    const provider = new TestProvider();
    expect(provider).toBeInstanceOf(NeighborProviderPort);
    expect(await provider.hasNode('a')).toBe(true);
    expect(await provider.getNeighbors('a', 'out')).toHaveLength(1);
  });
});
