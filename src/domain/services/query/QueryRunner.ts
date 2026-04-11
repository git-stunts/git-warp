/**
 * QueryRunner — pure executor for QueryPlan instances.
 *
 * Takes a frozen QueryPlan and a graph handle, returns results.
 * All mutation-free: the runner does not modify the plan or the graph.
 */

import QueryError from '../../errors/QueryError.ts';
import { matchGlob } from '../../utils/matchGlob.ts';
import type QueryPlan from './QueryPlan.ts';
import type { AggregateSpec, QueryNodeSnapshot } from './QueryPlan.ts';

// ── Graph contract ──────────────────────────────────────────────────

/** Structural interface for the graph handle needed by the runner. */
export type QueryGraph = {
  _materializeGraph: () => Promise<{ adjacency: unknown; stateHash: string | null }>;
  getNodes: () => Promise<string[]>;
  getNodeProps: (nodeId: string) => Promise<Record<string, unknown> | null>;
  getEdges: () => Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>>;
};

// ── Adjacency types ─────────────────────────────────────────────────

type AdjacencyMaps = {
  outgoing: Map<string, Array<{ label: string; neighborId: string }>>;
  incoming: Map<string, Array<{ label: string; neighborId: string }>>;
};

// ── Result types ────────────────────────────────────────────────────

export type QueryResult = {
  stateHash: string;
  nodes: Array<{ id?: string; props?: Record<string, unknown> }>;
};

export type AggregateResult = {
  stateHash: string;
  count?: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
};

// ── Utilities ───────────────────────────────────────────────────────

async function batchMap<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 100): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn));
    for (const r of batchResults) {
      results.push(r);
    }
  }
  return results;
}

function isAdjacencyMaps(adjacency: unknown): adjacency is AdjacencyMaps {
  return (
    adjacency !== null &&
    typeof adjacency === 'object' &&
    (adjacency as AdjacencyMaps).outgoing instanceof Map &&
    (adjacency as AdjacencyMaps).incoming instanceof Map
  );
}

function requireAdjacencyMaps(adjacency: unknown): AdjacencyMaps {
  if (!isAdjacencyMaps(adjacency)) {
    throw new QueryError('materialized query adjacency is invalid', {
      code: 'E_QUERY_ADJACENCY',
    });
  }
  return adjacency;
}

function requireStateHash(stateHash: string | null): string {
  if (typeof stateHash !== 'string') {
    throw new QueryError('materialized query state hash must be a string', {
      code: 'E_QUERY_STATE_HASH',
    });
  }
  return stateHash;
}

