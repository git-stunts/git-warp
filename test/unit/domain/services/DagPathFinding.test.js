import { beforeEach, describe, expect, it, vi } from 'vitest';
import DagPathFinding from '../../../../src/domain/services/dag/DagPathFinding.ts';
import MinHeap from '../../../../src/domain/utils/MinHeap.ts';

function createIndexReader({ children = /** @type {Record<string, string[]>} */ ({}), parents = /** @type {Record<string, string[]>} */ ({}) } = {}) {
  return {
    getChildren: vi.fn(async (/** @type {string} */ sha) => children[sha] ?? []),
    getParents: vi.fn(async (/** @type {string} */ sha) => parents[sha] ?? []),
  };
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

describe('DagPathFinding', () => {
  /** @type {ReturnType<typeof createIndexReader>} */
  let indexReader;
  /** @type {ReturnType<typeof createLogger>} */
  let logger;
  /** @type {DagPathFinding} */
  let service;

  beforeEach(() => {
    indexReader = createIndexReader();
    logger = createLogger();
    service = new DagPathFinding({ indexReader, logger });
  });

  it('throws when indexReader is missing', () => {
    expect(() => new DagPathFinding(/** @type {any} */ ({}))).toThrow('DagPathFinding requires an indexReader');
  });

  it('shortestPath finds a path after backward frontier expansion seeds the meeting set', async () => {
    indexReader = createIndexReader({
      children: {
        A: ['B'],
        B: ['C'],
        C: ['D'],
        D: [],
      },
      parents: {
        A: [],
        B: ['A'],
        C: ['B'],
        D: ['C'],
      },
    });
    service = new DagPathFinding({ indexReader, logger });

    const result = await service.shortestPath({ from: 'A', to: 'D', maxDepth: 10 });

    expect(result).toEqual({
      found: true,
      path: ['A', 'B', 'C', 'D'],
      length: 3,
    });
  });

  it('weightedShortestPath uses parent traversal and skips visited neighbors and duplicate queue entries', async () => {
    indexReader = createIndexReader({
      parents: {
        S: ['B', 'C'],
        B: ['S', 'X'],
        C: ['X'],
        X: ['T'],
        T: [],
      },
    });
    service = new DagPathFinding({ indexReader, logger });

    const weightProvider = vi.fn(async (from, to) => {
      const key = `${from}->${to}`;
      /** @type {Record<string, number>} */
      const weights = {
        'S->B': 1,
        'S->C': 1,
        'B->X': 10,
        'C->X': 1,
        'X->T': 100,
      };
      return weights[key] ?? 1;
    });

    const result = await service.weightedShortestPath({
      from: 'S',
      to: 'T',
      direction: 'parents',
      weightProvider,
    });

    expect(result).toEqual({
      path: ['S', 'C', 'X', 'T'],
      totalCost: 102,
    });
    expect(indexReader.getParents).toHaveBeenCalled();
    expect(indexReader.getChildren).not.toHaveBeenCalled();
  });

  it('weightedShortestPath throws NO_PATH when heap extraction yields no node', async () => {
    const extractSpy = vi.spyOn(MinHeap.prototype, 'extractMin').mockReturnValueOnce(undefined);

    try {
      await expect(
        service.weightedShortestPath({ from: 'A', to: 'B' })
      ).rejects.toMatchObject({
        name: 'TraversalError',
        code: 'NO_PATH',
      });
    } finally {
      extractSpy.mockRestore();
    }
  });

  it('aStarSearch uses parent traversal and tolerates visited neighbors and duplicate queue entries', async () => {
    indexReader = createIndexReader({
      parents: {
        S: ['B', 'C'],
        B: ['S', 'X'],
        C: ['X'],
        X: ['T'],
        T: [],
      },
    });
    service = new DagPathFinding({ indexReader, logger });

    const weightProvider = vi.fn(async (from, to) => {
      const key = `${from}->${to}`;
      /** @type {Record<string, number>} */
      const weights = {
        'S->B': 1,
        'S->C': 1,
        'B->X': 10,
        'C->X': 1,
        'X->T': 100,
      };
      return weights[key] ?? 1;
    });

    const result = await service.aStarSearch({
      from: 'S',
      to: 'T',
      direction: 'parents',
      weightProvider,
      heuristicProvider: () => 0,
    });

    expect(result).toEqual({
      path: ['S', 'C', 'X', 'T'],
      totalCost: 102,
      nodesExplored: 5,
    });
    expect(indexReader.getParents).toHaveBeenCalled();
    expect(indexReader.getChildren).not.toHaveBeenCalled();
  });

  it('aStarSearch throws NO_PATH when heap extraction yields no node', async () => {
    const extractSpy = vi.spyOn(MinHeap.prototype, 'extractMin').mockReturnValueOnce(undefined);

    try {
      await expect(
        service.aStarSearch({ from: 'A', to: 'B' })
      ).rejects.toMatchObject({
        name: 'TraversalError',
        code: 'NO_PATH',
      });
    } finally {
      extractSpy.mockRestore();
    }
  });

  it('bidirectionalAStar finds a path through forward and backward expansion', async () => {
    indexReader = createIndexReader({
      children: {
        A: ['B'],
        B: ['C'],
        C: ['D'],
        D: [],
      },
      parents: {
        A: [],
        B: ['A'],
        C: ['B'],
        D: ['C'],
      },
    });
    service = new DagPathFinding({ indexReader, logger });

    const result = await service.bidirectionalAStar({
      from: 'A',
      to: 'D',
      forwardHeuristic: () => 0,
      backwardHeuristic: () => 0,
    });

    expect(result.path).toEqual(['A', 'B', 'C', 'D']);
    expect(result.totalCost).toBe(3);
    expect(result.nodesExplored).toBeGreaterThan(0);
  });

});
