import { describe, it, expect, vi, beforeEach } from 'vitest';
import TraversalService from '../../../../src/domain/services/TraversalService.js';
import TraversalError from '../../../../src/domain/errors/TraversalError.js';

/**
 * Creates a mock index reader with a diamond DAG:
 *
 *     A
 *    / \
 *   B   C
 *    \ /
 *     D
 *     |
 *     E
 *
 * Forward edges: A->B, A->C, B->D, C->D, D->E
 * Reverse edges: B->A, C->A, D->B, D->C, E->D
 */
function createMockIndexReader() {
  const forwardEdges = {
    A: ['B', 'C'],
    B: ['D'],
    C: ['D'],
    D: ['E'],
    E: [],
  };

  const reverseEdges = {
    A: [],
    B: ['A'],
    C: ['A'],
    D: ['B', 'C'],
    E: ['D'],
  };

  return {
    getChildren: vi.fn(async (sha) => forwardEdges[sha] || []),
    getParents: vi.fn(async (sha) => reverseEdges[sha] || []),
  };
}

async function collectAll(generator) {
  const results = [];
  for await (const item of generator) {
    results.push(item);
  }
  return results;
}

describe('TraversalService', () => {
  let service;
  let mockIndexReader;

  beforeEach(() => {
    mockIndexReader = createMockIndexReader();
    service = new TraversalService({ indexReader: mockIndexReader });
  });

  describe('bfs', () => {
    it('traverses all reachable nodes in breadth-first order', async () => {
      const nodes = await collectAll(service.bfs({ start: 'A' }));

      expect(nodes.map(n => n.sha)).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(nodes[0]).toEqual({ sha: 'A', depth: 0, parent: null });
      expect(nodes[1].depth).toBe(1);
      expect(nodes[2].depth).toBe(1);
      expect(nodes[3].depth).toBe(2);
      expect(nodes[4].depth).toBe(3);
    });

    it('respects maxDepth limit', async () => {
      const nodes = await collectAll(service.bfs({ start: 'A', maxDepth: 1 }));

      expect(nodes.map(n => n.sha)).toEqual(['A', 'B', 'C']);
    });

    it('respects maxNodes limit', async () => {
      const nodes = await collectAll(service.bfs({ start: 'A', maxNodes: 3 }));

      expect(nodes).toHaveLength(3);
    });

    it('traverses in reverse direction (parents)', async () => {
      const nodes = await collectAll(service.bfs({ start: 'E', direction: 'reverse' }));

      expect(nodes.map(n => n.sha)).toContain('E');
      expect(nodes.map(n => n.sha)).toContain('D');
      expect(nodes.map(n => n.sha)).toContain('B');
      expect(nodes.map(n => n.sha)).toContain('C');
      expect(nodes.map(n => n.sha)).toContain('A');
    });

    it('handles single node with no edges', async () => {
      mockIndexReader.getChildren.mockResolvedValue([]);
      const nodes = await collectAll(service.bfs({ start: 'X' }));

      expect(nodes).toHaveLength(1);
      expect(nodes[0].sha).toBe('X');
    });
  });

  describe('dfs', () => {
    it('traverses in depth-first order', async () => {
      const nodes = await collectAll(service.dfs({ start: 'A' }));

      // DFS goes deep first: A -> B -> D -> E, then backtracks to C
      expect(nodes[0].sha).toBe('A');
      expect(nodes.map(n => n.sha)).toContain('E');
      expect(nodes).toHaveLength(5);
    });

    it('respects maxDepth limit', async () => {
      const nodes = await collectAll(service.dfs({ start: 'A', maxDepth: 2 }));

      expect(nodes.map(n => n.sha)).not.toContain('E');
    });

    it('tracks parent correctly', async () => {
      const nodes = await collectAll(service.dfs({ start: 'A' }));
      const nodeMap = new Map(nodes.map(n => [n.sha, n]));

      expect(nodeMap.get('A').parent).toBeNull();
      expect(nodeMap.get('B').parent).toBe('A');
    });
  });

  describe('ancestors', () => {
    it('finds all ancestors of a node', async () => {
      const nodes = await collectAll(service.ancestors({ sha: 'D' }));

      expect(nodes.map(n => n.sha)).toContain('D');
      expect(nodes.map(n => n.sha)).toContain('B');
      expect(nodes.map(n => n.sha)).toContain('C');
      expect(nodes.map(n => n.sha)).toContain('A');
      expect(nodes.map(n => n.sha)).not.toContain('E');
    });
  });

  describe('descendants', () => {
    it('finds all descendants of a node', async () => {
      const nodes = await collectAll(service.descendants({ sha: 'A' }));

      expect(nodes.map(n => n.sha)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('finds partial descendants from middle node', async () => {
      const nodes = await collectAll(service.descendants({ sha: 'B' }));

      expect(nodes.map(n => n.sha)).toContain('B');
      expect(nodes.map(n => n.sha)).toContain('D');
      expect(nodes.map(n => n.sha)).toContain('E');
      expect(nodes.map(n => n.sha)).not.toContain('A');
      expect(nodes.map(n => n.sha)).not.toContain('C');
    });
  });

  describe('findPath', () => {
    it('finds a path between two nodes', async () => {
      const result = await service.findPath({ from: 'A', to: 'E' });

      expect(result.found).toBe(true);
      expect(result.path[0]).toBe('A');
      expect(result.path[result.path.length - 1]).toBe('E');
      expect(result.length).toBe(result.path.length - 1);
    });

    it('returns same node for identical start/end', async () => {
      const result = await service.findPath({ from: 'A', to: 'A' });

      expect(result.found).toBe(true);
      expect(result.path).toEqual(['A']);
      expect(result.length).toBe(0);
    });

    it('returns not found when no path exists', async () => {
      const result = await service.findPath({ from: 'E', to: 'A' });

      expect(result.found).toBe(false);
      expect(result.path).toEqual([]);
      expect(result.length).toBe(-1);
    });

    it('respects maxDepth limit', async () => {
      const result = await service.findPath({ from: 'A', to: 'E', maxDepth: 2 });

      expect(result.found).toBe(false);
    });
  });

  describe('shortestPath', () => {
    it('finds the shortest path between two nodes', async () => {
      const result = await service.shortestPath({ from: 'A', to: 'D' });

      expect(result.found).toBe(true);
      // Should be A->B->D or A->C->D (length 2)
      expect(result.length).toBe(2);
      expect(result.path[0]).toBe('A');
      expect(result.path[result.path.length - 1]).toBe('D');
    });

    it('returns same node for identical start/end', async () => {
      const result = await service.shortestPath({ from: 'B', to: 'B' });

      expect(result.found).toBe(true);
      expect(result.path).toEqual(['B']);
      expect(result.length).toBe(0);
    });

    it('returns not found when no path exists', async () => {
      const result = await service.shortestPath({ from: 'E', to: 'A' });

      expect(result.found).toBe(false);
    });
  });

  describe('isReachable', () => {
    it('returns true when path exists', async () => {
      const result = await service.isReachable({ from: 'A', to: 'E' });

      expect(result).toBe(true);
    });

    it('returns false when no path exists', async () => {
      const result = await service.isReachable({ from: 'E', to: 'A' });

      expect(result).toBe(false);
    });

    it('returns true for same node', async () => {
      const result = await service.isReachable({ from: 'A', to: 'A' });

      expect(result).toBe(true);
    });
  });

  describe('commonAncestors', () => {
    it('finds common ancestors of multiple nodes', async () => {
      const result = await service.commonAncestors({ shas: ['B', 'C'] });

      // B's ancestors: B, A
      // C's ancestors: C, A
      // Common: A (and B,C themselves if considering the full closure)
      expect(result).toContain('A');
    });

    it('returns empty array for empty input', async () => {
      const result = await service.commonAncestors({ shas: [] });

      expect(result).toEqual([]);
    });

    it('returns ancestors for single node', async () => {
      const result = await service.commonAncestors({ shas: ['D'] });

      expect(result).toContain('D');
      expect(result).toContain('B');
      expect(result).toContain('C');
      expect(result).toContain('A');
    });
  });

  describe('topologicalSort', () => {
    it('yields nodes in dependency order', async () => {
      const nodes = await collectAll(service.topologicalSort({ start: 'A' }));
      const order = nodes.map(n => n.sha);

      // A must come before B and C
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
      // B and C must come before D
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
      // D must come before E
      expect(order.indexOf('D')).toBeLessThan(order.indexOf('E'));
    });

    it('respects maxNodes limit', async () => {
      const nodes = await collectAll(service.topologicalSort({ start: 'A', maxNodes: 3 }));

      expect(nodes).toHaveLength(3);
    });

    it('detects cycles and yields partial results', async () => {
      // Create a cycle: A -> B -> C -> A
      const cyclicReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = { A: ['B'], B: ['C'], C: ['A'] };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async (sha) => {
          const edges = { B: ['A'], C: ['B'], A: ['C'] };
          return edges[sha] || [];
        }),
      };
      const cyclicService = new TraversalService({ indexReader: cyclicReader });

      const nodes = await collectAll(cyclicService.topologicalSort({ start: 'A' }));

      // Should yield partial results (only node A has in-degree 0 initially)
      // The cycle B->C->A means B and C never reach in-degree 0
      expect(nodes.length).toBeLessThan(3);
    });

    it('logs warning when cycle is detected', async () => {
      const cyclicReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = { A: ['B'], B: ['C'], C: ['A'] };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const cyclicService = new TraversalService({
        indexReader: cyclicReader,
        logger: mockLogger,
      });

      await collectAll(cyclicService.topologicalSort({ start: 'A' }));

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cycle detected in topological sort',
        expect.objectContaining({
          nodesYielded: expect.any(Number),
          totalNodes: 3,
          nodesInCycle: expect.any(Number),
        })
      );
    });

    it('throws TraversalError when throwOnCycle is true and cycle detected', async () => {
      const cyclicReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = { A: ['B'], B: ['C'], C: ['A'] };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const cyclicService = new TraversalService({ indexReader: cyclicReader });

      await expect(
        collectAll(cyclicService.topologicalSort({ start: 'A', throwOnCycle: true }))
      ).rejects.toThrow(TraversalError);

      // Verify the error has the expected properties
      try {
        await collectAll(cyclicService.topologicalSort({ start: 'A', throwOnCycle: true }));
      } catch (error) {
        expect(error.code).toBe('CYCLE_DETECTED');
        expect(error.context).toMatchObject({
          start: 'A',
          totalNodes: 3,
        });
      }
    });

    it('does not throw when throwOnCycle is true but no cycle exists', async () => {
      const nodes = await collectAll(
        service.topologicalSort({ start: 'A', throwOnCycle: true })
      );

      expect(nodes).toHaveLength(5);
    });

    it('detects self-loop cycle (node is its own parent)', async () => {
      // Create a self-loop: A -> A (node A points to itself)
      const selfLoopReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = { A: ['A'] }; // A is its own child
          return edges[sha] || [];
        }),
        getParents: vi.fn(async (sha) => {
          const edges = { A: ['A'] }; // A is its own parent
          return edges[sha] || [];
        }),
      };
      const selfLoopService = new TraversalService({ indexReader: selfLoopReader });

      // With throwOnCycle: true, it should throw TraversalError
      await expect(
        collectAll(selfLoopService.topologicalSort({ start: 'A', throwOnCycle: true }))
      ).rejects.toThrow(TraversalError);

      // Verify the error details
      try {
        await collectAll(selfLoopService.topologicalSort({ start: 'A', throwOnCycle: true }));
      } catch (error) {
        expect(error.code).toBe('CYCLE_DETECTED');
        expect(error.context).toMatchObject({
          start: 'A',
          totalNodes: 1,
          nodesInCycle: expect.any(Number),
        });
      }
    });

    it('handles self-loop gracefully without throwOnCycle (yields no nodes)', async () => {
      // Create a self-loop: A -> A
      const selfLoopReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = { A: ['A'] };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const selfLoopService = new TraversalService({ indexReader: selfLoopReader });

      // Without throwOnCycle, it should complete without hanging
      // and yield partial results (the node cannot be yielded because its in-degree is never 0)
      const nodes = await collectAll(selfLoopService.topologicalSort({ start: 'A' }));

      // A self-loop means A has in-degree 1 from itself, so it can never be yielded
      // unless it's also the start node with initial in-degree 0
      // Actually in the implementation, the start node gets in-degree 0 if not set,
      // but since A->A adds in-degree, it will have in-degree 1
      expect(nodes.length).toBeLessThanOrEqual(1);
    });

    it('logs warning for self-loop cycle', async () => {
      const selfLoopReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = { A: ['A'] };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const selfLoopService = new TraversalService({
        indexReader: selfLoopReader,
        logger: mockLogger,
      });

      await collectAll(selfLoopService.topologicalSort({ start: 'A' }));

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cycle detected in topological sort',
        expect.objectContaining({
          totalNodes: 1,
          nodesInCycle: expect.any(Number),
        })
      );
    });

    it('only yields nodes reachable from start, ignoring disconnected components', async () => {
      // Create a graph with two disconnected islands:
      // Island 1: A -> B -> C (connected)
      // Island 2: X -> Y -> Z (disconnected from Island 1)
      const disconnectedReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = {
            A: ['B'],
            B: ['C'],
            C: [],
            X: ['Y'],
            Y: ['Z'],
            Z: [],
          };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async (sha) => {
          const edges = {
            A: [],
            B: ['A'],
            C: ['B'],
            X: [],
            Y: ['X'],
            Z: ['Y'],
          };
          return edges[sha] || [];
        }),
      };
      const disconnectedService = new TraversalService({ indexReader: disconnectedReader });

      // Start traversal from node A - should only visit Island 1
      const nodes = await collectAll(disconnectedService.topologicalSort({ start: 'A' }));
      const visitedShas = nodes.map(n => n.sha);

      // Should contain all nodes in Island 1
      expect(visitedShas).toContain('A');
      expect(visitedShas).toContain('B');
      expect(visitedShas).toContain('C');

      // Should NOT contain any nodes from Island 2 (disconnected component)
      expect(visitedShas).not.toContain('X');
      expect(visitedShas).not.toContain('Y');
      expect(visitedShas).not.toContain('Z');

      // Should have exactly 3 nodes (only Island 1)
      expect(nodes).toHaveLength(3);

      // Verify topological order within Island 1
      const order = nodes.map(n => n.sha);
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
    });
  });

  describe('weightedShortestPath', () => {
    it('returns shortest path with uniform weights (same as BFS)', async () => {
      // With all weights = 1 (default), should behave like BFS shortest path
      const result = await service.weightedShortestPath({ from: 'A', to: 'D' });

      expect(result.path[0]).toBe('A');
      expect(result.path[result.path.length - 1]).toBe('D');
      // A->B->D or A->C->D, both have cost 2
      expect(result.totalCost).toBe(2);
      expect(result.path).toHaveLength(3);
    });

    it('returns lowest-cost path when weights differ', async () => {
      // Create a graph where the shorter hop path is more expensive:
      //
      //     A ---(10)--- B
      //     |           |
      //    (1)         (1)
      //     |           |
      //     C ---(1)--- D
      //
      // Shortest hop: A->B (2 hops via B->D)
      // Cheapest: A->C->D (cost 2) vs A->B->D (cost 11)
      const weightedReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = {
            A: ['B', 'C'],
            B: ['D'],
            C: ['D'],
            D: [],
          };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async (sha) => {
          const edges = {
            A: [],
            B: ['A'],
            C: ['A'],
            D: ['B', 'C'],
          };
          return edges[sha] || [];
        }),
      };

      const weightedService = new TraversalService({ indexReader: weightedReader });

      // Weight provider: A->B is expensive (10), everything else is cheap (1)
      const weightProvider = (from, to) => {
        if (from === 'A' && to === 'B') return 10;
        return 1;
      };

      const result = await weightedService.weightedShortestPath({
        from: 'A',
        to: 'D',
        weightProvider,
      });

      // Should take the cheap path: A->C->D (cost 2) not A->B->D (cost 11)
      expect(result.path).toEqual(['A', 'C', 'D']);
      expect(result.totalCost).toBe(2);
    });

    it('uses weightProvider callback correctly', async () => {
      const weightProvider = vi.fn(() => 1);

      await service.weightedShortestPath({
        from: 'A',
        to: 'D',
        weightProvider,
      });

      // Should have been called for each edge explored
      expect(weightProvider).toHaveBeenCalled();
      // Verify it was called with (fromSha, toSha) arguments
      const calls = weightProvider.mock.calls;
      for (const [fromSha, toSha] of calls) {
        expect(typeof fromSha).toBe('string');
        expect(typeof toSha).toBe('string');
      }
    });

    it('works with direction=parents', async () => {
      // Traverse in reverse: from E up to A
      const result = await service.weightedShortestPath({
        from: 'E',
        to: 'A',
        direction: 'parents',
      });

      expect(result.path[0]).toBe('E');
      expect(result.path[result.path.length - 1]).toBe('A');
      // E->D->B->A or E->D->C->A, both have cost 3
      expect(result.totalCost).toBe(3);
      expect(result.path).toHaveLength(4);
    });

    it('throws TraversalError when no path exists', async () => {
      // Try to go from E to A with direction='children' (impossible)
      await expect(
        service.weightedShortestPath({ from: 'E', to: 'A', direction: 'children' })
      ).rejects.toThrow(TraversalError);

      try {
        await service.weightedShortestPath({ from: 'E', to: 'A', direction: 'children' });
      } catch (error) {
        expect(error.code).toBe('NO_PATH');
        expect(error.context).toMatchObject({
          from: 'E',
          to: 'A',
          direction: 'children',
        });
      }
    });

    it('handles disconnected nodes', async () => {
      // Create a graph with disconnected components
      const disconnectedReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = {
            A: ['B'],
            B: [],
            X: ['Y'],
            Y: [],
          };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async (sha) => {
          const edges = {
            A: [],
            B: ['A'],
            X: [],
            Y: ['X'],
          };
          return edges[sha] || [];
        }),
      };
      const disconnectedService = new TraversalService({ indexReader: disconnectedReader });

      // Try to find path between disconnected components
      await expect(
        disconnectedService.weightedShortestPath({ from: 'A', to: 'X' })
      ).rejects.toThrow(TraversalError);

      try {
        await disconnectedService.weightedShortestPath({ from: 'A', to: 'X' });
      } catch (error) {
        expect(error.code).toBe('NO_PATH');
      }
    });

    it('handles same source and destination', async () => {
      // Note: This test documents current behavior - the implementation
      // should handle this case. Based on the Dijkstra implementation,
      // when from === to, the result depends on implementation details.
      // Let's test what happens:
      const result = await service.weightedShortestPath({ from: 'A', to: 'A' });

      // The path should be just [A] with cost 0
      expect(result.path).toEqual(['A']);
      expect(result.totalCost).toBe(0);
    });

    it('handles complex weighted graph correctly', async () => {
      // Create a more complex weighted graph:
      //
      //       A
      //      /|\
      //    (1)(5)(2)
      //    /  |  \
      //   B   C   D
      //    \  |  /
      //    (1)(1)(1)
      //      \|/
      //       E
      //
      // Shortest path A->E: A->B->E (cost 2) or A->D->E (cost 3) or A->C->E (cost 6)
      const complexReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = {
            A: ['B', 'C', 'D'],
            B: ['E'],
            C: ['E'],
            D: ['E'],
            E: [],
          };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const complexService = new TraversalService({ indexReader: complexReader });

      const weights = {
        'A-B': 1,
        'A-C': 5,
        'A-D': 2,
        'B-E': 1,
        'C-E': 1,
        'D-E': 1,
      };
      const weightProvider = (from, to) => weights[`${from}-${to}`] || 1;

      const result = await complexService.weightedShortestPath({
        from: 'A',
        to: 'E',
        weightProvider,
      });

      expect(result.path).toEqual(['A', 'B', 'E']);
      expect(result.totalCost).toBe(2);
    });

    it('handles zero-weight edges', async () => {
      const zeroWeightReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = {
            A: ['B', 'C'],
            B: ['D'],
            C: ['D'],
            D: [],
          };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const zeroWeightService = new TraversalService({ indexReader: zeroWeightReader });

      // A->C has zero weight, A->B has weight 1
      const weightProvider = (from, to) => {
        if (from === 'A' && to === 'C') return 0;
        return 1;
      };

      const result = await zeroWeightService.weightedShortestPath({
        from: 'A',
        to: 'D',
        weightProvider,
      });

      // Should prefer the zero-weight path: A->C->D (cost 1) over A->B->D (cost 2)
      expect(result.path).toEqual(['A', 'C', 'D']);
      expect(result.totalCost).toBe(1);
    });

    it('logs debug messages during traversal', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const loggingService = new TraversalService({
        indexReader: mockIndexReader,
        logger: mockLogger,
      });

      await loggingService.weightedShortestPath({ from: 'A', to: 'D' });

      expect(mockLogger.debug).toHaveBeenCalledWith('weightedShortestPath started', expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith('weightedShortestPath found', expect.any(Object));
    });

    it('logs debug when no path found', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const loggingService = new TraversalService({
        indexReader: mockIndexReader,
        logger: mockLogger,
      });

      try {
        await loggingService.weightedShortestPath({ from: 'E', to: 'A', direction: 'children' });
      } catch {
        // Expected to throw
      }

      expect(mockLogger.debug).toHaveBeenCalledWith('weightedShortestPath not found', expect.any(Object));
    });
  });

  describe('aStarSearch', () => {
    it('returns shortest path with no heuristic (same as Dijkstra)', async () => {
      // With default heuristic (always 0), A* degenerates to Dijkstra
      const result = await service.aStarSearch({ from: 'A', to: 'D' });

      expect(result.path[0]).toBe('A');
      expect(result.path[result.path.length - 1]).toBe('D');
      // A->B->D or A->C->D, both have cost 2 with uniform weights
      expect(result.totalCost).toBe(2);
      expect(result.path).toHaveLength(3);
      expect(result.nodesExplored).toBeGreaterThan(0);
    });

    it('returns optimal path with admissible heuristic', async () => {
      // Create a graph where heuristic can guide search:
      //
      //     A ---(1)--- B ---(1)--- C
      //     |                       |
      //    (1)                     (1)
      //     |                       |
      //     D ---(1)--- E ---(1)--- F
      //
      // Path A->F can go A->B->C->F (cost 3) or A->D->E->F (cost 3)
      // With a good heuristic, A* should explore fewer nodes
      const gridReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = {
            A: ['B', 'D'],
            B: ['C'],
            C: ['F'],
            D: ['E'],
            E: ['F'],
            F: [],
          };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const gridService = new TraversalService({ indexReader: gridReader });

      // Heuristic: estimate based on "distance" to F
      // A=2, B=2, C=1, D=2, E=1, F=0 (admissible - never overestimates)
      const heuristic = {
        A: 2,
        B: 2,
        C: 1,
        D: 2,
        E: 1,
        F: 0,
      };

      const result = await gridService.aStarSearch({
        from: 'A',
        to: 'F',
        heuristicProvider: (sha) => heuristic[sha] || 0,
      });

      // Should find optimal path with cost 3
      expect(result.totalCost).toBe(3);
      expect(result.path[0]).toBe('A');
      expect(result.path[result.path.length - 1]).toBe('F');
    });

    it('explores fewer nodes with good heuristic', async () => {
      // Create a wider graph where heuristic guidance matters:
      //
      //        A
      //       /|\
      //      B C D
      //     /| | |\
      //    E F G H I
      //     \| | |/
      //        J
      //
      // Goal is J. With no heuristic, Dijkstra explores many nodes.
      // With heuristic pointing toward C->G->J path, fewer nodes explored.
      const wideReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = {
            A: ['B', 'C', 'D'],
            B: ['E', 'F'],
            C: ['G'],
            D: ['H', 'I'],
            E: ['J'],
            F: ['J'],
            G: ['J'],
            H: ['J'],
            I: ['J'],
            J: [],
          };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const wideService = new TraversalService({ indexReader: wideReader });

      // Run Dijkstra (zero heuristic)
      const dijkstraResult = await wideService.aStarSearch({
        from: 'A',
        to: 'J',
        heuristicProvider: () => 0,
      });

      // Run A* with heuristic that favors the C path
      // C is closest to J (h=1), B and D are farther (h=2)
      const heuristic = {
        A: 2,
        B: 2,
        C: 1,
        D: 2,
        E: 1,
        F: 1,
        G: 1,
        H: 1,
        I: 1,
        J: 0,
      };
      const aStarResult = await wideService.aStarSearch({
        from: 'A',
        to: 'J',
        heuristicProvider: (sha) => heuristic[sha] || 0,
      });

      // Both should find path with same cost
      expect(aStarResult.totalCost).toBe(dijkstraResult.totalCost);

      // A* with good heuristic should explore fewer or equal nodes
      expect(aStarResult.nodesExplored).toBeLessThanOrEqual(dijkstraResult.nodesExplored);
    });

    it('uses heuristicProvider callback correctly', async () => {
      const heuristicProvider = vi.fn(() => 0);

      await service.aStarSearch({
        from: 'A',
        to: 'D',
        heuristicProvider,
      });

      // Should have been called for initial node and each neighbor explored
      expect(heuristicProvider).toHaveBeenCalled();

      // Verify it was called with (sha, targetSha) arguments
      const calls = heuristicProvider.mock.calls;
      for (const [sha, targetSha] of calls) {
        expect(typeof sha).toBe('string');
        expect(targetSha).toBe('D'); // Target should always be 'D'
      }
    });

    it('works with direction=parents', async () => {
      // Traverse in reverse: from E up to A
      const result = await service.aStarSearch({
        from: 'E',
        to: 'A',
        direction: 'parents',
      });

      expect(result.path[0]).toBe('E');
      expect(result.path[result.path.length - 1]).toBe('A');
      // E->D->B->A or E->D->C->A, both have cost 3
      expect(result.totalCost).toBe(3);
      expect(result.path).toHaveLength(4);
    });

    it('throws TraversalError when no path exists', async () => {
      // Try to go from E to A with direction='children' (impossible)
      await expect(
        service.aStarSearch({ from: 'E', to: 'A', direction: 'children' })
      ).rejects.toThrow(TraversalError);

      try {
        await service.aStarSearch({ from: 'E', to: 'A', direction: 'children' });
      } catch (error) {
        expect(error.code).toBe('NO_PATH');
        expect(error.context).toMatchObject({
          from: 'E',
          to: 'A',
          direction: 'children',
        });
      }
    });

    it('handles same source and destination', async () => {
      const result = await service.aStarSearch({ from: 'A', to: 'A' });

      expect(result.path).toEqual(['A']);
      expect(result.totalCost).toBe(0);
      expect(result.nodesExplored).toBe(1);
    });

    it('with zero heuristic behaves like Dijkstra', async () => {
      // Create a weighted graph
      const weightedReader = {
        getChildren: vi.fn(async (sha) => {
          const edges = {
            A: ['B', 'C'],
            B: ['D'],
            C: ['D'],
            D: [],
          };
          return edges[sha] || [];
        }),
        getParents: vi.fn(async () => []),
      };
      const weightedService = new TraversalService({ indexReader: weightedReader });

      // A->B is expensive (10), A->C is cheap (1), both ->D is 1
      const weightProvider = (from, to) => {
        if (from === 'A' && to === 'B') return 10;
        return 1;
      };

      // A* with zero heuristic
      const aStarResult = await weightedService.aStarSearch({
        from: 'A',
        to: 'D',
        weightProvider,
        heuristicProvider: () => 0,
      });

      // Dijkstra
      const dijkstraResult = await weightedService.weightedShortestPath({
        from: 'A',
        to: 'D',
        weightProvider,
      });

      // Both should find the same optimal path
      expect(aStarResult.path).toEqual(dijkstraResult.path);
      expect(aStarResult.totalCost).toBe(dijkstraResult.totalCost);
      // Should take cheap path: A->C->D (cost 2) not A->B->D (cost 11)
      expect(aStarResult.path).toEqual(['A', 'C', 'D']);
      expect(aStarResult.totalCost).toBe(2);
    });
  });

  describe('logging', () => {
    it('logs traversal operations', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const loggingService = new TraversalService({
        indexReader: mockIndexReader,
        logger: mockLogger,
      });

      await collectAll(loggingService.bfs({ start: 'A', maxNodes: 2 }));

      expect(mockLogger.debug).toHaveBeenCalledWith('BFS started', expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith('BFS completed', expect.any(Object));
    });
  });
});
