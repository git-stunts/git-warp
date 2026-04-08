import { beforeEach, describe, expect, it, vi } from 'vitest';
import DagPathFinding from '../../../../src/domain/services/dag/DagPathFinding.js';
import TraversalError from '../../../../src/domain/errors/TraversalError.ts';
import MinHeap from '../../../../src/domain/utils/MinHeap.js';

function createIndexReader({ children = {}, parents = {} } = {}) {
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

  it('_expandForward returns immediately when the current node was already visited', async () => {
    const heap = new MinHeap();
    heap.insert('A', 0);

    const result = await service._expandForward({
      fwdHeap: heap,
      fwdVisited: new Set(['A']),
      fwdGScore: new Map([['A', 0]]),
      fwdPrevious: new Map(),
      bwdVisited: new Set(),
      bwdGScore: new Map(),
      weightProvider: async () => 1,
      forwardHeuristic: () => 0,
      to: 'Z',
      mu: 99,
      meetingPoint: null,
    });

    expect(result).toEqual({ explored: 0, mu: 99, meetingPoint: null });
  });

  it('_expandForward updates the best meeting and skips visited children', async () => {
    indexReader = createIndexReader({
      children: {
        A: ['visited-child', 'candidate'],
      },
    });
    service = new DagPathFinding({ indexReader, logger });
    const heap = new MinHeap();
    heap.insert('A', 0);

    const result = await service._expandForward({
      fwdHeap: heap,
      fwdVisited: new Set(['visited-child']),
      fwdGScore: new Map([['A', 2]]),
      fwdPrevious: new Map(),
      bwdVisited: new Set(['A']),
      bwdGScore: new Map([
        ['A', 5],
        ['candidate', 1],
      ]),
      weightProvider: async (_from, to) => (to === 'candidate' ? 1 : 99),
      forwardHeuristic: () => 0,
      to: 'Z',
      mu: 10,
      meetingPoint: null,
    });

    expect(result).toEqual({ explored: 1, mu: 4, meetingPoint: 'candidate' });
  });

  it('_expandBackward returns immediately when the current node was already visited', async () => {
    const heap = new MinHeap();
    heap.insert('A', 0);

    const result = await service._expandBackward({
      bwdHeap: heap,
      bwdVisited: new Set(['A']),
      bwdGScore: new Map([['A', 0]]),
      bwdNext: new Map(),
      fwdVisited: new Set(),
      fwdGScore: new Map(),
      weightProvider: async () => 1,
      backwardHeuristic: () => 0,
      from: 'Z',
      mu: 99,
      meetingPoint: null,
    });

    expect(result).toEqual({ explored: 0, mu: 99, meetingPoint: null });
  });

  it('_expandBackward updates the best meeting and skips visited parents', async () => {
    indexReader = createIndexReader({
      parents: {
        B: ['visited-parent', 'candidate'],
      },
    });
    service = new DagPathFinding({ indexReader, logger });
    const heap = new MinHeap();
    heap.insert('B', 0);

    const result = await service._expandBackward({
      bwdHeap: heap,
      bwdVisited: new Set(['visited-parent']),
      bwdGScore: new Map([['B', 2]]),
      bwdNext: new Map(),
      fwdVisited: new Set(['B']),
      fwdGScore: new Map([
        ['B', 6],
        ['candidate', 1],
      ]),
      weightProvider: async (from) => (from === 'candidate' ? 2 : 99),
      backwardHeuristic: () => 0,
      from: 'A',
      mu: 10,
      meetingPoint: null,
    });

    expect(result).toEqual({ explored: 1, mu: 5, meetingPoint: 'candidate' });
  });

  it('_walkPredecessors logs and returns a partial path when a predecessor is missing', () => {
    const path = service._walkPredecessors(new Map(), 'A', 'C', 'Custom path');

    expect(path).toEqual(['C']);
    expect(logger.error).toHaveBeenCalledWith(
      'Custom path reconstruction failed: missing predecessor',
      { from: 'A', to: 'C', path: ['C'] }
    );
  });

  it('_walkSuccessors logs and returns a partial path when a successor is missing', () => {
    const path = service._walkSuccessors(new Map(), 'A', 'C', 'Custom path');

    expect(path).toEqual(['A']);
    expect(logger.error).toHaveBeenCalledWith(
      'Custom path reconstruction failed: missing successor',
      { from: 'A', to: 'C', path: ['A'] }
    );
  });

  it('_reconstructBidirectionalPath prepends start and appends end when maps are incomplete', () => {
    const path = service._reconstructBidirectionalPath(new Map(), new Map(), 'A', 'Z', 'M');

    expect(path).toEqual(['A', 'M', 'Z']);
  });
});
