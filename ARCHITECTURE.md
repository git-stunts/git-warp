# WarpGraph Architecture

## Overview

WarpGraph is a graph database built on Git. It uses Git commits pointing to the empty tree as nodes, with commit messages as payloads and parent relationships as edges.

This architecture enables:
- Content-addressable storage with built-in deduplication
- Git's proven durability and integrity guarantees
- Standard Git tooling compatibility
- Distributed replication via git push/pull

## Design Principles

### Hexagonal Architecture (Ports & Adapters)

The codebase follows hexagonal architecture to isolate domain logic from infrastructure concerns:

- **Ports** define abstract interfaces for external dependencies
- **Adapters** implement ports for specific technologies (Git, console, etc.)
- **Domain services** contain pure business logic with injected dependencies

This enables:
- Easy testing via mock adapters
- Swappable infrastructure (different Git implementations, logging backends)
- Clear separation of concerns

### Domain-Driven Design

The domain layer models the graph database concepts:
- `GraphNode` - Immutable value object representing a node
- `WarpGraph` - Node CRUD operations (the main API class)
- `TraversalService` - Graph algorithms (BFS, DFS, shortest path)
- `BitmapIndexBuilder/Reader` - High-performance indexing

### Immutable Entities

`GraphNode` instances are frozen after construction. The `parents` array is also frozen to prevent accidental mutation. This aligns with Git's immutable commit model.

### Dependency Injection

All services accept their dependencies via constructor options:
- Persistence adapters
- Loggers
- Clocks
- Parsers

This enables testing with mocks and flexible runtime configuration.

## Layer Diagram

```text
+-------------------------------------------------------------+
|                       WarpGraph                              |  <- Main API
|                      (WarpGraph.js)                          |
+-------------------------------------------------------------+
|                     Supporting Services                      |
|  +---------------+ +--------------------+                    |
|  | IndexRebuild  | | TraversalService   |                    |
|  | Service       | |                    |                    |
|  +---------------+ +--------------------+                    |
|  +-------------+ +---------------+ +--------------------+    |
|  | HealthCheck | | BitmapIndex   | | BitmapIndex        |    |
|  | Service     | | Builder       | | Reader             |    |
|  +-------------+ +---------------+ +--------------------+    |
|  +---------------+ +---------------+ +--------------------+    |
|  | GitLogParser  | | Streaming          |                    |
|  |               | | BitmapIndexBuilder |                    |
|  +---------------+ +--------------------+                    |
+-------------------------------------------------------------+
|                         Ports                                |
|  +-------------------+ +---------------------------+         |
|  | GraphPersistence  | | IndexStoragePort          |         |
|  | Port              | |                           |         |
|  +-------------------+ +---------------------------+         |
|  +-------------------+ +---------------------------+         |
|  | LoggerPort        | | ClockPort                 |         |
|  +-------------------+ +---------------------------+         |
+-------------------------------------------------------------+
|                       Adapters                               |
|  +-------------------+ +---------------------------+         |
|  | GitGraphAdapter   | | ConsoleLogger             |         |
|  |                   | | NoOpLogger                |         |
|  +-------------------+ +---------------------------+         |
|  +-------------------+                                       |
|  | PerformanceClock  |                                       |
|  | GlobalClock       |                                       |
|  +-------------------+                                       |
+-------------------------------------------------------------+
```text

## Directory Structure

```text
src/
+-- domain/
|   +-- entities/           # Immutable domain objects
|   |   +-- GraphNode.js    # Node value object (sha, message, parents)
|   +-- services/           # Business logic
|   |   +-- WarpGraph.js             # Main API - Node CRUD operations
|   |   +-- IndexRebuildService.js   # Index orchestration
|   |   +-- BitmapIndexBuilder.js    # In-memory index construction
|   |   +-- BitmapIndexReader.js     # O(1) index queries
|   |   +-- StreamingBitmapIndexBuilder.js  # Memory-bounded building
|   |   +-- TraversalService.js      # Graph algorithms
|   |   +-- HealthCheckService.js    # K8s-style probes
|   |   +-- GitLogParser.js          # Binary stream parsing
|   +-- errors/             # Domain-specific errors
|   |   +-- IndexError.js
|   |   +-- ShardLoadError.js
|   |   +-- ShardCorruptionError.js
|   |   +-- ShardValidationError.js
|   |   +-- TraversalError.js
|   |   +-- OperationAbortedError.js
|   |   +-- EmptyMessageError.js
|   +-- utils/              # Domain utilities
|       +-- LRUCache.js     # Shard caching
|       +-- MinHeap.js      # Priority queue for A*
|       +-- CachedValue.js  # TTL-based caching
|       +-- cancellation.js # AbortSignal utilities
+-- infrastructure/
|   +-- adapters/           # Port implementations
|       +-- GitGraphAdapter.js       # Git operations via @git-stunts/plumbing
|       +-- ConsoleLogger.js         # Structured JSON logging
|       +-- NoOpLogger.js            # Silent logger for tests
|       +-- PerformanceClockAdapter.js  # Node.js timing
|       +-- GlobalClockAdapter.js       # Bun/Deno/Browser timing
+-- ports/                  # Abstract interfaces
    +-- GraphPersistencePort.js  # Git commit/ref operations
    +-- IndexStoragePort.js      # Blob/tree storage
    +-- LoggerPort.js            # Structured logging contract
    +-- ClockPort.js             # Timing abstraction
```text

