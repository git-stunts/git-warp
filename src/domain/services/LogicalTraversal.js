/**
 * LogicalTraversal - Traversal utilities for the logical WARP graph.
 *
 * Provides deterministic BFS/DFS/shortestPath/connectedComponent over
 * the materialized logical graph (node/edge OR-Sets), not the Git DAG.
 */

import TraversalError from '../errors/TraversalError.js';

const DEFAULT_MAX_DEPTH = 1000;

function assertDirection(direction) {
  if (direction === undefined) {
    return 'out';
  }
  if (direction === 'out' || direction === 'in' || direction === 'both') {
    return direction;
  }
  throw new TraversalError(`Invalid direction: ${direction}`, {
    code: 'INVALID_DIRECTION',
    context: { direction },
  });
}

function normalizeLabelFilter(labelFilter) {
  if (labelFilter === undefined) {
    return null;
  }
  if (Array.isArray(labelFilter)) {
    return new Set(labelFilter);
  }
  if (typeof labelFilter === 'string') {
    return new Set([labelFilter]);
  }
  throw new TraversalError('labelFilter must be a string or array', {
    code: 'INVALID_LABEL_FILTER',
    context: { receivedType: typeof labelFilter },
  });
}

function filterByLabel(neighbors, labelSet) {
  if (!labelSet) {
    return neighbors;
  }
  if (labelSet.size === 0) {
    return [];
  }
  return neighbors.filter((edge) => labelSet.has(edge.label));
}

function getNeighbors({ nodeId, direction, adjacency, labelSet }) {
  const outgoing = filterByLabel(adjacency.outgoing.get(nodeId) || [], labelSet);
  const incoming = filterByLabel(adjacency.incoming.get(nodeId) || [], labelSet);

  if (direction === 'out') {
    return outgoing;
  }
  if (direction === 'in') {
    return incoming;
  }

  const merged = outgoing.concat(incoming);
  merged.sort((a, b) => {
    if (a.neighborId !== b.neighborId) {
      return a.neighborId < b.neighborId ? -1 : 1;
    }
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });
  return merged;
}

export default class LogicalTraversal {
  /**
   * @param {import('../WarpGraph.js').default} graph
   */
  constructor(graph) {
    this._graph = graph;
  }

  async _prepare(start, { dir, labelFilter, maxDepth }) {
    const materialized = await this._graph._materializeGraph();

    if (!this._graph.hasNode(start)) {
      throw new TraversalError(`Start node not found: ${start}`, {
        code: 'NODE_NOT_FOUND',
        context: { start },
      });
    }

    const resolvedDir = assertDirection(dir);
    const labelSet = normalizeLabelFilter(labelFilter);
    const { adjacency } = materialized;
    const depthLimit = maxDepth ?? DEFAULT_MAX_DEPTH;

    return { dir: resolvedDir, labelSet, adjacency, depthLimit };
  }

  /**
   * Breadth-first traversal.
   *
   * @param {string} start
   * @param {{maxDepth?: number, dir?: 'out'|'in'|'both', labelFilter?: string | string[]}} [options]
   * @returns {Promise<string[]>} Node IDs in visit order
   */
  async bfs(start, options = {}) {
    const { dir, labelSet, adjacency, depthLimit } = await this._prepare(start, options);
    const visited = new Set();
    const queue = [{ nodeId: start, depth: 0 }];
    const result = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current.nodeId)) {
        continue;
      }
      if (current.depth > depthLimit) {
        continue;
      }

      visited.add(current.nodeId);
      result.push(current.nodeId);

      if (current.depth === depthLimit) {
        continue;
      }

      const neighbors = getNeighbors({
        nodeId: current.nodeId,
        direction: dir,
        adjacency,
        labelSet,
      });

      for (const edge of neighbors) {
        if (!visited.has(edge.neighborId)) {
          queue.push({ nodeId: edge.neighborId, depth: current.depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Depth-first traversal (pre-order).
   *
   * @param {string} start
   * @param {{maxDepth?: number, dir?: 'out'|'in'|'both', labelFilter?: string | string[]}} [options]
   * @returns {Promise<string[]>} Node IDs in visit order
   */
  async dfs(start, options = {}) {
    const { dir, labelSet, adjacency, depthLimit } = await this._prepare(start, options);
    const visited = new Set();
    const stack = [{ nodeId: start, depth: 0 }];
    const result = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current.nodeId)) {
        continue;
      }
      if (current.depth > depthLimit) {
        continue;
      }

      visited.add(current.nodeId);
      result.push(current.nodeId);

      if (current.depth === depthLimit) {
        continue;
      }

      const neighbors = getNeighbors({
        nodeId: current.nodeId,
        direction: dir,
        adjacency,
        labelSet,
      });

      for (let i = neighbors.length - 1; i >= 0; i -= 1) {
        const edge = neighbors[i];
        if (!visited.has(edge.neighborId)) {
          stack.push({ nodeId: edge.neighborId, depth: current.depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Shortest path (unweighted) using BFS.
   *
   * @param {string} from
   * @param {string} to
   * @param {{maxDepth?: number, dir?: 'out'|'in'|'both', labelFilter?: string | string[]}} [options]
   * @returns {Promise<{found: boolean, path: string[], length: number}>}
   */
  async shortestPath(from, to, options = {}) {
    const { dir, labelSet, adjacency, depthLimit } = await this._prepare(from, options);

    if (from === to) {
      return { found: true, path: [from], length: 0 };
    }

    const visited = new Set();
    const queue = [{ nodeId: from, depth: 0 }];
    const parent = new Map();

    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.depth >= depthLimit) {
        continue;
      }

      const neighbors = getNeighbors({
        nodeId: current.nodeId,
        direction: dir,
        adjacency,
        labelSet,
      });

      for (const edge of neighbors) {
        if (visited.has(edge.neighborId)) {
          continue;
        }
        visited.add(edge.neighborId);
        parent.set(edge.neighborId, current.nodeId);

        if (edge.neighborId === to) {
          const path = [to];
          let cursor = current.nodeId;
          while (cursor) {
            path.push(cursor);
            cursor = parent.get(cursor) || null;
          }
          path.reverse();
          return { found: true, path, length: path.length - 1 };
        }

        queue.push({ nodeId: edge.neighborId, depth: current.depth + 1 });
      }
    }

    return { found: false, path: [], length: -1 };
  }

  /**
   * Connected component (undirected by default).
   *
   * @param {string} start
   * @param {{labelFilter?: string | string[]}} [options]
   * @returns {Promise<string[]>} Node IDs in visit order
   */
  async connectedComponent(start, options = {}) {
    return this.bfs(start, { ...options, dir: 'both' });
  }
}
