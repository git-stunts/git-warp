# Slay QueryBuilder (904 LOC)

## Current shape

Fluent DSL class. Builder methods accumulate query state. `run()`
executes: materializes, filters, aggregates, sorts, returns results.
Already partially cleaned during Worldline migration (typed
`QueryGraph` interface, boundary validators).

## Split: 2 files + 1 value object

### `QueryPlan.ts` (~40 LOC)

Frozen value object — the handoff between builder and runner.

```typescript
class QueryPlan {
  readonly match: string;
  readonly where: WhereClause[];
  readonly select: SelectField[];
  readonly direction: 'outgoing' | 'incoming' | null;
  readonly depth: number | null;
  readonly aggregates: AggregateSpec | null;
  readonly sort: SortSpec | null;
  readonly limit: number | null;
  readonly offset: number | null;
  readonly distinct: boolean;

  constructor(params: { ... }) { Object.freeze(this); }
}
```

### `QueryRunner.ts` (~400 LOC)

Pure executor. Takes a plan + graph handle, returns results.

```typescript
class QueryRunner {
  constructor(private readonly graph: QueryGraph) {}

  async run(plan: QueryPlan): Promise<QueryResult> {
    const materialized = await this.graph._materializeGraph();
    const adjacency = requireAdjacencyMaps(materialized.adjacency);
    const stateHash = requireStateHash(materialized.stateHash);
    const allNodes = sortIds(await this.graph.getNodes());

    // Filter → select → aggregate → sort → limit → return
    ...
  }
}

class QueryResult {
  readonly nodes: QueryResultNode[];
  readonly stats: { stateHash: string; nodeCount: number; matchedCount: number };

  constructor(params: { ... }) { Object.freeze(this); }
}
```

### `QueryBuilder.ts` (~350 LOC)

Pure accumulator. Builds a `QueryPlan`, delegates `run()` to runner.

```typescript
class QueryBuilder {
  constructor(private readonly graph: QueryGraph) {}

  match(pattern: string): QueryBuilder { ... return this; }
  where(clause: WhereClause): QueryBuilder { ... return this; }
  select(...fields: SelectField[]): QueryBuilder { ... return this; }
  outgoing(): QueryBuilder { ... return this; }
  incoming(): QueryBuilder { ... return this; }
  depth(n: number): QueryBuilder { ... return this; }
  aggregate(spec: AggregateSpec): QueryBuilder { ... return this; }
  sort(spec: SortSpec): QueryBuilder { ... return this; }
  limit(n: number): QueryBuilder { ... return this; }
  offset(n: number): QueryBuilder { ... return this; }
  distinct(): QueryBuilder { ... return this; }

  async run(): Promise<QueryResult> {
    const plan = new QueryPlan({ ... accumulated state ... });
    const runner = new QueryRunner(this.graph);
    return await runner.run(plan);
  }
}
```

## Named types

```typescript
type WhereClause = {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  value: unknown;
};

type SelectField = 'id' | 'props' | 'edges' | 'neighbors' | string;

type AggregateSpec = {
  count?: boolean;
  sum?: string;
  avg?: string;
  min?: string;
  max?: string;
};

type SortSpec = {
  field: string;
  direction: 'asc' | 'desc';
};
```

## Data flow

```
Consumer: graph.query.query().match('user:*').where(...).select('id', 'props').limit(10).run()
  → QueryBuilder accumulates state
  → .run() creates QueryPlan (frozen value object)
  → QueryRunner.run(plan)
    → materializes graph via QueryGraph interface
    → filters nodes by match pattern
    → applies where clauses
    → selects fields
    → aggregates if requested
    → sorts
    → applies limit/offset
    → returns QueryResult (frozen)
```

## Test files

- `test/unit/domain/services/query/QueryBuilder.test.js`
- `test/unit/domain/services/query/QueryBuilder.*.test.js`

## Execution order

1. Create `QueryPlan.ts` value object
2. Create `QueryResult.ts` value object
3. Create `QueryRunner.ts` — move execution logic from QueryBuilder.run()
4. Slim `QueryBuilder.ts` to pure accumulator + delegation
