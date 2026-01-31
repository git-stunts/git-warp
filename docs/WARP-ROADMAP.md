# EmptyGraph WARP Roadmap

> From single-writer event log to multi-writer confluent graph database

## Current State: v3.0.0

Summary of what we have:
- Managed mode with automatic durability (anchor commits)
- Fast-forward optimization for linear history
- Octopus anchoring for batch imports
- Bitmap indexes for O(1) traversal
- Single-writer model
- Payloads in commit messages (JSON)

## Target: v4.0.0 — Multi-Writer Deterministic Fold

### Goals
- Multiple writers can append independently
- Deterministic merge (same patches → same state)
- Payloads move from commit message to tree blobs
- Trailer-based commit metadata
- Checkpoints for fast state recovery

### Phase 1: Plumbing (Foundation)

#### 1.1 Ref Layout
- `refs/empty-graph/<graph>/writers/<writer_id>` — per-writer patch chain
- `refs/empty-graph/<graph>/checkpoints/head` — latest checkpoint
- `refs/empty-graph/<graph>/coverage` — anchor covering all writers (reuses v3 anchor logic)

#### 1.2 Trailer Codec Integration
- Integrate @git-stunts/trailer-codec
- Define patch commit format:
  ```
  empty-graph:patch

  eg-kind: patch
  eg-graph: <graph_name>
  eg-writer: <writer_id>
  eg-lamport: <monotonic_counter>
  eg-patch-oid: <blob_oid>
  eg-schema: 1
  ```

#### 1.3 Tree-Based Payloads
- Add `commitNodeWithTree(treeOid, parents, message)` to GitGraphAdapter
- Patch data stored as `patch.cbor` blob in commit tree
- Commit message becomes lightweight header (trailers only)

#### 1.4 CBOR Encoding
- Add cbor dependency
- Define PatchV1 schema:
  ```
  PatchV1 {
    schema: 1,
    writer: string,
    lamport: u64,
    ops: [OpV1],
    base_checkpoint?: Oid
  }
  ```

### Phase 2: Reducer v1 (Deterministic Fold)

#### 2.1 Operation Types
- `NodeAdd { node: NodeId }`
- `NodeTombstone { node: NodeId }`
- `EdgeAdd { from: NodeId, to: NodeId, label: string }`
- `EdgeTombstone { from: NodeId, to: NodeId, label: string }`
- `PropSet { node: NodeId, key: string, value: ValueRef }`

#### 2.2 EventId (Total Order)
```
EventId = (lamport, writer_id, patch_sha, op_index)
```
Lexicographic comparison gives deterministic global order.

#### 2.3 State Model (LWW Registers)
- `node_alive[node] = LWW<bool>` — winner by max EventId
- `edge_alive[EdgeKey] = LWW<bool>` — winner by max EventId
- `prop[node][key] = LWW<ValueRef>` — winner by max EventId

#### 2.4 Merge Algorithm
```
reduce(patches):
  1. Collect all patch commits since checkpoint frontier
  2. Decode patches, expand to ops with EventIds
  3. Sort ops by EventId (total order)
  4. Apply sequentially to state
  5. Return state_hash for verification
```

#### 2.5 Frontier Tracking
- Checkpoint stores `frontier: Map<writer_id, last_seen_patch_sha>`
- Reducer walks each writer's chain from frontier to head

### Phase 3: Checkpoints

#### 3.1 Checkpoint Commit Format
```
empty-graph:checkpoint

eg-kind: checkpoint
eg-graph: <graph_name>
eg-state-hash: <sha256_of_canonical_state>
eg-frontier-oid: <blob_oid>
eg-index-oid: <tree_oid>
eg-schema: 1
```

#### 3.2 Checkpoint Tree Contents
- `state.cbor` or `state/` (chunked for large graphs)
- `frontier.cbor` — writer frontiers
- `index/` — bitmap index shards (reuse existing)

#### 3.3 Incremental Rebuild
- Load checkpoint state
- Reduce only patches since frontier
- Much faster than reducing from genesis

### Phase 4: API Surface

#### 4.1 Multi-Writer Graph
```js
const graph = await EmptyGraph.openMultiWriter({
  persistence,
  graphName: 'events',
  writerId: 'node-1',
});
```

#### 4.2 Patch Creation
```js
const patch = graph.createPatch();
patch.addNode('user:alice');
patch.addEdge('user:alice', 'group:admins', 'member-of');
patch.setProperty('user:alice', 'name', 'Alice');
await patch.commit();
```

#### 4.3 State Materialization
```js
const state = await graph.materialize(); // reduce all patches
const state = await graph.materializeAt(checkpointOid); // from checkpoint
```

