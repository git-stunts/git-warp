/** QueryRunner — pure executor for QueryPlan instances. */

import QueryError from '../../errors/QueryError.ts';
import { matchGlob } from '../../utils/matchGlob.ts';
import type QueryPlan from './QueryPlan.ts';
import type { AggregateSpec, QueryNodeSnapshot, QueryNodeEdgeSnapshot, QueryOperation } from './QueryPlan.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';

type QueryPropertyBag = Readonly<{ [key: string]: SnapshotPropValue }>;
type QueryVisibleEdge = {
  from: string;
  to: string;
  label: string;
  props: QueryPropertyBag;
};
type QueryResultNode = {
  id?: string;
  props?: QueryPropertyBag;
};
type QueryMaterializedGraph = {
  adjacency: unknown;
  stateHash: string | null;
};
type QueryAdjacencyEdge = {
  label: string;
  neighborId: string;
};

// ── Graph contract ──────────────────────────────────────────────────

/** Structural interface for the graph handle needed by the runner. */
export type QueryGraph = {
  _materializeGraph: () => Promise<QueryMaterializedGraph>;
  getNodes: () => Promise<string[]>;
  getNodeProps: (nodeId: string) => Promise<QueryPropertyBag | null>;
  getEdges: () => Promise<QueryVisibleEdge[]>;
};

// ── Adjacency types ─────────────────────────────────────────────────

type AdjacencyMaps = {
  outgoing: Map<string, QueryAdjacencyEdge[]>;
  incoming: Map<string, QueryAdjacencyEdge[]>;
};

type PropsFetcher = (nodeId: string) => Promise<QueryPropertyBag>;

// ── Result types ────────────────────────────────────────────────────

export type QueryResult = {
  stateHash: string;
  nodes: QueryResultNode[];
};

export type AggregateResult = {
  stateHash: string;
  count?: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
};

type AggregateAccumulator = {
  segments: string[];
  values: number[];
};

// ── Boundary validation ─────────────────────────────────────────────

function isAdjacencyMaps(adjacency: unknown): adjacency is AdjacencyMaps {
  if (adjacency === null || typeof adjacency !== 'object') {
    return false;
  }
  const maps = adjacency as AdjacencyMaps;
  return maps.outgoing instanceof Map && maps.incoming instanceof Map;
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

// ── Batch concurrency ───────────────────────────────────────────────

async function batchMap<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 100): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ── Freezing ────────────────────────────────────────────────────────

function isFreezable(obj: unknown): obj is object {
  return obj !== null && obj !== undefined && typeof obj === 'object' && !Object.isFrozen(obj);
}

function deepFreeze<T>(obj: T): T {
  if (!isFreezable(obj)) {
    return obj;
  }
  Object.freeze(obj);
  const children = Array.isArray(obj) ? obj : Object.values(obj);
  for (const child of children) {
    deepFreeze(child);
  }
  return obj;
}

// ── Cloning ─────────────────────────────────────────────────────────

// ── Snapshot construction ───────────────────────────────────────────

function sortIds(ids: Iterable<string>): string[] {
  return [...ids].sort();
}

function buildPropsSnapshot(propsRecord: QueryPropertyBag): QueryPropertyBag {
  const props: { [key: string]: SnapshotPropValue } = {};
  for (const key of Object.keys(propsRecord).sort()) {
    props[key] = propsRecord[key]!;
  }
  return deepFreeze(props);
}

function compareEdgeEntries(
  a: { label: string; [key: string]: unknown },
  b: { label: string; [key: string]: unknown },
  peerKey: string,
): number {
  if (a.label !== b.label) {
    return a.label < b.label ? -1 : 1;
  }
  const aPeer = a[peerKey] as string;
  const bPeer = b[peerKey] as string;
  return aPeer < bPeer ? -1 : aPeer > bPeer ? 1 : 0;
}

