# Roadmap & Future Directions

EmptyGraph is an evolving experiment. Here is what is on the horizon.

## Phase 1: Performance & Scalability (In Progress)

### Incremental Indexing (SPEC-0001)
Currently, `rebuildIndex` scans the entire history. For repositories with 10M+ nodes, this is inefficient. We are moving to a model where we only scan the "Delta" since the last index build and merge it into the existing binary shards.

### Binary Shards (CBOR)
Replacing JSON shards with CBOR (Concise Binary Object Representation) to reduce index size on disk by ~40% and improve load times via zero-copy deserialization.

## Phase 2: Query Capabilities

### Pipes & Filters (SPEC-0003)
A streaming query API that allows developers to chain operations:
```javascript
graph.query()
  .from('HEAD')
  .filter(node => node.type === 'OrderPlaced')
  .map(node => node.amount)
  .reduce((sum, val) => sum + val, 0);
```

### Logical Transaction Batching (ADR-005)
Ensuring that a sequence of `createNode` calls are treated as a single "Logical Transaction" that succeeds or fails as a unit, utilizing Git's atomic reference updates.

## Phase 3: Developer Experience

### VitePress Documentation
A complete overhaul of the documentation to provide a first-class learning experience (You are here!).

### Browser Support
Exploring a WASM-based Git plumbing layer to allow EmptyGraph to run directly in the browser using the Origin Private File System (OPFS).