#### 4.4 Sync Operations
```js
await graph.syncCoverage(); // update coverage anchor
await graph.createCheckpoint(); // snapshot current state
```

### Phase 5: Testing & Validation

#### 5.1 Determinism Tests
- Two replicas with same patches produce identical state_hash
- Order of patch arrival doesn't affect final state

#### 5.2 Conflict Resolution Tests
- Concurrent NodeAdd + NodeTombstone → deterministic winner
- Concurrent PropSet on same key → LWW by EventId

#### 5.3 Performance Benchmarks
- Reduce 10k patches
- Checkpoint creation time
- Incremental reduce from checkpoint

---

## Target: v5.0.0 — True Lattice Confluence

### Goals
- Order-independent merge (commutative, associative, idempotent)
- CRDT-based state types
- Merge is algebraic join, not sequential fold
- Formal verification possible

### Phase 6: CRDT State Types

#### 6.1 Upgrade Node State
- From: `LWW<bool>` (last-write-wins)
- To: `OR-Set` (Observed-Remove Set)
  - NodeAdd adds a dot (EventId)
  - NodeTombstone removes observed dots
  - Concurrent add/remove: add wins (crdt semantics)

#### 6.2 Upgrade Edge State
- From: `LWW<bool>`
- To: `OR-Set` with EdgeKey

#### 6.3 Keep Property State
- `LWW<ValueRef>` is already a valid CRDT
- Join = max by EventId (commutative, associative, idempotent)

### Phase 7: Causal Context

#### 7.1 Version Vectors
- Each writer tracks: `VV: Map<writer_id, counter>`
- Patch includes: `context: VV` (what writer had seen)

#### 7.2 Dots
- Each op gets: `dot: (writer_id, counter)`
- Enables "remove what I've seen" semantics

#### 7.3 PatchV2 Schema
```
PatchV2 {
  schema: 2,
  writer: string,
  lamport: u64,
  context: VersionVector,
  ops: [OpV2],  // each op has dot
}
```

### Phase 8: Join-Based Merge

#### 8.1 Replace Fold with Join
- From: Sort ops, apply sequentially
- To: Merge incoming deltas in any order

```
merge(state, patch):
  for op in patch.ops:
    state = join(state, op)  // commutative!
  return state
```

#### 8.2 State as Lattice
- Nodes: OR-Set lattice
- Edges: OR-Set lattice
- Props: LWW-Register lattice (per node, per key)

### Phase 9: Verification

#### 9.1 Content-Addressed State
- `state_hash = hash(canonical_state_bytes)`
- Checkpoint commit ID may vary (metadata differences)
- State hash must match across replicas

#### 9.2 Merge Receipts
- Record which patches were merged
- Proof of correct merge (for auditing)

### Phase 10: Footprints (Echo-style)

#### 10.1 Read/Write Sets
- Each patch declares: `footprint: { reads: [...], writes: [...] }`
- Enables fast conflict detection without full reduce

#### 10.2 Partial Acceptance
- If footprints don't overlap: auto-merge
- If footprints conflict: policy decides (reject, rebase, etc.)

---

## Migration Strategy

### Backward Compatibility
- v4 reducer can read v3 commits (message-based payloads)
- v3 API remains available for single-writer use cases
- Gradual migration: new graphs use v4, old graphs stay v3

### Upgrade Path
```
v3.0.0 (current)
   │
   ├── Add trailer-codec, CBOR deps
   ├── Add commitNodeWithTree()
   ├── Add per-writer refs
   │
v4.0.0 (multi-writer, LWW fold)
   │
   ├── Add version vectors
   ├── Upgrade to OR-Set
   ├── Switch to join-based merge
   │
v5.0.0 (true CRDT confluence)
```

---

## Task Estimates

| Phase | Description | Complexity |
|-------|-------------|------------|
| 1.1-1.4 | Plumbing | Medium |
| 2.1-2.5 | Reducer v1 | High |
| 3.1-3.3 | Checkpoints | Medium |
| 4.1-4.4 | API Surface | Medium |
| 5.1-5.3 | Testing | Medium |
| 6.1-6.3 | CRDT Types | High |
| 7.1-7.3 | Causal Context | High |
| 8.1-8.2 | Join Merge | Medium |
| 9.1-9.2 | Verification | Medium |
| 10.1-10.2 | Footprints | High |

---

## References

- [SEMANTICS.md](../SEMANTICS.md) — Durability contract (v3)
- [ANCHORING.md](./ANCHORING.md) — Anchor mechanics (v3, reused in v4 coverage)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Current hexagonal architecture
- WARP Papers I-IV — Theoretical foundation
- @git-stunts/trailer-codec — Commit message encoding