function buildEdgesSnapshot(
  edges: QueryAdjacencyEdge[],
  directionKey: 'to' | 'from',
): ReadonlyArray<QueryNodeEdgeSnapshot> {
  const list = edges.map((edge) => ({
    label: edge.label,
    [directionKey]: edge.neighborId,
  }));
  list.sort((a, b) => compareEdgeEntries(a, b, directionKey));
  return deepFreeze(list);
}

function createNodeSnapshot(params: {
  id: string;
  propsRecord: QueryPropertyBag;
  edgesOut: QueryAdjacencyEdge[];
  edgesIn: QueryAdjacencyEdge[];
}): Readonly<QueryNodeSnapshot> {
  return deepFreeze({
    id: params.id,
    props: buildPropsSnapshot(params.propsRecord),
    edgesOut: buildEdgesSnapshot(params.edgesOut, 'to'),
    edgesIn: buildEdgesSnapshot(params.edgesIn, 'from'),
  });
}

// ── Traversal ───────────────────────────────────────────────────────

function edgeSource(adjacency: AdjacencyMaps, direction: 'outgoing' | 'incoming'): Map<string, QueryAdjacencyEdge[]> {
  return direction === 'outgoing' ? adjacency.outgoing : adjacency.incoming;
}

function collectMatchingNeighbors(
  edges: QueryAdjacencyEdge[],
  labelFilter: string | null,
): string[] {
  if (labelFilter === null) {
    return edges.map((e) => e.neighborId);
  }
  return edges.filter((e) => e.label === labelFilter).map((e) => e.neighborId);
}

function applyHop(params: {
  direction: 'outgoing' | 'incoming';
  label: string | undefined;
  strand: string[];
  adjacency: AdjacencyMaps;
}): string[] {
  const source = edgeSource(params.adjacency, params.direction);
  const labelFilter = params.label ?? null;
  const next = new Set<string>();

  for (const nodeId of params.strand) {
    for (const id of collectMatchingNeighbors(source.get(nodeId) ?? [], labelFilter)) {
      next.add(id);
    }
  }
  return sortIds(next);
}

type BfsLevelParams = {
  currentLevel: Set<string>;
  visited: Set<string>;
  source: Map<string, QueryAdjacencyEdge[]>;
  labelFilter: string | null;
};

function expandBfsLevel(params: BfsLevelParams): Set<string> {
  const nextLevel = new Set<string>();
  for (const nodeId of params.currentLevel) {
    for (const id of collectMatchingNeighbors(params.source.get(nodeId) ?? [], params.labelFilter)) {
      if (!params.visited.has(id)) {
        params.visited.add(id);
        nextLevel.add(id);
      }
    }
  }
  return nextLevel;
}

function addAllTo(source: Set<string>, target: Set<string>): void {
  for (const id of source) { target.add(id); }
}

function runBfsLoop(params: {
  source: Map<string, QueryAdjacencyEdge[]>;
  labelFilter: string | null;
  strand: string[];
  depth: [number, number];
}): Set<string> {
  const [minDepth, maxDepth] = params.depth;
  const result = new Set<string>();
  const visited = new Set<string>(params.strand);
  let currentLevel = new Set<string>(params.strand);

  if (minDepth === 0) { addAllTo(currentLevel, result); }
  for (let hop = 1; hop <= maxDepth; hop++) {
    currentLevel = expandBfsLevel({ currentLevel, visited, source: params.source, labelFilter: params.labelFilter });
    if (hop >= minDepth) { addAllTo(currentLevel, result); }
    if (currentLevel.size === 0) { break; }
  }
  return result;
}

function applyMultiHop(params: {
  direction: 'outgoing' | 'incoming';
  label: string | undefined;
  strand: string[];
  adjacency: AdjacencyMaps;
  depth: [number, number];
}): string[] {
  const source = edgeSource(params.adjacency, params.direction);
  const result = runBfsLoop({
    source,
    labelFilter: params.label ?? null,
    strand: params.strand,
    depth: params.depth,
  });
  return sortIds(result);
}

