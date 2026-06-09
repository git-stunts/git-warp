import { describe, expect, it } from 'vitest';
import NeighborProviderPort, {
  NeighborEdge,
  type Direction,
  type NeighborOptions,
  isDirection,
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

  it('validates direction values', () => {
    expect(isDirection('out')).toBe(true);
    expect(isDirection('in')).toBe(true);
    expect(isDirection('both')).toBe(true);
    expect(isDirection('sideways')).toBe(false);
  });

  it('constructs immutable neighbor edge values', () => {
    const edge = new NeighborEdge('node:b', 'knows');

    expect(Object.isFrozen(edge)).toBe(true);
    expect(edge).toEqual({ neighborId: 'node:b', label: 'knows' });
    expect(NeighborEdge.from(edge)).toBe(edge);
    expect(NeighborEdge.from({ neighborId: 'node:c', label: 'likes' })).toEqual({
      neighborId: 'node:c',
      label: 'likes',
    });
    expect(() => new NeighborEdge('', 'knows')).toThrow('neighborId');
    expect(new NeighborEdge('node:b', '')).toEqual({ neighborId: 'node:b', label: '' });
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestProvider extends NeighborProviderPort {
      async getNeighbors(_nodeId: string, _direction: Direction, _options?: NeighborOptions): Promise<NeighborEdge[]> {
        return [new NeighborEdge('b', 'knows')];
      }
      async hasNode(_nodeId: string) { return true; }
    }
    const provider = new TestProvider();
    expect(provider).toBeInstanceOf(NeighborProviderPort);
    expect(await provider.hasNode('a')).toBe(true);
    expect(await provider.getNeighbors('a', 'out')).toHaveLength(1);
  });
});