## Key Components

### Main API: WarpGraph

The main entry point (`WarpGraph.js`) provides:
- Direct graph database API
- `open()` factory for managed mode with automatic durability
- Batch API for efficient bulk writes
- Health check endpoints (K8s liveness/readiness)
- Index management (rebuild, load, save)

### Core API

#### WarpGraph

Core node operations:
- `createNode()` - Create a single node
- `createNodes()` - Bulk creation with placeholder references (`$0`, `$1`)
- `readNode()` / `getNode()` - Retrieve node data
- `hasNode()` - Existence check
- `iterateNodes()` - Streaming iterator for large graphs
- `countNodes()` - Efficient count via `git rev-list --count`

Message validation enforces size limits (default 1MB) and non-empty content.

#### IndexRebuildService

Orchestrates index creation:
- **In-memory mode**: Fast, O(N) memory, single serialization pass
- **Streaming mode**: Memory-bounded, flushes to storage periodically

Supports cancellation via `AbortSignal` and progress callbacks.

#### TraversalService

Graph algorithms using O(1) bitmap lookups:
- `bfs()` / `dfs()` - Traversal generators
- `ancestors()` / `descendants()` - Transitive closures
- `findPath()` - Any path between nodes
- `shortestPath()` - Bidirectional BFS for efficiency
- `weightedShortestPath()` - Dijkstra with custom edge weights
- `aStarSearch()` - A* with heuristic guidance
- `bidirectionalAStar()` - A* from both ends
- `topologicalSort()` - Kahn's algorithm with cycle detection
- `commonAncestors()` - Find shared ancestors of multiple nodes

All traversals support:
- `maxNodes` / `maxDepth` limits
- Cancellation via `AbortSignal`
- Direction control (forward/reverse)

#### BitmapIndexBuilder / BitmapIndexReader

Roaring bitmap-based indexes for O(1) neighbor lookups:

**Builder**:
- `registerNode()` - Assign numeric ID to SHA
- `addEdge()` - Record parent/child relationship
- `serialize()` - Output sharded JSON structure

**Reader**:
- `setup()` - Configure with shard OID mappings
- `getParents()` / `getChildren()` - O(1) lookups
- Lazy loading with LRU cache for bounded memory
- Checksum validation with strict/non-strict modes

#### StreamingBitmapIndexBuilder

Memory-bounded variant of BitmapIndexBuilder:
- Flushes bitmap data to storage when threshold exceeded
- SHA-to-ID mappings remain in memory (required for consistency)
- Merges chunks at finalization via bitmap OR operations

### Ports (Interfaces)

#### GraphPersistencePort

Git operations contract:
- `commitNode()` - Create commit pointing to empty tree
- `showNode()` / `getNodeInfo()` - Retrieve commit data
- `logNodesStream()` - Stream commit history
- `updateRef()` / `readRef()` / `deleteRef()` - Ref management
- `isAncestor()` - Ancestry testing for fast-forward detection
- `countNodes()` - Efficient count
- `ping()` - Health check

Also includes blob/tree operations for index storage.

#### IndexStoragePort

Index persistence contract:
- `writeBlob()` / `readBlob()` - Blob I/O
- `writeTree()` / `readTreeOids()` - Tree I/O
- `updateRef()` / `readRef()` - Index ref management

#### LoggerPort

Structured logging contract:
- `debug()`, `info()`, `warn()`, `error()` - Log levels
- `child()` - Create scoped logger with inherited context

#### ClockPort

Timing abstraction:
- `now()` - High-resolution timestamp (ms)
- `timestamp()` - ISO 8601 wall-clock time

### Adapters (Implementations)

#### GitGraphAdapter