// ── Pipeline operations ─────────────────────────────────────────────

type WhereOpParams = {
  strand: string[];
  predicate: (node: QueryNodeSnapshot) => boolean;
  adjacency: AdjacencyMaps;
  getProps: PropsFetcher;
};

async function applyWhereOp(params: WhereOpParams): Promise<string[]> {
  const { strand, predicate, adjacency, getProps } = params;
  const snapshots = await batchMap(strand, async (nodeId) => ({
    nodeId,
    snapshot: createNodeSnapshot({
      id: nodeId,
      propsRecord: await getProps(nodeId),
      edgesOut: adjacency.outgoing.get(nodeId) ?? [],
      edgesIn: adjacency.incoming.get(nodeId) ?? [],
    }),
  }));
  return sortIds(snapshots.filter(({ snapshot }) => predicate(snapshot)).map(({ nodeId }) => nodeId));
}

function applyTraversalOp(
  strand: string[],
  op: { type: 'outgoing' | 'incoming'; label?: string; depth: [number, number] },
  adjacency: AdjacencyMaps,
): string[] {
  const [minD, maxD] = op.depth;
  if (minD === 1 && maxD === 1) {
    return applyHop({ direction: op.type, label: op.label, strand, adjacency });
  }
  return applyMultiHop({ direction: op.type, label: op.label, strand, adjacency, depth: op.depth });
}

type PipelineParams = {
  strand: string[];
  operations: readonly QueryOperation[];
  adjacency: AdjacencyMaps;
  getProps: PropsFetcher;
};

async function applyOperations(params: PipelineParams): Promise<string[]> {
  const { operations, adjacency, getProps } = params;
  let current = params.strand;
  for (const op of operations) {
    if (op.type === 'where') {
      current = await applyWhereOp({ strand: current, predicate: op.fn, adjacency, getProps });
    } else {
      current = applyTraversalOp(current, op, adjacency);
    }
  }
  return current;
}

// ── Select + result building ────────────────────────────────────────

const ALLOWED_FIELDS = new Set(['id', 'props']);

function assertAllFieldsKnown(fields: string[]): void {
  for (const field of fields) {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new QueryError(`Unknown select field: ${field}`, {
        code: 'E_QUERY_SELECT_FIELD',
        context: { field },
      });
    }
  }
}

function validateSelectFields(select: readonly string[] | null): string[] | null {
  if (!Array.isArray(select) || select.length === 0) {
    return null;
  }
  const fields: string[] = [];
  for (const f of select) { fields.push(f); }
  assertAllFieldsKnown(fields);
  return fields;
}

async function buildResultNodes(
  strand: string[],
  selectFields: string[] | null,
  getProps: PropsFetcher,
): Promise<QueryResultNode[]> {
  const includeId = !selectFields || selectFields.includes('id');
  const includeProps = !selectFields || selectFields.includes('props');

  const nodes: QueryResultNode[] = await batchMap(strand, async (nodeId) => {
    const entry: QueryResultNode = {};
    if (includeId) { entry.id = nodeId; }
    if (includeProps) {
      const props = buildPropsSnapshot(await getProps(nodeId));
      if (selectFields !== null || Object.keys(props).length > 0) {
        entry.props = props;
      }
    }
    return entry;
  });
  return nodes;
}

// ── Aggregation ─────────────────────────────────────────────────────

function resolvePropertyPath(obj: Record<string, unknown>, segments: string[]): unknown {
  let value: unknown = obj[segments[0] as string];
  for (let i = 1; i < segments.length; i++) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segments[i] as string];
  }
  return value;
}

