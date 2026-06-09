import MemoryBudget from '../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../src/domain/memory/WarpMemoryPool.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
} from '../../../src/domain/services/query/QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from '../../../src/domain/services/query/QueryPlan.ts';

const FIXTURE_NODE_COUNT = 6;
const FIXTURE_POOL_LIMIT = 2;
const FIXTURE_STATE_HASH = 'v18-large-graph-over-small-pool';

/** Canonical fixture whose graph cardinality exceeds its configured memory pool. */
export default class V18LargeGraphOverSmallPoolFixture {
  readonly nodeIds: readonly string[];
  readonly pool: WarpMemoryPool;

  constructor() {
    this.nodeIds = Object.freeze(createNodeIds(FIXTURE_NODE_COUNT));
    this.pool = new WarpMemoryPool({
      name: 'v18-large-graph-fixture',
      budget: MemoryBudget.entries(FIXTURE_POOL_LIMIT),
    });
    Object.freeze(this);
  }

  get nodeCount(): number {
    return this.nodeIds.length;
  }

  readModel(): QueryReadModel {
    return new FixtureQueryReadModel(this.nodeIds);
  }

  leaseWholeGraph(): void {
    this.pool.acquire({ scope: 'full-node-array', amount: this.nodeIds.length });
  }
}

class FixtureQueryReadModel implements QueryReadModel {
  readonly stateHash: string;
  private readonly _nodeIds: readonly string[];

  constructor(nodeIds: readonly string[]) {
    this.stateHash = FIXTURE_STATE_HASH;
    this._nodeIds = Object.freeze([...nodeIds]);
    Object.freeze(this);
  }

  async *nodes(_request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    for (const nodeId of this._nodeIds) {
      yield Object.freeze({
        id: nodeId,
        props: emptyProps(),
        edgesOut: Object.freeze([]),
        edgesIn: Object.freeze([]),
      });
    }
  }

  async *neighbors(
    _nodeId: string,
    _options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    const neighbors: QueryNeighborEntry[] = [];
    for (const neighbor of neighbors) {
      yield neighbor;
    }
  }

  async nodeProps(nodeId: string): Promise<QueryPropertyBag | null> {
    if (this._nodeIds.includes(nodeId)) {
      return emptyProps();
    }
    return null;
  }
}

function createNodeIds(count: number): string[] {
  const nodeIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    nodeIds.push(`v18:node:${index.toString().padStart(2, '0')}`);
  }
  return nodeIds;
}

function emptyProps(): QueryPropertyBag {
  return Object.freeze({});
}
