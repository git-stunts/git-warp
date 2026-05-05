import { describe, expect, it } from 'vitest';
import NeighborProviderPort, {
  type Direction,
  type NeighborOptions,
  type NeighborEdge,
} from '../../../src/ports/NeighborProviderPort.ts';

describe('NeighborProviderPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(NeighborProviderPort.prototype.getNeighbors).toBeUndefined();
    expect(NeighborProviderPort.prototype.hasNode).toBeUndefined();
  });

  it('defaults latencyClass to async-local', () => {
    class TestProvider extends NeighborProviderPort {
      async getNeighbors(_nodeId: string, _direction: Direction, _options?: NeighborOptions): Promise<NeighborEdge[]> { return []; }
      async hasNode(_nodeId: string) { return false; }
    }
    const provider = new TestProvider();
    expect(provider.latencyClass).toBe('async-local');
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestProvider extends NeighborProviderPort {
      async getNeighbors(_nodeId: string, _direction: Direction, _options?: NeighborOptions): Promise<NeighborEdge[]> {
        return [{ neighborId: 'b', label: 'knows' }];
      }
      async hasNode(_nodeId: string) { return true; }
    }
    const provider = new TestProvider();
    expect(provider).toBeInstanceOf(NeighborProviderPort);
    expect(await provider.hasNode('a')).toBe(true);
    expect(await provider.getNeighbors('a', 'out')).toHaveLength(1);
  });
});