function sortIds(ids: Iterable<string>): string[] {
  return [...ids].sort();
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object' || Object.isFrozen(obj)) {
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

function cloneValue<T>(value: T): T {
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
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function buildPropsSnapshot(propsRecord: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const props: Record<string, unknown> = {};
  const keys = Object.keys(propsRecord).sort();
  for (const key of keys) {
    props[key] = cloneValue(propsRecord[key]);
  }
  return deepFreeze(props);
}

function buildEdgesSnapshot(
  edges: Array<{ label: string; neighborId?: string; to?: string; from?: string }>,
  directionKey: 'to' | 'from',
): ReadonlyArray<{ label: string; to?: string; from?: string }> {
  const list = edges.map((edge) => ({
    label: edge.label,
    [directionKey]: edge.neighborId ?? edge[directionKey],
  }));
  list.sort((a, b) => {
    if (a.label !== b.label) {
      return a.label < b.label ? -1 : 1;
    }
    const aPeer = a[directionKey] as string;
    const bPeer = b[directionKey] as string;
    return aPeer < bPeer ? -1 : aPeer > bPeer ? 1 : 0;
  });
  return deepFreeze(list);
}

function createNodeSnapshot(params: {
  id: string;
  propsRecord: Record<string, unknown>;
  edgesOut: Array<{ label: string; neighborId: string }>;
  edgesIn: Array<{ label: string; neighborId: string }>;
}): Readonly<QueryNodeSnapshot> {
  const props = buildPropsSnapshot(params.propsRecord);
  const edgesOutSnapshot = buildEdgesSnapshot(params.edgesOut, 'to');
  const edgesInSnapshot = buildEdgesSnapshot(params.edgesIn, 'from');

  return deepFreeze({
    id: params.id,
    props,
    edgesOut: edgesOutSnapshot,
    edgesIn: edgesInSnapshot,
  });
}

// ── Traversal ───────────────────────────────────────────────────────

function applyHop(params: {
  direction: 'outgoing' | 'incoming';
  label: string | undefined;
  strand: string[];
  adjacency: AdjacencyMaps;
}): string[] {
  const next = new Set<string>();
  const source = params.direction === 'outgoing' ? params.adjacency.outgoing : params.adjacency.incoming;
  const labelFilter = params.label === undefined ? null : params.label;

  for (const nodeId of params.strand) {
    const edges = source.get(nodeId) ?? [];
    for (const edge of edges) {
      if (labelFilter !== null && edge.label !== labelFilter) {
        continue;
      }
      next.add(edge.neighborId);
    }
  }

  return sortIds(next);
}

function applyMultiHop(params: {
  direction: 'outgoing' | 'incoming';
  label: string | undefined;
  strand: string[];
  adjacency: AdjacencyMaps;
  depth: [number, number];
}): string[] {
  const [minDepth, maxDepth] = params.depth;
  const source = params.direction === 'outgoing' ? params.adjacency.outgoing : params.adjacency.incoming;
  const labelFilter = params.label === undefined ? null : params.label;

  const result = new Set<string>();
  let currentLevel = new Set<string>(params.strand);
  const visited = new Set<string>(params.strand);

  if (minDepth === 0) {
    for (const nodeId of params.strand) {
      result.add(nodeId);
    }
  }

  for (let hop = 1; hop <= maxDepth; hop++) {
    const nextLevel = new Set<string>();
    for (const nodeId of currentLevel) {
      const edges = source.get(nodeId) ?? [];
      for (const edge of edges) {
        if (labelFilter !== null && edge.label !== labelFilter) {
          continue;
        }
        const neighbor = edge.neighborId;
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        nextLevel.add(neighbor);
        if (hop >= minDepth) {
          result.add(neighbor);
        }
      }
    }
    currentLevel = nextLevel;
    if (currentLevel.size === 0) {
      break;
    }
  }

  return sortIds(result);
}

// ── Runner ──────────────────────────────────────────────────────────

const DEFAULT_PATTERN = '*';

export default class QueryRunner {
  private readonly _graph: QueryGraph;

  constructor(graph: QueryGraph) {
    this._graph = graph;
  }

  async run(plan: QueryPlan): Promise<QueryResult | AggregateResult> {
    const materialized = await this._graph._materializeGraph();
    const adjacency = requireAdjacencyMaps(materialized.adjacency);
    const stateHash = requireStateHash(materialized.stateHash);
    const allNodes = sortIds(await this._graph.getNodes());

    const pattern = plan.pattern ?? DEFAULT_PATTERN;

    const propsMemo = new Map<string, Record<string, unknown>>();
    const getProps = async (nodeId: string): Promise<Record<string, unknown>> => {
      const cached = propsMemo.get(nodeId);
      if (cached !== undefined) {
        return cached;
      }
      const rawProps = await this._graph.getNodeProps(nodeId);
      const propsRecord = rawProps ?? {};
      propsMemo.set(nodeId, propsRecord);
      return propsRecord;
    };

    let strand = allNodes.filter((nodeId) => matchGlob(pattern, nodeId));

    for (const op of plan.operations) {
      if (op.type === 'where') {
        const snapshots = await batchMap(strand, async (nodeId) => {
          const propsRecord = await getProps(nodeId);
          const edgesOut = adjacency.outgoing.get(nodeId) ?? [];
          const edgesIn = adjacency.incoming.get(nodeId) ?? [];
          return {
            nodeId,
            snapshot: createNodeSnapshot({ id: nodeId, propsRecord, edgesOut, edgesIn }),
          };
        });
        const predicate = op.fn;
        const filtered = snapshots
          .filter(({ snapshot }) => predicate(snapshot))
          .map(({ nodeId }) => nodeId);
        strand = sortIds(filtered);
        continue;
      }

      if (op.type === 'outgoing' || op.type === 'incoming') {
        const [minD, maxD] = op.depth;
        if (minD === 1 && maxD === 1) {
          strand = applyHop({
            direction: op.type,
            label: op.label,
            strand,
            adjacency,
          });
        } else {
          strand = applyMultiHop({
            direction: op.type,
            label: op.label,
            strand,
            adjacency,
            depth: op.depth,
          });
        }
      }
    }

    if (plan.aggregate) {
      return await this._runAggregate(strand, stateHash, getProps, plan.aggregate);
    }

    const selected = plan.select;
    const selectFields: string[] | null = Array.isArray(selected) && selected.length > 0 ? Array.from(selected) : null;
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

    const nodes = await batchMap(strand, async (nodeId) => {
      const entry: { id?: string; props?: Record<string, unknown> } = {};
      if (includeId) {
        entry.id = nodeId;
      }
      if (includeProps) {
        const propsRecord = await getProps(nodeId);
        const props = buildPropsSnapshot(propsRecord);
        if (selectFields !== null || Object.keys(props).length > 0) {
          entry.props = props;
        }
      }
      return entry;
    });

    return { stateHash, nodes };
  }

  private async _runAggregate(
    strand: string[],
    stateHash: string,
    getProps: (nodeId: string) => Promise<Record<string, unknown>>,
    spec: AggregateSpec,
  ): Promise<AggregateResult> {
    const result: AggregateResult = { stateHash };
    const specRec = spec as Record<string, unknown>;

    if (spec.count === true) {
      result.count = strand.length;
    }

    const numericAggs = ['sum', 'avg', 'min', 'max'];
    const activeAggs = numericAggs.filter((key) => specRec[key] !== undefined && specRec[key] !== null);

    if (activeAggs.length > 0) {
      const propsByAgg = new Map<string, { segments: string[]; values: number[] }>();
      for (const key of activeAggs) {
        propsByAgg.set(key, {
          segments: (specRec[key] as string).replace(/^props\./, '').split('.'),
          values: [],
        });
      }

      const propsList = await batchMap(strand, getProps);

      for (const propsRecord of propsList) {
        for (const { segments, values } of propsByAgg.values()) {
          let value: unknown = propsRecord[segments[0] as string];
          for (let i = 1; i < segments.length; i++) {
            if (value !== null && value !== undefined && typeof value === 'object') {
              value = (value as Record<string, unknown>)[segments[i] as string];
            } else {
              value = undefined;
              break;
            }
          }
          if (typeof value === 'number' && !Number.isNaN(value)) {
            values.push(value);
          }
        }
      }

      for (const [key, { values }] of propsByAgg) {
        if (key === 'sum') {
          result.sum = values.length > 0 ? values.reduce((a, b) => a + b, 0) : 0;
        } else if (key === 'avg') {
          result.avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        } else if (key === 'min') {
          result.min = values.length > 0 ? values.reduce((m, v) => (v < m ? v : m), Infinity) : 0;
        } else if (key === 'max') {
          result.max = values.length > 0 ? values.reduce((m, v) => (v > m ? v : m), -Infinity) : 0;
        }
      }
    }

    return result;
  }
}