Implements both `GraphPersistencePort` and `IndexStoragePort`:
- Uses `@git-stunts/plumbing` for git command execution
- Retry logic with exponential backoff for transient errors
- Input validation to prevent command injection
- NUL-terminated output parsing for reliability

#### ConsoleLogger / NoOpLogger

- `ConsoleLogger`: Structured JSON output with configurable levels
- `NoOpLogger`: Zero-overhead silent logger for tests

#### PerformanceClockAdapter / GlobalClockAdapter

- `PerformanceClockAdapter`: Uses Node.js `perf_hooks`
- `GlobalClockAdapter`: Uses global `performance` for Bun/Deno/browsers

## Data Flow

### Write Path

```text
createNode() -> WarpGraph.createNode()
             -> persistence.commitNode()
             -> persistence.updateRef()
```text

### Read Path (with index)

```text
getParents() -> BitmapIndexReader._getEdges()
             -> _getOrLoadShard() (lazy load)
             -> storage.readBlob()
             -> Validate checksum
             -> RoaringBitmap32.deserialize()
             -> Map IDs to SHAs
```text

### Index Rebuild

```text
rebuildIndex() -> IndexRebuildService.rebuild()
               -> WarpGraph.iterateNodes()
               -> BitmapIndexBuilder.registerNode() / addEdge()
               -> builder.serialize()
               -> storage.writeBlob() (per shard, parallel)
               -> storage.writeTree()
```text

## The Empty Tree Trick

All WarpGraph nodes are Git commits pointing to the empty tree:

```text
SHA: 4b825dc642cb6eb9a060e54bf8d69288fbee4904
```text

This is the well-known SHA of an empty Git tree, automatically available in every repository.

**How it works:**
- **Data**: Stored in commit message (arbitrary payload up to 1MB default)
- **Edges**: Commit parent relationships (directed, multi-parent supported)
- **Identity**: Commit SHA (content-addressable)

**Benefits:**
- Introduces no files into the repository working tree
- Content-addressable with automatic deduplication
- Git's proven durability and integrity (SHA verification)
- Standard tooling compatibility (`git log`, `git show`, etc.)
- Distributed replication via `git push`/`git pull`

## Index Structure

The bitmap index enables O(1) neighbor lookups. It is stored as a Git tree with sharded JSON blobs:

```text
index-tree/
+-- meta_00.json        # SHA->ID mappings for prefix "00"
+-- meta_01.json        # SHA->ID mappings for prefix "01"
+-- ...
+-- meta_ff.json        # SHA->ID mappings for prefix "ff"
+-- shards_fwd_00.json  # Forward edges (parent->children) for prefix "00"
+-- shards_rev_00.json  # Reverse edges (child->parents) for prefix "00"
+-- ...
+-- shards_fwd_ff.json
+-- shards_rev_ff.json
```text

**Shard envelope format:**
```json
{
  "version": 2,
  "checksum": "sha256-hex-of-data",
  "data": { ... actual content ... }
}
```text

**Meta shard content:**
```json
{
  "00a1b2c3d4e5f6789...": 0,
  "00d4e5f6a7b8c9012...": 42
}
```text

**Edge shard content:**
```json
{
  "00a1b2c3d4e5f6789...": "OjAAAAEAAAAAAAEAEAAAABAAAA=="
}
```text

Values are base64-encoded Roaring bitmaps containing numeric IDs of connected nodes.

## Durability & Semantics

This section defines the official durability contract for EmptyGraph and the mechanisms used to enforce it.

### Core Durability Contract

**A write is durable if and only if it becomes reachable from the graph ref.**

Git garbage collection (GC) prunes commits that are not reachable from any ref. Since WarpGraph nodes are Git commits, without careful ref management, data can be silently deleted. EmptyGraph provides mechanisms to ensure writes remain reachable.

### Modes

#### Managed Mode (Default)
In managed mode, EmptyGraph guarantees durability for all writes.
- Every write operation updates the graph ref (or creates an anchor commit).
- Reachability from the ref is maintained automatically.
- Users do not need to manage refs or call sync manually.

#### Manual Mode
In manual mode, EmptyGraph provides no automatic ref management.
- Writes create commits but do not update refs.
- User is responsible for calling `sync()` to persist reachability.
- User may manage refs directly via Git commands.
- **Warning**: Uncommitted writes are subject to garbage collection.

### Anchor Commits

Anchor commits are the mechanism used to maintain reachability for disconnected graphs (e.g., disjoint roots or imported history).

#### The Problem
In a linear history, every new commit points to the previous tip, maintaining a single chain reachable from the ref. However, graph operations can create disconnected commits:
- Creating a new root node (no parents).
- Merging unrelated graph histories.
- Importing commits from external sources.

