/**
 * LogicalTraversal - Traversal utilities for the logical WARP graph.
 *
 * Provides deterministic BFS/DFS/shortestPath/connectedComponent over
 * the materialized logical graph (node/edge OR-Sets), not the Git DAG.
 */

import TraversalError from '../errors/TraversalError.js';

const DEFAULT_MAX_DEPTH = 1000;

/**
 * Validates and normalizes an edge direction parameter.
 *
 * @param {string|undefined} direction - The direction to validate ('out', 'in', or 'both')
 * @returns {'out'|'in'|'both'} The validated direction, defaulting to 'out' if undefined
 * @throws {TraversalError} If the direction is not one of the valid values
 */
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

/**
 * Normalizes a label filter into a Set for efficient lookup.
 *
 * Accepts a single label string, an array of labels, or undefined. Returns
 * a Set containing the label(s) or null if no filter is specified.
 *
 * @param {string|string[]|undefined} labelFilter - The label filter to normalize
 * @returns {Set<string>|null} A Set of labels for filtering, or null if no filter
 * @throws {TraversalError} If labelFilter is neither a string, array, nor undefined
 */
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

/**
 * Filters a list of neighbor edges by label.
 *
 * If no label set is provided (null), returns all neighbors unchanged.
 * If an empty label set is provided, returns an empty array.
 * Otherwise, returns only edges whose label is in the set.
 *
 * @param {Array<{neighborId: string, label: string}>} neighbors - The list of neighbor edges to filter
 * @param {Set<string>|null} labelSet - The set of allowed labels, or null to allow all
 * @returns {Array<{neighborId: string, label: string}>} The filtered list of neighbor edges
 */
function filterByLabel(neighbors, labelSet) {
  if (!labelSet) {
    return neighbors;
  }
  if (labelSet.size === 0) {
    return [];
  }
  return neighbors.filter((edge) => labelSet.has(edge.label));
}

/**
 * Retrieves neighbors of a node based on direction and label filter.
 *
 * Returns outgoing neighbors for 'out', incoming neighbors for 'in', or
 * a merged and sorted list of both for 'both'. Results are filtered by
 * label if a label set is provided.
 *
 * For 'both' direction, neighbors are sorted first by neighborId, then by label,
 * ensuring deterministic traversal order.
 *
 * @param {Object} params - The neighbor lookup parameters
 * @param {string} params.nodeId - The node ID to get neighbors for
 * @param {'out'|'in'|'both'} params.direction - The edge direction to follow
 * @param {Object} params.adjacency - The adjacency structure from materialized graph
 * @param {Map<string, Array<{neighborId: string, label: string}>>} params.adjacency.outgoing - Outgoing edge map
 * @param {Map<string, Array<{neighborId: string, label: string}>>} params.adjacency.incoming - Incoming edge map
 * @param {Set<string>|null} params.labelSet - The set of allowed labels, or null to allow all
 * @returns {Array<{neighborId: string, label: string}>} The list of neighbor edges
 */
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

/**
 * Deterministic graph traversal engine for the materialized WARP graph.
 *
 * Provides BFS, DFS, shortest path (Dijkstra/A*), topological sort, and
 * connected component algorithms over the logical node/edge OR-Sets.
 * All traversals produce deterministic results via sorted neighbor ordering.
 */
export default class LogicalTraversal {
  /**
   * Creates a new LogicalTraversal.
   *
   * @param {import('../WarpGraph.js').default} graph - The WarpGraph instance to traverse
   */
  constructor(graph) {
    this._graph = graph;
  }

  /**
   * Prepares common traversal state by materializing the graph and validating inputs.
   *
   * This private method is called by all traversal methods to ensure the graph is
   * materialized, the start node exists, and options are normalized.
   *
   * @private
   * @param {string} start - The starting node ID for traversal
   * @param {Object} options - The traversal options to normalize
   * @param {'out'|'in'|'both'} [options.dir] - Edge direction to follow
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @param {number} [options.maxDepth] - Maximum depth to traverse
   * @returns {Promise<{dir: 'out'|'in'|'both', labelSet: Set<string>|null, adjacency: {outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}, depthLimit: number}>}
   *   The normalized traversal parameters
   * @throws {TraversalError} If the start node is not found (NODE_NOT_FOUND)
   * @throws {TraversalError} If the direction is invalid (INVALID_DIRECTION)
   * @throws {TraversalError} If the labelFilter is invalid (INVALID_LABEL_FILTER)
   */
  async _prepare(start, { dir, labelFilter, maxDepth }) {
    const materialized = await /** @type {{ _materializeGraph: () => Promise<{adjacency: {outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}}> }} */ (this._graph)._materializeGraph();

    if (!(await this._graph.hasNode(start))) {
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
   * @param {string} start - Starting node ID
   * @param {Object} [options] - Traversal options
   * @param {number} [options.maxDepth] - Maximum depth to traverse
   * @param {'out'|'in'|'both'} [options.dir] - Edge direction to follow
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async bfs(start, options = {}) {
    const { dir, labelSet, adjacency, depthLimit } = await this._prepare(start, options);
    const visited = new Set();
    const queue = [{ nodeId: start, depth: 0 }];
    const result = [];

    while (queue.length > 0) {
      const current = /** @type {{nodeId: string, depth: number}} */ (queue.shift());
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
   * @param {string} start - Starting node ID
   * @param {Object} [options] - Traversal options
   * @param {number} [options.maxDepth] - Maximum depth to traverse
   * @param {'out'|'in'|'both'} [options.dir] - Edge direction to follow
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async dfs(start, options = {}) {
    const { dir, labelSet, adjacency, depthLimit } = await this._prepare(start, options);
    const visited = new Set();
    const stack = [{ nodeId: start, depth: 0 }];
    const result = [];

    while (stack.length > 0) {
      const current = /** @type {{nodeId: string, depth: number}} */ (stack.pop());
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
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {Object} [options] - Traversal options
   * @param {number} [options.maxDepth] - Maximum search depth
   * @param {'out'|'in'|'both'} [options.dir] - Edge direction to follow
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @returns {Promise<{found: boolean, path: string[], length: number}>}
   *   When `found` is true, `path` contains the node IDs from `from` to `to` and
   *   `length` is the hop count. When `found` is false, `path` is empty and `length` is -1.
   * @throws {TraversalError} If the start node is not found or direction is invalid
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
      const current = /** @type {{nodeId: string, depth: number}} */ (queue.shift());
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
          /** @type {string|undefined} */
          let cursor = current.nodeId;
          while (cursor) {
            path.push(cursor);
            cursor = parent.get(cursor);
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
   * @param {string} start - Starting node ID
   * @param {Object} [options] - Traversal options
   * @param {number} [options.maxDepth] - Maximum depth to traverse (default: 1000)
   * @param {string|string[]} [options.labelFilter] - Edge label(s) to include
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found
   */
  async connectedComponent(start, options = {}) {
    return await this.bfs(start, { ...options, dir: 'both' });
  }
}
