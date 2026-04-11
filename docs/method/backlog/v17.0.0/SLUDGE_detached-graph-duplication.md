---
id: SLUDGE_detached-graph-duplication
blocks: []
blocked_by:
  - CROSS_shared-provider-interfaces
---

# Deduplicate openDetachedReadGraph / openDetachedObserverGraph

## The sludge

`openDetachedReadGraph` appears in MaterializeController AND in
Worldline.ts. `openDetachedObserverGraph` appears in QueryController.
Both do the same thing: clone a graph instance for isolated reads.
Three copies of the same logic, each with slightly different field
access patterns.

## The fix

One function, one file. `src/domain/services/DetachedGraphFactory.ts`.
Takes typed dependencies (persistence, ports, config) and returns a
read-only graph handle. All three consumers import from here.

When the capability API lands, "detached read graph" becomes
`openWarpGraph()` with the same persistence and
`autoMaterialize: false`. The factory function dissolves.

## Concrete interface

```typescript
interface DetachedGraphFactory {
  openReadOnly(): Promise<WarpGraph>;
}
```

Adapter implementation:

```typescript
class WarpGraphDetachedFactory implements DetachedGraphFactory {
  constructor(
    private readonly persistence: GraphPersistencePort,
    private readonly ports: {
      clock: ClockPort;
      crypto: CryptoPort;
      codec: CodecPort;
    },
    private readonly config: {
      graphName: string;
      writerId: string;
      gcPolicy: GCPolicy;
    },
  ) {}

  async openReadOnly(): Promise<WarpGraph> {
    // Constructs a frozen, read-only WarpGraph capability object.
    // No mutation methods, no write refs, no materialization side effects.
  }
}
```
