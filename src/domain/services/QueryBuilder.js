/**
 * QueryBuilder - Fluent query builder for materialized WARP state.
 *
 * Supports deterministic, multi-hop traversal over the logical graph.
 */

import QueryError from '../errors/QueryError.js';

const DEFAULT_PATTERN = '*';

/**
 * @typedef {Object} QueryNodeSnapshot
 * @property {string} id
 * @property {Record<string, unknown>} props
 * @property {Array<{label: string, to: string}>} edgesOut
 * @property {Array<{label: string, from: string}>} edgesIn
 */

function assertMatchPattern(pattern) {
  if (typeof pattern !== 'string') {
    throw new QueryError('match() expects a string pattern', {
      code: 'E_QUERY_MATCH_TYPE',
      context: { receivedType: typeof pattern },
    });
  }
}

function assertPredicate(fn) {
  if (typeof fn !== 'function') {
    throw new QueryError('where() expects a predicate function', {
      code: 'E_QUERY_WHERE_TYPE',
      context: { receivedType: typeof fn },
    });
  }
}

function assertLabel(label) {
  if (label === undefined) {
    return;
  }
  if (typeof label !== 'string') {
    throw new QueryError('label must be a string', {
      code: 'E_QUERY_LABEL_TYPE',
      context: { receivedType: typeof label },
    });
  }
}

function sortIds(ids) {
  return [...ids].sort();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPattern(nodeId, pattern) {
  if (pattern === DEFAULT_PATTERN) {
    return true;
  }
  if (pattern.includes('*')) {
    const regex = new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, '.*')}$`);
    return regex.test(nodeId);
  }
  return nodeId === pattern;
}

function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepFreeze(item);
    }
  } else {
    for (const value of Object.values(obj)) {
      deepFreeze(value);
    }
  }
  return obj;
}

function cloneValue(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // fall through to JSON clone
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function buildPropsSnapshot(propsMap) {
  const props = {};
  const keys = [...propsMap.keys()].sort();
  for (const key of keys) {
    props[key] = cloneValue(propsMap.get(key));
  }
  return deepFreeze(props);
}

function buildEdgesSnapshot(edges, directionKey) {
  const list = edges.map((edge) => ({
    label: edge.label,
    [directionKey]: edge.neighborId ?? edge[directionKey],
  }));
  list.sort((a, b) => {
    if (a.label !== b.label) {
      return a.label < b.label ? -1 : 1;
    }
    const aPeer = a[directionKey];
    const bPeer = b[directionKey];
    return aPeer < bPeer ? -1 : aPeer > bPeer ? 1 : 0;
  });
  return deepFreeze(list);
}

function createNodeSnapshot({ id, propsMap, edgesOut, edgesIn }) {
  const props = buildPropsSnapshot(propsMap);
  const edgesOutSnapshot = buildEdgesSnapshot(edgesOut, 'to');
  const edgesInSnapshot = buildEdgesSnapshot(edgesIn, 'from');

  return deepFreeze({
    id,
    props,
    edgesOut: edgesOutSnapshot,
    edgesIn: edgesInSnapshot,
  });
}

function applyHop({ direction, label, workingSet, adjacency }) {
  const next = new Set();
  const source = direction === 'outgoing' ? adjacency.outgoing : adjacency.incoming;
  const labelFilter = label === undefined ? null : label;

  for (const nodeId of workingSet) {
    const edges = source.get(nodeId) || [];
    for (const edge of edges) {
      if (labelFilter && edge.label !== labelFilter) {
        continue;
      }
      next.add(edge.neighborId);
    }
  }

  return sortIds(next);
}

/**
 * Fluent query builder.
 */
export default class QueryBuilder {
  /**
   * @param {import('../WarpGraph.js').default} graph
   */
  constructor(graph) {
    this._graph = graph;
    this._pattern = null;
    this._operations = [];
    this._select = null;
  }

  /**
   * Sets the match pattern (string only).
   * @param {string} pattern
   * @returns {QueryBuilder}
   */
  match(pattern) {
    assertMatchPattern(pattern);
    this._pattern = pattern;
    return this;
  }

  /**
   * Filters nodes by predicate.
   * @param {(node: QueryNodeSnapshot) => boolean} fn
   * @returns {QueryBuilder}
   */
  where(fn) {
    assertPredicate(fn);
    this._operations.push({ type: 'where', fn });
    return this;
  }

  /**
   * Traverses outgoing edges (one hop).
   * @param {string} [label]
   * @returns {QueryBuilder}
   */
  outgoing(label) {
    assertLabel(label);
    this._operations.push({ type: 'outgoing', label });
    return this;
  }

  /**
   * Traverses incoming edges (one hop).
   * @param {string} [label]
   * @returns {QueryBuilder}
   */
  incoming(label) {
    assertLabel(label);
    this._operations.push({ type: 'incoming', label });
    return this;
  }

  /**
   * Selects fields for the result (handled in later milestone).
   * @param {string[]} [fields]
   * @returns {QueryBuilder}
   */
  select(fields) {
    if (fields === undefined) {
      this._select = null;
      return this;
    }
    if (!Array.isArray(fields)) {
      throw new QueryError('select() expects an array of fields', {
        code: 'E_QUERY_SELECT_TYPE',
        context: { receivedType: typeof fields },
      });
    }
    this._select = fields;
    return this;
  }

  /**
   * Runs the query and returns a result.
   * @returns {Promise<{stateHash: string, nodes: string[]}>}
   */
  async run() {
    const materialized = await this._graph._materializeGraph();
    const { adjacency, stateHash } = materialized;
    const allNodes = sortIds(this._graph.getNodes());

    const pattern = this._pattern ?? DEFAULT_PATTERN;

    let workingSet;
    workingSet = allNodes.filter((nodeId) => matchesPattern(nodeId, pattern));

    for (const op of this._operations) {
      if (op.type === 'where') {
        const filtered = [];
        for (const nodeId of workingSet) {
          const propsMap = this._graph.getNodeProps(nodeId) || new Map();
          const edgesOut = adjacency.outgoing.get(nodeId) || [];
          const edgesIn = adjacency.incoming.get(nodeId) || [];
          const snapshot = createNodeSnapshot({
            id: nodeId,
            propsMap,
            edgesOut,
            edgesIn,
          });
          if (op.fn(snapshot)) {
            filtered.push(nodeId);
          }
        }
        workingSet = sortIds(filtered);
        continue;
      }

      if (op.type === 'outgoing' || op.type === 'incoming') {
        workingSet = applyHop({
          direction: op.type,
          label: op.label,
          workingSet,
          adjacency,
        });
      }
    }

    const selected = this._select;
    const selectFields = Array.isArray(selected) && selected.length > 0 ? selected : null;
    const allowedFields = new Set(['id', 'props']);
    if (selectFields) {
      for (const field of selectFields) {
        if (!allowedFields.has(field)) {
          throw new QueryError(`Unknown select field: ${field}`, {
            code: 'E_QUERY_SELECT_FIELD',
            context: { field },
          });
        }
      }
    }

    const includeId = !selectFields || selectFields.includes('id');
    const includeProps = !selectFields || selectFields.includes('props');

    const nodes = workingSet.map((nodeId) => {
      const entry = {};
      if (includeId) {
        entry.id = nodeId;
      }
      if (includeProps) {
        const propsMap = this._graph.getNodeProps(nodeId) || new Map();
        const props = buildPropsSnapshot(propsMap);
        if (selectFields || Object.keys(props).length > 0) {
          entry.props = props;
        }
      }
      return entry;
    });

    return { stateHash, nodes };
  }
}
