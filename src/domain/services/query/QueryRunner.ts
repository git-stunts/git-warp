/** QueryRunner — pure executor for QueryPlan instances. */

import QueryError from '../../errors/QueryError.ts';
import { matchGlob } from '../../utils/matchGlob.ts';
import type QueryPlan from './QueryPlan.ts';
import type { AggregateSpec, QueryNodeSnapshot, QueryNodeEdgeSnapshot, QueryOperation } from './QueryPlan.ts';
import ImmutableBytes from '../snapshot/ImmutableBytes.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';

type QueryPropertyBag = Readonly<{ [key: string]: SnapshotPropValue }>;
type MutableQueryPropertyBag = { [key: string]: SnapshotPropValue };
type SnapshotPropObject = { readonly [key: string]: SnapshotPropValue };
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
  adjacency: AdjacencyMaps;
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
  outgoing: ReadonlyMap<string, readonly QueryAdjacencyEdge[]>;
  incoming: ReadonlyMap<string, readonly QueryAdjacencyEdge[]>;
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
type NumericAggregateKey = 'sum' | 'avg' | 'min' | 'max';

// ── Boundary validation ─────────────────────────────────────────────

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

// ── Snapshot construction ───────────────────────────────────────────

function sortIds(ids: Iterable<string>): string[] {
  return [...ids].sort();
}

function buildPropsSnapshot(propsRecord: QueryPropertyBag): QueryPropertyBag {
  const props: MutableQueryPropertyBag = {};
  for (const key of Object.keys(propsRecord).sort()) {
    props[key] = propsRecord[key]!;
  }
  return Object.freeze(props);
}

function compareStrings(a: string, b: string): number {
  if (a < b) { return -1; }
  if (a > b) { return 1; }
  return 0;
}

function edgePeer(edge: QueryNodeEdgeSnapshot, peerKey: 'to' | 'from'): string {
  return peerKey === 'to' ? edge.to ?? '' : edge.from ?? '';
}

function compareEdgeEntries(
  a: QueryNodeEdgeSnapshot,
  b: QueryNodeEdgeSnapshot,
  peerKey: 'to' | 'from',
): number {
  const labelComparison = compareStrings(a.label, b.label);
  if (labelComparison !== 0) { return labelComparison; }
  return compareStrings(edgePeer(a, peerKey), edgePeer(b, peerKey));
}

function buildEdgesSnapshot(
  edges: readonly QueryAdjacencyEdge[],
  directionKey: 'to' | 'from',
): ReadonlyArray<QueryNodeEdgeSnapshot> {
  const list = edges.map((edge) => ({
    label: edge.label,
    [directionKey]: edge.neighborId,
  }));
  list.sort((a, b) => compareEdgeEntries(a, b, directionKey));
  for (const edge of list) {
    Object.freeze(edge);
  }
  return Object.freeze(list);
}

function createNodeSnapshot(params: {
  id: string;
  propsRecord: QueryPropertyBag;
  edgesOut: readonly QueryAdjacencyEdge[];
  edgesIn: readonly QueryAdjacencyEdge[];
}): Readonly<QueryNodeSnapshot> {
  return Object.freeze({
    id: params.id,
    props: buildPropsSnapshot(params.propsRecord),
    edgesOut: buildEdgesSnapshot(params.edgesOut, 'to'),
    edgesIn: buildEdgesSnapshot(params.edgesIn, 'from'),
  });
}

// ── Traversal ───────────────────────────────────────────────────────

function edgeSource(
  adjacency: AdjacencyMaps,
  direction: 'outgoing' | 'incoming',
): ReadonlyMap<string, readonly QueryAdjacencyEdge[]> {
  return direction === 'outgoing' ? adjacency.outgoing : adjacency.incoming;
}

function collectMatchingNeighbors(
  edges: readonly QueryAdjacencyEdge[],
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
  source: ReadonlyMap<string, readonly QueryAdjacencyEdge[]>;
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
  source: ReadonlyMap<string, readonly QueryAdjacencyEdge[]>;
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

function isSnapshotPropObject(value: SnapshotPropValue | undefined): value is SnapshotPropObject {
  return value !== undefined
    && value !== null
    && typeof value === 'object'
    && !(value instanceof ImmutableBytes)
    && !Array.isArray(value);
}

function resolvePropertyPath(obj: QueryPropertyBag, segments: string[]): SnapshotPropValue | undefined {
  let value = obj[segments[0] as string];
  for (let i = 1; i < segments.length; i++) {
    if (!isSnapshotPropObject(value)) {
      return undefined;
    }
    value = value[segments[i] as string];
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

const NUMERIC_AGGREGATE_KEYS: readonly NumericAggregateKey[] = ['sum', 'avg', 'min', 'max'];

function activeAggregateKeys(spec: AggregateSpec): NumericAggregateKey[] {
  return NUMERIC_AGGREGATE_KEYS.filter((key) => spec[key] !== undefined && spec[key] !== null);
}

async function runAggregate(params: AggregateParams): Promise<AggregateResult> {
  const { strand, stateHash, getProps, spec } = params;
  const result: AggregateResult = { stateHash };

  if (spec.count === true) {
    result.count = strand.length;
  }

  const activeAggs = activeAggregateKeys(spec);
  if (activeAggs.length === 0) {
    return result;
  }

  return await computeNumericAggregates({ strand, getProps, activeAggs, spec, result });
}

function buildAggMap(activeAggs: readonly NumericAggregateKey[], spec: AggregateSpec): Map<NumericAggregateKey, AggregateAccumulator> {
  const aggMap = new Map<NumericAggregateKey, AggregateAccumulator>();
  for (const key of activeAggs) {
    const path = spec[key];
    if (path === undefined) {
      continue;
    }
    aggMap.set(key, {
      segments: path.replace(/^props\./, '').split('.'),
      values: [],
    });
  }
  return aggMap;
}

function collectAggValues(propsList: QueryPropertyBag[], aggMap: Map<NumericAggregateKey, AggregateAccumulator>): void {
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
  activeAggs: readonly NumericAggregateKey[];
  spec: AggregateSpec;
  result: AggregateResult;
}): Promise<AggregateResult> {
  const aggMap = buildAggMap(params.activeAggs, params.spec);
  const propsList = await batchMap(params.strand, params.getProps);
  collectAggValues(propsList, aggMap);

  for (const [key, { values }] of aggMap) {
    params.result[key] = computeSingleAggregate(key, values);
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
    const { adjacency } = materialized;
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
