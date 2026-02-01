# V7 Contract: One WARP Core

This document codifies the repository invariants for V7. These are non-negotiable architectural constraints that CI enforces.

## Core Invariants

### 1. Graph = Materialized WARP State

The graph is the **result of reducing patches**, not the Git commit DAG.

- Nodes and edges exist in WARP state, not as Git commits
- `materialize()` produces the authoritative graph state
- Traversal queries the materialized state, not commit topology

### 2. Commits = Patch Storage Only

Git commits store **patches** (batched operations), not graph nodes.

- Each commit contains a CBOR-encoded patch blob
- Commit parents link patch history, not graph edges
- Writer refs (`refs/empty-graph/<graph>/writers/<id>`) point to patch chains

### 3. No Commit-Per-Node Engine

There is no legacy `GraphService` or `EmptyGraph` that treats commits as nodes.

- The "empty tree trick" is gone
- No `createNode()` that creates a Git commit per graph node
- No traversal that walks commit parents as graph edges

### 4. Schema:2 Only

Only schema:2 (OR-Set CRDT) is supported.

- No schema:1 code paths
- No LWW-only reducers for graph topology
- `PatchBuilderV2` is the only patch builder
- `JoinReducer` (OR-Set) is the only reducer for nodes/edges

### 5. Multi-Writer First

Multi-writer is the default mental model.

- Single-writer is just multi-writer with one writer
- Version vectors track causality across writers
- Patches carry dots for OR-Set semantics
- Deterministic merge is guaranteed

## Ref Layout (V7)

```
refs/empty-graph/<graph>/
├── writers/
│   ├── <writer-id-1>     → latest patch commit from writer 1
│   ├── <writer-id-2>     → latest patch commit from writer 2
│   └── ...
├── checkpoints/
│   └── head              → latest checkpoint commit
└── coverage/
    └── head              → octopus anchor for reachability
```

## Patch Commit Format

Each patch commit contains:

```
Tree:
└── patch.cbor            → CBOR-encoded PatchV2

Trailers:
  warp-schema: 2
  warp-writer: <writer-id>
  warp-lamport: <monotonic-counter>
```

## State Structure (WarpStateV5)

```javascript
{
  nodeAlive: ORSet,           // OR-Set of alive node IDs
  edgeAlive: ORSet,           // OR-Set of alive edge keys
  prop: Map<string, LWW>,     // Properties with LWW registers
  observedFrontier: VersionVector  // Causal frontier
}
```

## Deleted Components (V7)

The following are permanently removed:

| Component | Reason |
|-----------|--------|
| `EmptyGraphWrapper.js` | Legacy wrapper over commit-per-node |
| `GraphService.js` | Commit-per-node engine |
| `PatchBuilder.js` | Schema:1 patch builder |
| `Reducer.js` | Schema:1 LWW reducer |
| `WarpTypes.js` (schema:1 ops) | Schema:1 operation types |
| `StateSerializer.js` | Schema:1 state serialization |

## CI Guards

The following checks run on every PR:

1. **No legacy files**: Fails if deleted components are reintroduced
2. **No schema:1 exports**: Fails if schema:1 symbols are exported
3. **Build passes**: TypeScript/lint must pass with schema:2 only

## Version History

| Version | Date | Change |
|---------|------|--------|
| V7 | 2026-01 | One WARP core, schema:2 only |
| V6 | 2026-01 | Unification (wrapper, not true merge) |
| V5 | - | OR-Set CRDT (schema:2) added |
| V4 | - | LWW CRDT (schema:1) |

---

*"Temporary things are forever. Delete, don't wrap."*
