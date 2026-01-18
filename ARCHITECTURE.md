# Architecture: @git-stunts/empty-graph

A graph database substrate living entirely within Git commits, using the "Empty Tree" pattern for invisible storage and Roaring Bitmaps for high-performance indexing.

## 🧱 Core Concepts

### 1. The "Invisible" Graph
Nodes are represented by **Git Commits**.
- **SHA**: The Node ID.
- **Message**: The Node Payload.
- **Tree**: The "Empty Tree" (SHA: `4b825dc642cb6eb9a060e54bf8d69288fbee4904`).
- **Parents**: Graph Edges (Directed).

Because they point to the Empty Tree, these commits introduce **no files** into the repository. They float in the object database, visible only to `git log` and this tool.

### 2. High-Performance Indexing (The "Stunt")
To avoid O(N) graph traversals, we maintain a secondary index structure persisted as a Git Tree.

#### Components:
- **`BitmapIndexService`**: Manages the index.
- **`RoaringBitmap32`**: Used for O(1) set operations and storage.
- **Sharding**: Bitmaps are sharded by OID prefix (e.g., `00`, `01`... `ff`) to allow partial loading.

#### Index Structure (Git Tree):
```text
/
├── meta_xx.json           # Maps SHAs to IDs (sharded by prefix)
├── shards_fwd_xx.json     # Forward edges: {sha: base64Bitmap, ...}
└── shards_rev_xx.json     # Reverse edges: {sha: base64Bitmap, ...}
```

Each shard file contains per-node bitmaps encoded as base64 JSON. This enables O(1) lookups while maintaining efficient storage through prefix-based sharding.

### 3. Hexagonal Architecture

#### Domain Layer (`src/domain/`)
- **Entities**: `GraphNode` (Value Object).
- **Services**: 
    - `GraphService`: High-level graph operations.
    - `BitmapIndexService`: Index management.
    - `CacheRebuildService`: Rebuilds the index from the log.

#### Infrastructure Layer (`src/infrastructure/`)
- **Adapters**: `GitGraphAdapter` wraps `git` commands via `@git-stunts/plumbing`.

#### Ports Layer (`src/ports/`)
- **GraphPersistencePort**: Interface for Git operations (`writeBlob`, `writeTree`, `logNodes`).

## 🚀 Performance

- **Write**: O(1) (Append-only commit).
- **Read (Unindexed)**: O(N) (Linear scan of `git log`).
- **Read (Indexed)**: **O(1)** (Bitmap lookup).
- **Rebuild**: O(N) (One-time scan to build the bitmap).

## ⚠️ Constraints

- **Delimiter**: Requires a safe delimiter for parsing `git log` output (mitigated by strict validation).
- **ID Map Size**: The global `ids.json` map grows linearly with node count. For >10M nodes, this map itself should be sharded (Future Work).