If the ref simply moves to the new commit, the old history becomes unreachable and will be GC'd.

#### The Solution
An anchor commit is a special infrastructure commit that:
- Has multiple **parents**: The previous ref tip AND the new commit(s).
- Has an **Empty Tree** (like all WarpGraph nodes).
- Has a specific **Payload/Trailer**:
  - **v4+ format**: Trailer-typed (`eg-kind: anchor`, `eg-schema: 1`).
  - **Legacy v3**: JSON `{"_type":"anchor"}`.
- Is **filtered out** during graph traversal (invisible to domain logic).

#### Anchoring Strategies

**1. Chained Anchors (per-write sync)**
Used by `autoSync: 'onWrite'`.
- Each disconnected write creates one anchor with 2 parents.
- **Pro**: Simple, stateless, works for incremental writes.
- **Con**: O(N) anchor commits for N disconnected tips.

**2. Octopus Anchors (batch mode)**
Used by `Batch.commit()`.
- Single anchor with N parents for all tips.
- **Pro**: O(1) anchor overhead.
- **Con**: Requires knowing all tips upfront.

**3. Hybrid**
WarpGraph defaults to chained anchors for individual writes but uses octopus anchors for batch operations. `compactAnchors()` can be called to rewrite chains into octopus anchors for cleanup.

### Guarantees

1. In **managed mode**, any successfully returned write is durable.
2. Anchor commits preserve all previously reachable history.
3. The sync algorithm is idempotent for the same inputs.
4. Graph semantics are unaffected by anchor commits (they are transparent to traversal).

### Storage & Rebuild Impact

In V7, logical graph traversal uses the **Bitmap Index** (built from materialized state) and is **O(1)** regardless of the underlying commit topology. Anchor commits do **not** appear in the logical graph.

However, anchors do impact **Materialization** (scanning Git history to build state) and **Git Storage** (number of objects).

| Metric            | Chained Anchors          | Octopus Anchors          |
| ----------------- | ------------------------ | ------------------------ |
| Logical Traversal | **O(1)** (Index)         | **O(1)** (Index)         |
| Materialization   | N patches + O(N) anchors | N patches + O(1) anchors |
| Git Object Count  | Higher                   | Lower                    |

**Chained Anchors** (linear history enforcement) add overhead to the `git rev-list` walk required during materialization.
**Octopus Anchors** (used by `syncCoverage`) are more efficient for bulk operations, keeping the commit depth shallow.

### Sync Algorithm (V7)

In V7 Multi-Writer mode:
1. Each writer maintains their own ref (`refs/.../writers/<id>`), pointing to a chain of **Patch Commits**.
2. **Durability** is ensured because writes update these refs.
3. **Global Reachability** (optional) is maintained via `syncCoverage()`, which creates an **Octopus Anchor** commit pointed to by `refs/.../coverage/head`. This anchor has all writer tips as parents, ensuring they aren't GC'd even if individual writer refs are deleted (e.g. during a clone).

## Performance Characteristics

| Operation           | Complexity   | Notes                        |
| ------------------- | ------------ | ---------------------------- |
| Write (createNode)  | O(1)         | Append-only commit           |
| Read (readNode)     | O(1)         | Direct SHA lookup            |
| Unindexed traversal | O(N)         | Linear scan via git log      |
| Indexed lookup      | O(1)         | Bitmap query + ID resolution |
| Index rebuild       | O(N)         | One-time scan                |
| Index load          | O(1) initial | Lazy shard loading           |

**Memory characteristics:**

| Scenario              | Approximate Memory  |
| --------------------- | ------------------- |
| Cold start (no index) | Near-zero           |
| Single shard loaded   | 0.5-2 MB per prefix |
| Full index (1M nodes) | 150-200 MB          |

## Error Handling

Domain-specific error types enable precise error handling:

- `ShardLoadError` - Storage I/O failure
- `ShardCorruptionError` - Invalid shard format
- `ShardValidationError` - Version/checksum mismatch
- `TraversalError` - Algorithm failures (no path, cycle detected)
- `OperationAbortedError` - Cancellation via AbortSignal
- `EmptyMessageError` - Empty message validation failure

## Cancellation Support

Long-running operations support `AbortSignal` for cooperative cancellation:

```javascript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

for await (const node of graph.iterateNodes({
  ref: 'HEAD',
  signal: controller.signal
})) {
  // Process node
}
```text

Supported operations:
- `iterateNodes()`
- `rebuildIndex()`
- All traversal methods (BFS, DFS, shortest path, etc.)
