/** QueryRunner - pure executor for QueryPlan instances. */

import QueryError from '../../errors/QueryError.ts';
import type QueryPlan from './QueryPlan.ts';
import type {
  QueryNodeEdgeSnapshot,
  QueryNodeSnapshot,
  QueryOperation,
} from './QueryPlan.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import { runAggregate, type AggregateResult } from './QueryAggregation.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
  QueryReadModelProvider,
} from './QueryReadModelProvider.ts';

type MutableQueryPropertyBag = { [key: string]: SnapshotPropValue };
type QueryResultNode = {
  id?: string;
  props?: QueryPropertyBag;
};
type PropsFetcher = (nodeId: string) => Promise<QueryPropertyBag>;

// ── Result types ────────────────────────────────────────────────────

export type QueryResult = {
  stateHash: string;
  nodes: QueryResultNode[];
};

// ── Batch concurrency ───────────────────────────────────────────────

async function batchMap<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  limit = 100,
): Promise<R[]> {
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
    const value = propsRecord[key];
    if (value !== undefined) {
      props[key] = value;
    }
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

async function collectNodeEdges(
  readModel: QueryReadModel,
  nodeId: string,
  direction: 'outgoing' | 'incoming',
): Promise<ReadonlyArray<QueryNodeEdgeSnapshot>> {
  const peerKey = direction === 'outgoing' ? 'to' : 'from';
  const list: QueryNodeEdgeSnapshot[] = [];
  for await (const edge of readModel.neighbors(nodeId, { direction })) {
    list.push(
      Object.freeze(
        peerKey === 'to'
          ? { label: edge.label, to: edge.nodeId }
          : { label: edge.label, from: edge.nodeId },
      ),
    );
  }
  list.sort((a, b) => compareEdgeEntries(a, b, peerKey));
  return Object.freeze(list);
}

async function createNodeSnapshot(
  readModel: QueryReadModel,
  nodeId: string,
): Promise<Readonly<QueryNodeSnapshot>> {
  const [propsRecord, edgesOut, edgesIn] = await Promise.all([
    readModel.nodeProps(nodeId),
    collectNodeEdges(readModel, nodeId, 'outgoing'),
    collectNodeEdges(readModel, nodeId, 'incoming'),
  ]);
  return Object.freeze({
    id: nodeId,
    props: buildPropsSnapshot(propsRecord ?? {}),
    edgesOut,
    edgesIn,
  });
}

// ── Traversal ───────────────────────────────────────────────────────

async function collectMatchingNeighbors(
  readModel: QueryReadModel,
  nodeId: string,
  options: QueryNeighborOptions,
): Promise<string[]> {
  const result: string[] = [];
  for await (const entry of readModel.neighbors(nodeId, options)) {
    const neighbor: QueryNeighborEntry = entry;
    result.push(neighbor.nodeId);
  }
  return result;
}

async function applyHop(params: {
  direction: 'outgoing' | 'incoming';
  label: string | undefined;
  strand: readonly string[];
  readModel: QueryReadModel;
}): Promise<string[]> {
  const next = new Set<string>();

  for (const nodeId of params.strand) {
    const options: QueryNeighborOptions = {
      direction: params.direction,
      ...(params.label !== undefined ? { label: params.label } : {}),
    };
    for (const id of await collectMatchingNeighbors(params.readModel, nodeId, options)) {
      next.add(id);
    }
  }
  return sortIds(next);
}

type BfsLevelParams = {
  currentLevel: Set<string>;
  visited: Set<string>;
  readModel: QueryReadModel;
  options: QueryNeighborOptions;
};

async function expandBfsLevel(params: BfsLevelParams): Promise<Set<string>> {
  const nextLevel = new Set<string>();
  for (const nodeId of params.currentLevel) {
    const neighbors = await collectMatchingNeighbors(
      params.readModel,
      nodeId,
      params.options,
    );
    for (const id of neighbors) {
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

async function runBfsLoop(params: {
  readModel: QueryReadModel;
  options: QueryNeighborOptions;
  strand: readonly string[];
  depth: [number, number];
}): Promise<Set<string>> {
  const [minDepth, maxDepth] = params.depth;
  const result = new Set<string>();
  const visited = new Set<string>(params.strand);
  let currentLevel = new Set<string>(params.strand);

  if (minDepth === 0) { addAllTo(currentLevel, result); }
  for (let hop = 1; hop <= maxDepth; hop++) {
    currentLevel = await expandBfsLevel({
      currentLevel,
      visited,
      readModel: params.readModel,
      options: params.options,
    });
    if (hop >= minDepth) { addAllTo(currentLevel, result); }
    if (currentLevel.size === 0) { break; }
  }
  return result;
}

async function applyMultiHop(params: {
  direction: 'outgoing' | 'incoming';
  label: string | undefined;
  strand: readonly string[];
  readModel: QueryReadModel;
  depth: [number, number];
}): Promise<string[]> {
  const options: QueryNeighborOptions = {
    direction: params.direction,
    ...(params.label !== undefined ? { label: params.label } : {}),
  };
  const result = await runBfsLoop({
    readModel: params.readModel,
    options,
    strand: params.strand,
    depth: params.depth,
  });
  return sortIds(result);
}

// ── Pipeline operations ─────────────────────────────────────────────

type WhereOpParams = {
  strand: readonly string[];
  predicate: (node: QueryNodeSnapshot) => boolean;
  readModel: QueryReadModel;
};

async function applyWhereOp(params: WhereOpParams): Promise<string[]> {
  const { strand, predicate, readModel } = params;
  const snapshots = await batchMap(strand, async (nodeId) => ({
    nodeId,
    snapshot: await createNodeSnapshot(readModel, nodeId),
  }));
  return sortIds(
    snapshots
      .filter(({ snapshot }) => predicate(snapshot))
      .map(({ nodeId }) => nodeId),
  );
}

async function applyTraversalOp(
  strand: readonly string[],
  op: { type: 'outgoing' | 'incoming'; label?: string; depth: [number, number] },
  readModel: QueryReadModel,
): Promise<string[]> {
  const [minD, maxD] = op.depth;
  if (minD === 1 && maxD === 1) {
    return await applyHop({
      direction: op.type,
      label: op.label,
      strand,
      readModel,
    });
  }
  return await applyMultiHop({
    direction: op.type,
    label: op.label,
    strand,
    readModel,
    depth: op.depth,
  });
}

type PipelineParams = {
  strand: string[];
  operations: readonly QueryOperation[];
  readModel: QueryReadModel;
};

async function applyOperations(params: PipelineParams): Promise<string[]> {
  const { operations, readModel } = params;
  let current = params.strand;
  for (const op of operations) {
    if (op.type === 'where') {
      current = await applyWhereOp({
        strand: current,
        predicate: op.fn,
        readModel,
      });
    } else {
      current = await applyTraversalOp(current, op, readModel);
    }
  }
  return current;
}

// ── Select + result building ────────────────────────────────────────

const ALLOWED_FIELDS = new Set(['id', 'props']);

function assertAllFieldsKnown(fields: readonly string[]): void {
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
  if (select === null || select.length === 0) {
    return null;
  }
  const fields = select.slice();
  assertAllFieldsKnown(fields);
  return fields;
}

async function buildResultNodes(
  strand: readonly string[],
  selectFields: readonly string[] | null,
  getProps: PropsFetcher,
): Promise<QueryResultNode[]> {
  const includeId = !selectFields || selectFields.includes('id');
  const includeProps = !selectFields || selectFields.includes('props');

  return await batchMap(strand, async (nodeId) => {
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
}

// ── Runner ──────────────────────────────────────────────────────────

const DEFAULT_PATTERN = '*';

function createPropsMemo(readModel: QueryReadModel): PropsFetcher {
  const memo = new Map<string, QueryPropertyBag>();
  return async (nodeId: string) => {
    const cached = memo.get(nodeId);
    if (cached !== undefined) { return cached; }
    const raw = await readModel.nodeProps(nodeId);
    const record = raw ?? {};
    memo.set(nodeId, record);
    return record;
  };
}

function isSingleExactPattern(pattern: string | readonly string[]): boolean {
  return typeof pattern === 'string' && !pattern.includes('*');
}

async function collectInitialStrand(
  readModel: QueryReadModel,
  request: QueryNodeStreamRequest,
): Promise<string[]> {
  const strand: string[] = [];
  const nodes: AsyncIterable<QueryNodeSnapshot> = readModel.nodes(request);
  for await (const node of nodes) {
    strand.push(node.id);
    if (isSingleExactPattern(request.pattern)) {
      break;
    }
  }
  return sortIds(strand);
}

export default class QueryRunner {
  readonly #provider: QueryReadModelProvider;

  constructor(provider: QueryReadModelProvider) {
    this.#provider = provider;
  }

  async run(plan: QueryPlan): Promise<QueryResult | AggregateResult> {
    const readModel = await this.#provider.openQueryReadModel();
    const getProps = createPropsMemo(readModel);
    const selectFields = validateSelectFields(plan.select);
    const request: QueryNodeStreamRequest = {
      pattern: plan.pattern ?? DEFAULT_PATTERN,
      select: plan.select,
    };
    const matched = await collectInitialStrand(readModel, request);
    const strand = await applyOperations({
      strand: matched,
      operations: plan.operations,
      readModel,
    });

    if (plan.aggregate) {
      return await runAggregate({
        strand,
        stateHash: readModel.stateHash,
        getProps,
        spec: plan.aggregate,
      });
    }

    const nodes = await buildResultNodes(strand, selectFields, getProps);
    return { stateHash: readModel.stateHash, nodes };
  }
}
