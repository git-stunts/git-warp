---
id: GOD_query-controller
blocks:
  - API_migrate-consumers-to-capabilities
blocked_by:
  - API_capability-interfaces
feature: materialization-query-index
---

# Slay QueryController (951 LOC)

## Current shape

12-line class body + 30 free functions wired via `defineProperty`.
The class is a bag. The free functions use `this._host._xxx` to
reach into WarpRuntime internals.

## Split: 3 files

### `QueryReads.ts` (~250 LOC)

Graph read methods. Injected deps, no host bag.

```typescript
class QueryReads {
  constructor(
    private readonly state: MaterializedStateProvider,
    private readonly index: IndexProvider | null,
  ) {}

  hasNode(nodeId: string): boolean
  getNodes(): string[]
  getNodeProps(nodeId: string): Record<string, unknown> | null
  getEdgeProps(from: string, to: string, label: string): Record<string, unknown> | null
  getEdges(): Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>
  getPropertyCount(): number
  neighbors(nodeId: string, direction: Direction, edgeLabel?: string): NeighborResult[]
  getStateSnapshot(): ImmutableWarpState
}

interface MaterializedStateProvider {
  current(): WarpState | null;
  stateHash(): string | null;
}

interface IndexProvider {
  neighborsOf(nodeId: string, direction: Direction, opts?: { labels?: Set<string> }): NeighborResult[];
}
```

### `QueryContent.ts` (~300 LOC)

Two content accessor classes. Injected deps: state + blob storage.

```typescript
class NodeContent {
  constructor(
    private readonly nodeId: string,
    private readonly state: MaterializedStateProvider,
    private readonly blobs: BlobStoragePort,
  ) {}

  oid(): string | null
  meta(): { mime: string | null; size: number | null } | null
  async bytes(): Promise<Uint8Array | null>
  stream(): AsyncIterable<Uint8Array> | null
}

class EdgeContent {
  constructor(
    private readonly from: string,
    private readonly to: string,
    private readonly label: string,
    private readonly state: MaterializedStateProvider,
    private readonly blobs: BlobStoragePort,
  ) {}

  oid(): string | null
  meta(): { mime: string | null; size: number | null } | null
  async bytes(): Promise<Uint8Array | null>
  stream(): AsyncIterable<Uint8Array> | null
}
```

### `QueryController.ts` (~350 LOC)

Implements `QueryCapability`. Composes reads + content. Owns factory
methods and observer logic. Real methods, no defineProperty.

```typescript
class QueryController implements QueryCapability {
  constructor(
    private readonly state: MaterializedStateProvider,
    private readonly index: IndexProvider | null,
    private readonly blobs: BlobStoragePort,
    private readonly graphCloner: DetachedGraphFactory,
  ) {
    this._reads = new QueryReads(state, index);
  }

  // Delegates to QueryReads
  hasNode(nodeId: string): boolean { return this._reads.hasNode(nodeId); }
  getNodes(): string[] { return this._reads.getNodes(); }
  // ... etc for all read methods

  // Content accessor factories
  nodeContent(nodeId: string): NodeContent {
    return new NodeContent(nodeId, this.state, this.blobs);
  }
  edgeContent(from: string, to: string, label: string): EdgeContent {
    return new EdgeContent(from, to, label, this.state, this.blobs);
  }

  // Query/traversal factories
  query(): QueryBuilder { return new QueryBuilder(this); }
  worldline(options?: WorldlineOptions): Worldline { ... }
  observer(config: ObserverConfig): Promise<Observer> { ... }

  translationCost(a: ObserverConfig, b: ObserverConfig): Promise<number> { ... }
}
```

## Data flow

```
Consumer calls graph.query.hasNode('x')
  → QueryController.hasNode('x')
    → QueryReads.hasNode('x')
      → this.state.current().nodeAlive.contains('x')
      → returns boolean

Consumer calls graph.query.nodeContent('x').bytes()
  → QueryController.nodeContent('x')
    → new NodeContent('x', state, blobs)
  → NodeContent.bytes()
    → reads oid from state registers
    → fetches from BlobStoragePort
    → returns Uint8Array
```

## Observer overload cleanup

Old: `observer(nameOrConfig, configOrOptions, maybeOptions)` — 3 args,
positional overloads, boolean trap.

New: single shape:
```typescript
observer(config: ObserverConfig): Promise<Observer>
```

Where `ObserverConfig` is:
```typescript
type ObserverConfig = {
  name?: string;
  match: string;
  source?: WorldlineSource;
};
```

## Test files

- `test/unit/domain/services/controllers/QueryController.test.js` (if exists)
- All WarpGraph tests that call hasNode, getNodes, query, etc.

Tests that call `graph.hasNode()` will eventually migrate to
`graph.query.hasNode()` — but that's the API migration item, not this
item.

## Execution order

1. Define `MaterializedStateProvider` + `IndexProvider` interfaces
2. Create `QueryContent.ts` with `NodeContent` / `EdgeContent`
3. Create `QueryReads.ts` with all read methods
4. Rewrite `QueryController.ts` as capability implementation
5. Delete all defineProperty wiring