function computeSingleAggregate(key: string, values: number[]): number {
  if (values.length === 0) { return 0; }
  if (key === 'sum') { return values.reduce((a, b) => a + b, 0); }
  if (key === 'avg') { return values.reduce((a, b) => a + b, 0) / values.length; }
  if (key === 'min') { return Math.min(...values); }
  return Math.max(...values);
}

type AggregateParams = {
  strand: string[];
  stateHash: string;
  getProps: PropsFetcher;
  spec: AggregateSpec;
};

async function runAggregate(params: AggregateParams): Promise<AggregateResult> {
  const { strand, stateHash, getProps, spec } = params;
  const result: AggregateResult = { stateHash };
  const specRec = spec as Record<string, unknown>;

  if (spec.count === true) {
    result.count = strand.length;
  }

  const numericKeys = ['sum', 'avg', 'min', 'max'] as const;
  const activeAggs = numericKeys.filter((k) => specRec[k] !== undefined && specRec[k] !== null);
  if (activeAggs.length === 0) {
    return result;
  }

  return await computeNumericAggregates({ strand, getProps, activeAggs, specRec, result });
}

function buildAggMap(activeAggs: readonly string[], specRec: Record<string, unknown>): Map<string, AggregateAccumulator> {
  const aggMap = new Map<string, AggregateAccumulator>();
  for (const key of activeAggs) {
    aggMap.set(key, {
      segments: (specRec[key] as string).replace(/^props\./, '').split('.'),
      values: [],
    });
  }
  return aggMap;
}

function collectAggValues(propsList: Record<string, unknown>[], aggMap: Map<string, AggregateAccumulator>): void {
  for (const propsRecord of propsList) {
    for (const { segments, values } of aggMap.values()) {
      const value = resolvePropertyPath(propsRecord, segments);
      if (typeof value === 'number' && !Number.isNaN(value)) {
        values.push(value);
      }
    }
  }
}

async function computeNumericAggregates(params: {
  strand: string[];
  getProps: PropsFetcher;
  activeAggs: readonly string[];
  specRec: Record<string, unknown>;
  result: AggregateResult;
}): Promise<AggregateResult> {
  const aggMap = buildAggMap(params.activeAggs, params.specRec);
  const propsList = await batchMap(params.strand, params.getProps);
  collectAggValues(propsList, aggMap);

  for (const [key, { values }] of aggMap) {
    (params.result as Record<string, unknown>)[key] = computeSingleAggregate(key, values);
  }
  return params.result;
}

// ── Runner ──────────────────────────────────────────────────────────

const DEFAULT_PATTERN = '*';

function createPropsMemo(graph: QueryGraph): PropsFetcher {
  const memo = new Map<string, QueryPropertyBag>();
  return async (nodeId: string) => {
    const cached = memo.get(nodeId);
    if (cached !== undefined) { return cached; }
    const raw = await graph.getNodeProps(nodeId);
    const record = raw ?? {};
    memo.set(nodeId, record);
    return record;
  };
}

export default class QueryRunner {
  private readonly _graph: QueryGraph;

  constructor(graph: QueryGraph) {
    this._graph = graph;
  }

  async run(plan: QueryPlan): Promise<QueryResult | AggregateResult> {
    const materialized = await this._graph._materializeGraph();
    const adjacency = requireAdjacencyMaps(materialized.adjacency);
    const stateHash = requireStateHash(materialized.stateHash);
    const getProps = createPropsMemo(this._graph);

    const pattern = plan.pattern ?? DEFAULT_PATTERN;
    const allNodes = sortIds(await this._graph.getNodes());
    const matched = allNodes.filter((id) => matchGlob(pattern, id));
    const strand = await applyOperations({ strand: matched, operations: plan.operations, adjacency, getProps });

    if (plan.aggregate) {
      return await runAggregate({ strand, stateHash, getProps, spec: plan.aggregate });
    }

    const selectFields = validateSelectFields(plan.select);
    const nodes = await buildResultNodes(strand, selectFields, getProps);
    return { stateHash, nodes };
  }
}
