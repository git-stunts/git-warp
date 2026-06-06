import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import QueryPlan from '../../src/domain/services/query/QueryPlan.ts';
import QueryRunner from '../../src/domain/services/query/QueryRunner.ts';
import type { QueryNodeSnapshot } from '../../src/domain/services/query/QueryPlan.ts';
import type { SnapshotPropValue } from '../../src/domain/services/snapshot/SnapshotPropValue.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const QUERY_RUNNER_PATH = 'src/domain/services/query/QueryRunner.ts';
const QUERY_BUILDER_PATH = 'src/domain/services/query/QueryBuilder.ts';
const QUERY_CONTROLLER_PATH = 'src/domain/services/controllers/QueryController.ts';
const OBSERVER_PATH = 'src/domain/services/query/Observer.ts';
const RUNTIME_HOST_PATH = 'src/domain/RuntimeHost.ts';
const DESIGN_PATH = 'docs/design/0105-runtimehost-query-materialization-port-seam.md';
const FULL_GRAPH_QUERY_MODEL_PATTERNS = [
  /\bQueryMaterializedGraph\b/u,
  /\badjacency\s*:\s*AdjacencyMaps\b/u,
  /\bfullAdjacency\b/u,
  /\bgetEdges\s*\(\s*\)\s*:\s*Promise\s*</u,
  /\bgetNodes\s*\(\s*\)\s*:\s*Promise\s*<\s*(?:readonly\s+)?string\[\]\s*>/u,
  /\bmaterializeForQuery\b/u,
  /\bPromise\s*<\s*QueryMaterializedGraph\s*>/u,
];

type QueryPropertyBag = Readonly<{ [key: string]: SnapshotPropValue }>;
type QueryNodeStreamRequest = {
  readonly pattern: string | readonly string[];
  readonly select: readonly string[] | null;
};
type QueryNeighborOptions = {
  readonly label?: string;
  readonly direction: 'outgoing' | 'incoming';
};
type QueryNeighborEntry = {
  readonly nodeId: string;
  readonly label: string;
};

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

class LazyQueryReadModelProvider {
  nodesPulled = 0;
  nodePropsCalls = 0;

  async openQueryReadModel(): Promise<LazyQueryReadModel> {
    return new LazyQueryReadModel(this);
  }

  async _materializeGraph(): Promise<never> {
    throw new Error('full materialization is not allowed for query read model RED');
  }

  async getNodes(): Promise<string[]> {
    throw new Error('full node list is not allowed for bounded query RED');
  }

  async getNodeProps(_nodeId: string): Promise<QueryPropertyBag | null> {
    this.nodePropsCalls += 1;
    throw new Error('id-only bounded query should not read node props');
  }

  async getEdges(): Promise<never[]> {
    throw new Error('full edge list is not allowed for query read model RED');
  }
}

class LazyQueryReadModel {
  readonly stateHash = 'lazy-state-hash';

  constructor(private readonly provider: LazyQueryReadModelProvider) {}

  async *nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    expect(request.pattern).toBe('node:target');
    expect(request.select).toEqual(['id']);
    this.provider.nodesPulled += 1;
    yield Object.freeze({
      id: 'node:target',
      props: Object.freeze({}),
      edgesOut: Object.freeze([]),
      edgesIn: Object.freeze([]),
    });
    this.provider.nodesPulled += 1;
    throw new Error('bounded exact-match query drained beyond first matching node');
  }

  neighbors(
    _nodeId: string,
    _options?: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    throw new Error('id-only bounded query should not traverse neighbors');
  }

  async nodeProps(_nodeId: string): Promise<QueryPropertyBag | null> {
    this.provider.nodePropsCalls += 1;
    throw new Error('id-only bounded query should not read node props');
  }
}

describe('query read model seam', () => {
  it('keeps RED scoped to QueryRunner and does not ban internal materialization elsewhere', () => {
    const queryRunnerSource = readRepoFile(QUERY_RUNNER_PATH);
    const runtimeHostSource = readRepoFile(RUNTIME_HOST_PATH);

    expect(queryRunnerSource).not.toContain('_materializeGraph');

    // This RED is scoped to QueryRunner. RuntimeHost may keep its internal
    // materialization seam until a separate cycle owns that extraction.
    expect(runtimeHostSource).toContain('_materializeGraph');
  });

  it('requires QueryRunner to depend on a query read model provider, not a graph-shaped host', () => {
    const queryRunnerSource = readRepoFile(QUERY_RUNNER_PATH);

    expect(queryRunnerSource).toContain('QueryReadModelProvider');
    expect(queryRunnerSource).toContain('openQueryReadModel');
    expect(queryRunnerSource).toContain('QueryReadModel');
    expect(queryRunnerSource).toContain('AsyncIterable');
    expect(queryRunnerSource).not.toMatch(/export\s+type\s+QueryGraph\s*=/u);
    expect(queryRunnerSource).not.toMatch(/\bgetEdges\s*:/u);
    expect(queryRunnerSource).not.toMatch(/\bRuntimeHost\b/u);
  });

  it('rejects full-graph-shaped query read models', () => {
    const queryRunnerSource = readRepoFile(QUERY_RUNNER_PATH);
    const queryBuilderSource = readRepoFile(QUERY_BUILDER_PATH);
    const observerSource = readRepoFile(OBSERVER_PATH);
    const queryControllerSource = readRepoFile(QUERY_CONTROLLER_PATH);
    const queryModelConstructionSource = [
      queryRunnerSource,
      queryBuilderSource,
      queryControllerSource,
    ].join('\n');

    for (const pattern of FULL_GRAPH_QUERY_MODEL_PATTERNS) {
      expect(queryModelConstructionSource).not.toMatch(pattern);
    }

    expect(observerSource).toContain('QueryReadModelProvider');
    expect(observerSource).toContain('openQueryReadModel');
  });

  it('requires a streaming or cursor-shaped query read model contract', () => {
    const queryRunnerSource = readRepoFile(QUERY_RUNNER_PATH);
    const observerSource = readRepoFile(OBSERVER_PATH);
    const querySeamSource = `${queryRunnerSource}\n${observerSource}`;

    expect(querySeamSource).toContain('AsyncIterable');
    expect(querySeamSource).toMatch(/\bnodes\s*\(/u);
    expect(querySeamSource).toMatch(/\bneighbors\s*\(/u);
    expect(querySeamSource).toMatch(/\bnodeProps\s*\(/u);
    expect(querySeamSource).toMatch(/\bQueryNodeStreamRequest\b/u);
    expect(querySeamSource).toMatch(/\bQueryNeighborOptions\b/u);
    expect(querySeamSource).toMatch(/\bQueryNeighborEntry\b/u);
  });

  it('requires bounded QueryRunner consumption of a lazy read model', async () => {
    const provider = new LazyQueryReadModelProvider();
    const runner = new QueryRunner(provider);
    const plan = new QueryPlan({
      pattern: 'node:target',
      operations: [],
      select: ['id'],
      aggregate: null,
    });

    const result = await runner.run(plan);

    expect('nodes' in result).toBe(true);
    if ('nodes' in result) {
      expect(result).toEqual({
        stateHash: 'lazy-state-hash',
        nodes: [{ id: 'node:target' }],
      });
    }
    expect(provider.nodesPulled).toBe(1);
    expect(provider.nodePropsCalls).toBe(0);
  });

  it('requires QueryBuilder construction to receive the narrow provider dependency', () => {
    const queryBuilderSource = readRepoFile(QUERY_BUILDER_PATH);

    expect(queryBuilderSource).toContain('QueryReadModelProvider');
    expect(queryBuilderSource).not.toContain('QueryGraph');
    expect(queryBuilderSource).not.toMatch(/constructor\s*\(\s*graph\s*:\s*QueryGraph\s*\)/u);
    expect(queryBuilderSource).not.toMatch(/new\s+QueryRunner\s*\(\s*this\._graph\s*\)/u);
  });

  it('requires graph-level query sugar to avoid passing the broad host directly', () => {
    const queryControllerSource = readRepoFile(QUERY_CONTROLLER_PATH);

    expect(queryControllerSource).not.toMatch(/new\s+QueryBuilder\s*\(\s*host\s*\(\s*this\s*\)\s*\)/u);
    expect(queryControllerSource).toContain('QueryReadModelProvider');
  });

  it('requires Observer to provide query read-model perspective without becoming the runner dependency', () => {
    const observerSource = readRepoFile(OBSERVER_PATH);

    expect(observerSource).toContain('QueryReadModelProvider');
    expect(observerSource).toContain('openQueryReadModel');
    expect(observerSource).not.toMatch(/new\s+QueryBuilder\s*\(\s*this\s*\)/u);
  });

  it('keeps the PULL decision centered on observer/read perspective and public query API stability', () => {
    const designSource = readRepoFile(DESIGN_PATH);

    expect(designSource).toContain('Observer/read perspective');
    expect(designSource).toContain('graph.query() is sugar');
    expect(designSource).toContain('QueryReadModelProvider');
    expect(designSource).toContain('QueryReadModel');
    expect(designSource).toContain('AsyncIterable');
    expect(designSource).toContain('holographic');
    expect(designSource).toContain('No full graph materialization assumption');
    expect(designSource).toContain('QueryCapability.query(): QueryBuilder');
    expect(designSource).toContain('Observer.query()');
    expect(designSource).toContain('Worldline.query()');
  });

  it('rejects god-seam names for this query read-model boundary', () => {
    const querySources = [
      readRepoFile(QUERY_RUNNER_PATH),
      readRepoFile(QUERY_BUILDER_PATH),
      readRepoFile(QUERY_CONTROLLER_PATH),
      readRepoFile(OBSERVER_PATH),
    ].join('\n');

    expect(querySources).not.toMatch(/\bRuntimePort\b/u);
    expect(querySources).not.toMatch(/\bRuntimeFacade\b/u);
    expect(querySources).not.toMatch(/\bGraphPort\b/u);
    expect(querySources).not.toMatch(/\bQueryRuntimeManager\b/u);
    expect(querySources).not.toMatch(/\bMaterializationHelper\b/u);
  });
});
