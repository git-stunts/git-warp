# @git-stunts/empty-graph

[![CI](https://github.com/git-stunts/empty-graph/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/empty-graph/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://badge.fury.io/js/%40git-stunts%2Fempty-graph.svg)](https://www.npmjs.com/package/@git-stunts/empty-graph)

> *A **graph database that lives inside Git**. Stores data invisibly (no files) within Git commits using the **empty-tree pattern***.

## Key highlights:

- **Multi-writer support** via WARP protocol with deterministic LWW merge
- **Hexagonal architecture** with ports/adapters and DDD patterns
- **Roaring Bitmap indexes for O(1) parent/child lookups**
- Graph traversal algorithms (BFS, DFS, Dijkstra, A*, bidirectional)
- **Streaming-first design for handling millions of nodes**
- TypeScript definitions included

Example included; benchmarks ready to fire up as soon as you finish cloning the git repo.

## Use Cases

EmptyGraph excels at specific scenarios where Git's properties align with your requirements. Here are concrete examples of what you can build:

### Event Sourcing Systems

Store domain events as commits, traverse history to replay state. Each event is immutable, cryptographically verified, and automatically timestamped. Build CQRS systems where the event store is a Git repository you can clone, branch, and inspect with standard tools.

```javascript
// Each order event becomes a graph node
const orderCreated = await graph.createNode({ message: JSON.stringify({ type: 'OrderCreated', orderId: '123', items: [...] }) });
const paymentReceived = await graph.createNode({ message: JSON.stringify({ type: 'PaymentReceived', orderId: '123', amount: 99.99 }), parents: [orderCreated] });
```

### Knowledge Graphs & Semantic Networks

Build interconnected knowledge bases where concepts link to related concepts. Perfect for documentation systems, wiki graphs, or AI training data that needs version control. Use `shortestPath()` to find connections between concepts.

### Configuration & Dependency Graphs

Track infrastructure-as-code dependencies, module relationships, or build graphs. Combine with GitOps workflows - your dependency graph lives in the same Git ecosystem as your infrastructure definitions.

### Audit Trail Systems

Every mutation is a commit with author, timestamp, and cryptographic proof. Use `git log` as your audit log, `git blame` to trace when data changed, and `git bisect` to find when relationships broke. Compliance-friendly by design.

### Blockchain-like Data Structures

Create immutable, content-addressed data structures with cryptographic verification. Each node's SHA proves its integrity and ancestry. Fork the graph, create branches, merge carefully - Git's distributed model handles replication.

### Offline-First Applications

Build apps that work without network connectivity. Clone the graph, query locally, sync when you reconnect. Perfect for field work, edge computing, or mobile apps that need local-first data with eventual consistency.

### Distributed Databases

Leverage Git's battle-tested sync and merge capabilities. Push to multiple remotes, fork repositories, handle conflicts with standard Git tooling. Your graph database inherits Git's distributed nature without additional infrastructure.

## Why EmptyGraph?

Git is usually used to track files. `EmptyGraph` subverts this by using Git's Directed Acyclic Graph (DAG) to store structured data *in the commits themselves*.

Because all commits point to the "Empty Tree" (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`), your data does not exist as files in the working directory—it exists entirely within the Git object database.

> [!warning]
> **Reality Check**: When To Use This (And When **NOT** To)

Let's pump the brakes... Just because you *can* store a graph in Git doesn't mean you *should*. Here's an honest assessment.

| Scenario                 | ✅ Good Fit                                           | ❌ Bad Fit                               | Notes                                                            |
| ------------------------ | ---------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| **Network connectivity** | Offline-first, edge computing, field work            | Real-time updates needed                | Git has no pubsub/WebSocket; polling `git fetch` is slow         |
| **Replication model**    | Git-native (fork, push, merge branches)              | Fine-grained access control             | Git repos are all-or-nothing; no row-level security              |
| **Write patterns**       | Append-mostly, immutable data                        | Write-heavy (10k+ writes/sec)           | Every write = `git commit-tree` + `git commit`                   |
| **Existing ecosystem**   | Already Git-centric (CI/CD, GitOps, IaC)             | Team unfamiliar with Git                | Debugging corrupt indexes after force-push requires Git fluency  |
| **Audit requirements**   | Need free audit trail (`git log`, `blame`, `bisect`) | Need true ACID transactions             | Git commits are atomic but no rollback/isolation levels          |
| **Graph size**           | Small-to-medium (< 10M nodes)                        | Huge (> 100M nodes)                     | 1M nodes ≈ 150-200MB index; beyond 100M, pack files get unwieldy |
| **Query complexity**     | Raw traversal primitives, simple patterns            | Complex multi-hop queries with filters  | No query planner; Cypher/Gremlin needed for complex queries      |
| **Data deletion**        | Rarely delete (reflog recovers "deleted" nodes)      | GDPR compliance / right to be forgotten | `git filter-branch` is painful and breaks all clones             |
| **Philosophy**           | Value simplicity over features                       | Need enterprise DB features             | No query language, no cluster, no connection pools—just JS + Git |

#### Your team doesn't know Git.

This sounds obvious, but: if your team struggles with `git rebase`, they're going to have a bad time debugging why the graph index is corrupt after a force push.

### The Honest Summary

<details>
<summary>Click to expand: When to use EmptyGraph vs alternatives</summary>

| Use Case                    | EmptyGraph? | Better Alternative  |
| --------------------------- | ----------- | ------------------- |
| Offline-first app data      | Yes         | -                   |
| Configuration graph         | Yes         | -                   |
| Dependency tracking         | Yes         | -                   |
| Knowledge base / wiki graph | Yes         | -                   |
| Social network (prototype)  | Maybe       | Neo4j at scale      |
| Financial transactions      | No          | PostgreSQL          |
| Real-time collaboration     | No          | Firebase, Supabase  |
| Analytics / OLAP            | No          | ClickHouse, DuckDB  |
| Massive scale (100M+ nodes) | No          | TigerGraph, Neptune |

</details>

## EmptyGraph is a **stunt**, not a product.

It's proof that Git's data model is more powerful than people realize. It's a legitimate tool for specific use cases. But it's not a replacement for purpose-built graph databases.

Use it when Git's properties (content-addressing, distributed replication, offline operation, universal tooling) align with your needs. Don't use it just because it's clever.

### Why It Matters

Graph databases are a $3B market. They require dedicated infrastructure, specialized query languages, careful capacity planning.

EmptyGraph says: "What if the graph database was just... Git?"

You already have Git. Your CI knows Git. Your backups cover Git. Your team understands Git (mostly). Now that same Git repository can store arbitrary graph data with O(1) edge lookups and full traversal capabilities.

The traversal algorithms aren't novel. BFS is BFS. Kahn's algorithm is 62 years old. What's novel is *where they're running*: on top of a persistence layer that's simultaneously a version control system, a content-addressed store, and the most battle-tested distributed database in existence.

That's the stunt. Take something everyone has, use it for something no one intended, and make it work better than it has any right to.

## Installation

```bash
npm install @git-stunts/empty-graph @git-stunts/plumbing
```

### CLI (git warp)

The canonical CLI entrypoint is `git warp` (a `git-warp` shim).

```bash
git warp --help
git warp info
git warp query --help
```

#### Local install (clone + npm install)

```bash
./scripts/install-git-warp.sh
```

Defaults:
- Repo: `https://github.com/git-stunts/empty-graph.git`
- Install dir: `~/.git-warp`

Overrides:
- `GIT_WARP_REPO_URL` to point at a fork
- `GIT_WARP_HOME` to change install dir

## API Status

| API                    | Status          | Use For                 |
| ---------------------- | --------------- | ----------------------- |
| `WarpGraph` (schema:2) | **Recommended** | All new projects        |
| `WarpGraph` (schema:1) | Legacy          | Existing v4 graphs only |
| `EmptyGraph`           | Deprecated      | Migration path only     |

> **V7 Note**: The codebase is transitioning to "One WARP Core" - schema:2 only, no commit-per-node engine. See [docs/V7_CONTRACT.md](./docs/V7_CONTRACT.md) for architectural invariants.

### Migration from EmptyGraph

EmptyGraph predates WARP and does not support multi-writer collaboration, checkpoints, or CRDT merge semantics. New projects should use WarpGraph.

### Migration from WARP v4 to v5

```javascript
import { migrateV4toV5 } from '@git-stunts/empty-graph';

// Migrate v4 state to v5 format
const v5State = migrateV4toV5(v4State, 'migration-writer-id');
// Creates a v5 state from v4 visible projection
```

## Durability

> **Warning**: If you don't use managed mode or call `sync()`/`anchor()`, Git GC can prune unreachable nodes. See [SEMANTICS.md](./SEMANTICS.md) for details.

## Quick Start

```javascript
import GitPlumbing from '@git-stunts/plumbing';
import EmptyGraph, { GitGraphAdapter } from '@git-stunts/empty-graph';

// Create the persistence adapter
const plumbing = new GitPlumbing({ cwd: './my-db' });
const persistence = new GitGraphAdapter({ plumbing });

// Open graph in managed mode (recommended)
const graph = await EmptyGraph.open({
  persistence,
  ref: 'refs/empty-graph/events',
  mode: 'managed',  // default - automatic durability
});

// Create nodes - automatically synced to ref
const parentSha = await graph.createNode({ message: 'First Entry' });
const childSha = await graph.createNode({
  message: 'Second Entry',
  parents: [parentSha]
});

// Read data
const message = await graph.readNode(childSha);

// Stream large graphs (millions of nodes)
for await (const node of graph.iterateNodes({ ref: 'refs/empty-graph/events' })) {
  console.log(node.message);
}
```

## Sync Transport (HTTP)

WarpGraph includes a one-line sync server for peer-to-peer replication.

```javascript
const server = await graph.serve({ port: 8080 });
console.log(server.url); // http://127.0.0.1:8080/sync

// ... later
await server.close();
```

Clients should POST a `sync-request` JSON payload (use `graph.createSyncRequest()` on the caller).

```javascript
// Sync with a remote HTTP peer (uses /sync by default)
await graph.syncWith('http://127.0.0.1:8080');

// Sync directly with another graph instance
await graph.syncWith(otherGraph);
```

## Choosing a Mode

### Beginner (Recommended)

Use `EmptyGraph.open()` with managed mode for automatic durability:

```javascript
const graph = await EmptyGraph.open({
  persistence,
  ref: 'refs/empty-graph/events',
  mode: 'managed',  // default
});

// Every write is automatically made durable
await graph.createNode({ message: 'Safe from GC' });
```

### Batch Writer

For bulk imports, use batching to reduce ref update overhead:

```javascript
const tx = graph.beginBatch();
for (const item of items) {
  await tx.createNode({ message: JSON.stringify(item) });
}
await tx.commit();  // Single ref update
```

### Power User

For custom ref management, use manual mode:

```javascript
const graph = await EmptyGraph.open({
  persistence,
  ref: 'refs/my-graph',
  mode: 'managed',
  autoSync: 'manual',
});

// Create nodes without automatic ref updates
const sha1 = await graph.createNode({ message: 'Node 1' });
const sha2 = await graph.createNode({ message: 'Node 2' });

// Explicit sync when ready
await graph.sync(sha2);

// Or use anchor() for fine-grained control
await graph.anchor('refs/my-graph', [sha1, sha2]);
```

### Direct Constructor (Legacy)

For backward compatibility, you can still use the constructor directly:

```javascript
const graph = new EmptyGraph({ persistence });

// But you must manage durability yourself!
const sha = await graph.createNode({ message: 'May be GC\'d!' });
```

## How Durability Works

EmptyGraph nodes are Git commits. Git garbage collection (GC) prunes commits that are not reachable from any ref. Without ref management, your data can be silently deleted.

In **managed mode**, EmptyGraph automatically maintains reachability using **anchor commits**:

- **Linear history**: Fast-forward updates (no anchor needed)
- **Disconnected roots**: Creates an anchor commit with parents `[old_tip, new_commit]`
- **Batch imports**: Single octopus anchor with all tips as parents

Anchor commits have the message `{"_type":"anchor"}` and are filtered from graph traversals—they are infrastructure, not domain data.

See [docs/ANCHORING.md](./docs/ANCHORING.md) for the full algorithm and [SEMANTICS.md](./SEMANTICS.md) for the durability contract.

## Performance Considerations

Anchor commit overhead depends on your write pattern:

| Pattern | Anchor Overhead | Notes |
|---------|-----------------|-------|
| Linear history | Zero | Fast-forward updates |
| Disconnected roots (`autoSync: 'onWrite'`) | O(N) chained anchors | One anchor per disconnected write |
| Batch imports (`beginBatch()`) | O(1) octopus anchor | Single anchor regardless of batch size |

**Recommendations:**

- Use `beginBatch()` for bulk imports to avoid anchor chains
- Call `compactAnchors()` periodically to consolidate chained anchors into one octopus
- For streaming writes with disconnected roots, consider batching or periodic compaction

See [docs/ANCHORING.md](./docs/ANCHORING.md) for traversal complexity analysis.

## Interactive Demo

Try EmptyGraph hands-on with our Docker-based interactive demo. It creates a sample e-commerce event graph and demonstrates traversal, event sourcing projections, and path finding.

```bash
# Prerequisites: Docker must be running

# 1. Set up the demo (creates container with sample events)
npm run demo:setup

# 2. Run the interactive explorer
npm run demo:explore

# 3. (Optional) Drop into the container shell for manual exploration
npm run demo

# 4. Inspect the bitmap index structure
npm run demo:inspect

# 5. Run Lagrangian pathfinding demo (resource-aware traversal)
npm run demo:lagrangian

# 6. Run benchmarks
npm run demo:bench-streaming   # Memory profile for 100K+ nodes
npm run demo:bench-traversal   # Dijkstra/A*/BiA* performance at scale

# 7. Clean up when done
npm run demo:down
```

> [!note]
> The demo is **idempotent** - running `demo:setup` multiple times will clean up and recreate the data.

**What the demo shows:**

- **Event Replay**: Reconstructs the full event history using `graph.traversal.ancestors()`
- **Event Sourcing**: Projects events into application state (users, carts, orders)
- **Branch Comparison**: Compares main branch vs cancelled-order branch
- **Path Finding**: Uses `graph.traversal.shortestPath()` to find paths between events
- **Topological Sort**: Shows dependency order with `graph.traversal.topologicalSort()`
- **Performance Comparison**: Shows O(1) bitmap index lookups vs git log (with speedup factors)
- **Index Inspector**: Visualizes shard distribution with ASCII charts
- **Lagrangian Pathfinding**: Resource-aware traversal using Dijkstra and A* with weighted costs
- **Streaming Benchmark**: Verifies constant memory overhead when iterating 100K+ nodes
- **Traversal Benchmark**: Compares Dijkstra, A*, and Bidirectional A* at scale

**Sample output:**

```text
[0148a1e4] UserCreated
           {"userId":"user-alice-001","email":"alice@example.com","name":"Alice"}

[6771a15f] CartCreated
           {"userId":"user-alice-001","cartId":"cart-001"}

[20744421] ItemAddedToCart
           {"cartId":"cart-001","sku":"WIDGET-001","qty":2,"price":29.99}
...

Shortest path from first to last event: 7 hops
Path: 0148a1e4 → 6771a15f → 20744421 → 6025e6ca → d2abe22c → fb285001 → c96d4e65 → d0583514
```

## Features

- **Invisible Storage**: No files are created in the working directory
- **Atomic Operations**: Leverages Git's reference updates for ACID guarantees
- **DAG Native**: Inherits Git's parent-child relationship model
- **High Performance**: O(1) lookups via sharded Roaring Bitmap indexes
- **Streaming First**: Handle millions of nodes without OOM via async generators
- **Security Hardened**: All refs validated, command injection prevention built-in

## API Reference

### `EmptyGraph`

#### `static async open({ persistence, ref, mode?, autoSync?, ... })`

Opens a managed graph with automatic durability guarantees. **This is the recommended way to create an EmptyGraph instance.**

**Parameters:**
- `persistence` (GitGraphAdapter): Adapter implementing `GraphPersistencePort` & `IndexStoragePort`
- `ref` (string): The ref to manage (e.g., `'refs/empty-graph/events'`)
- `mode` ('managed' | 'manual', optional): Durability mode. Defaults to `'managed'`
- `autoSync` ('onWrite' | 'manual', optional): When to sync refs. Defaults to `'onWrite'`
- `maxMessageBytes` (number, optional): Maximum message size. Defaults to 1MB
- `logger` (LoggerPort, optional): Logger for structured logging
- `clock` (ClockPort, optional): Clock for timing operations

**Returns:** `Promise<EmptyGraph>` - Configured graph instance

**Example:**
```javascript
const graph = await EmptyGraph.open({
  persistence,
  ref: 'refs/empty-graph/events',
  mode: 'managed',
});
```

#### `constructor({ persistence, clock?, healthCacheTtlMs? })`

Creates a new EmptyGraph instance (legacy API). Prefer `EmptyGraph.open()` for automatic durability.

**Parameters:**
- `persistence` (GitGraphAdapter): Adapter implementing `GraphPersistencePort` & `IndexStoragePort`
- `clock` (ClockPort, optional): Clock adapter for timing. Defaults to `PerformanceClockAdapter`
- `healthCacheTtlMs` (number, optional): Health check cache TTL in milliseconds. Defaults to `5000`

#### `async createNode({ message, parents = [], sign = false })`

Creates a new graph node as a Git commit.

**Parameters:**
- `message` (string): The node's message/data
- `parents` (string[]): Array of parent commit SHAs
- `sign` (boolean): Whether to GPG-sign the commit

**Returns:** `Promise<string>` - SHA of the created commit

**Example:**
```javascript
const sha = await graph.createNode({
  message: 'Node data',
  parents: ['abc123...', 'def456...']
});
```

#### `async createNodes(nodes)`

Creates multiple nodes in a single batch operation.

**Parameters:**
- `nodes` (array): Array of `{ message: string, parents?: string[] }` objects. Parents can use placeholder syntax: `$0`, `$1`, etc. to reference nodes created earlier in the same batch.

**Returns:** `Promise<string[]>` - Array of created SHAs in same order as input

**Validation:** All nodes are validated before any are created (fail-fast).

**Example:**
```javascript
// Create a chain
const [root, child, grandchild] = await graph.createNodes([
  { message: 'Root node' },
  { message: 'Child', parents: ['$0'] },
  { message: 'Grandchild', parents: ['$1'] },
]);

// Create a DAG with merge
const shas = await graph.createNodes([
  { message: 'Root' },
  { message: 'Branch A', parents: ['$0'] },
  { message: 'Branch B', parents: ['$0'] },
  { message: 'Merge', parents: ['$1', '$2'] },
]);
```

#### `beginBatch()`

Begins a batch operation for efficient bulk writes. Delays ref updates until `commit()` is called. **Requires managed mode.**

**Returns:** `GraphBatch` - A batch context

**Example:**
```javascript
const tx = graph.beginBatch();
const a = await tx.createNode({ message: 'Node A' });
const b = await tx.createNode({ message: 'Node B', parents: [a] });
const result = await tx.commit();  // Single ref update
console.log(result.count);  // 2
console.log(result.anchor); // SHA if anchor was created, undefined otherwise
```

#### `async sync(sha)`

Manually syncs the ref to make a node reachable. Only needed when `autoSync='manual'`.

**Parameters:**
- `sha` (string): The SHA to sync to the managed ref

**Returns:** `Promise<{ updated: boolean, anchor: boolean, sha: string }>`

**Throws:** `Error` if not in managed mode or sha is not provided

**Example:**
```javascript
const graph = await EmptyGraph.open({
  persistence,
  ref: 'refs/my-graph',
  mode: 'managed',
  autoSync: 'manual',
});

const sha = await graph.createNode({ message: 'My node' });
await graph.sync(sha);  // Explicitly make durable
```

#### `async anchor(ref, shas)`

Creates an anchor commit to make SHAs reachable from a ref. This is an advanced method for power users who want fine-grained control over ref management.

**Parameters:**
- `ref` (string): The ref to update
- `shas` (string | string[]): SHA(s) to anchor

**Returns:** `Promise<string>` - The anchor commit SHA

**Example:**
```javascript
// Anchor a single disconnected node
const anchorSha = await graph.anchor('refs/my-graph', nodeSha);

// Anchor multiple nodes at once
const anchorSha = await graph.anchor('refs/my-graph', [sha1, sha2, sha3]);
```

#### `async compactAnchors(ref?)`

Consolidates chained anchor commits into a single octopus anchor. Use this to clean up after many incremental writes that created disconnected roots.

**Parameters:**
- `ref` (string, optional): The ref to compact. Defaults to the managed ref.

**Returns:** `Promise<{ compacted: boolean, oldAnchors: number, tips: number }>`
- `compacted`: Whether compaction occurred
- `oldAnchors`: Number of anchor commits replaced
- `tips`: Number of real node tips in the new octopus anchor

**Example:**
```javascript
// After many incremental writes with disconnected roots
const result = await graph.compactAnchors();
console.log(`Replaced ${result.oldAnchors} anchors with 1 octopus anchor`);
console.log(`Now tracking ${result.tips} tips`);
```

See [docs/ANCHORING.md](./docs/ANCHORING.md) for details on when compaction is beneficial.

#### `async readNode(sha)`

Reads a node's message.

**Parameters:**
- `sha` (string): Commit SHA to read

**Returns:** `Promise<string>` - The node's message

**Example:**
```javascript
const message = await graph.readNode(childSha);
console.log(message); // "Second Entry"
```

#### `async getNode(sha)`

Returns the full GraphNode with all metadata.

**Parameters:**
- `sha` (string): Commit SHA to read

**Returns:** `Promise<GraphNode>` - Full node with sha, author, date, message, and parents

**Example:**
```javascript
const node = await graph.getNode(childSha);
console.log(node.sha);      // "abc123..."
console.log(node.author);   // "Alice <alice@example.com>"
console.log(node.date);     // "2026-01-29T12:00:00Z"
console.log(node.message);  // "Second Entry"
console.log(node.parents);  // ["def456..."]
```

#### `async hasNode(sha)`

Checks if a node exists in the graph.

**Parameters:**
- `sha` (string): Commit SHA to check

**Returns:** `Promise<boolean>` - True if the node exists

**Example:**
```javascript
const exists = await graph.hasNode('abc123...');
if (exists) {
  const node = await graph.getNode('abc123...');
}
```

#### `async countNodes(ref)`

Counts nodes reachable from a ref without loading all node data into memory.

**Parameters:**
- `ref` (string): Git ref to count from (HEAD, branch, SHA)

**Returns:** `Promise<number>` - Number of nodes reachable from the ref

**Example:**
```javascript
const count = await graph.countNodes('HEAD');
console.log(`Graph contains ${count} nodes`);
```

#### `async listNodes({ ref, limit = 50 })`

Lists nodes in history (for small graphs).

**Parameters:**
- `ref` (string): Git ref to start from (HEAD, branch, SHA)
- `limit` (number): Maximum nodes to return

**Returns:** `Promise<GraphNode[]>`

**Validation:**
- `ref` must match: `/^[a-zA-Z0-9_/-]+(\^|\~|\.\.|\.)*$/`
- `ref` cannot start with `-` or `--`

#### `async *iterateNodes({ ref, limit = 1000000 })`

Async generator for streaming large graphs.

**Parameters:**
- `ref` (string): Git ref to start from
- `limit` (number): Maximum nodes to yield

**Yields:** `GraphNode` instances

**Example:**
```javascript
// Process 10 million nodes without OOM
for await (const node of graph.iterateNodes({ ref: 'HEAD' })) {
  // Process each node
}
```

#### `async rebuildIndex(ref, options?)`

Rebuilds the bitmap index for fast O(1) parent/child lookups.

**Parameters:**
- `ref` (string): Git ref to rebuild the index from
- `options.limit` (number, optional): Maximum nodes to index (default: 10,000,000)

**Returns:** `Promise<string>` - OID of the created index tree

**Persistence:** Creates a Git tree containing sharded bitmap data (~3 files per active SHA prefix).

**Memory:** O(N) where N is number of nodes. Approximately 150-200MB for 1M nodes.

**Example:**
```javascript
const treeOid = await graph.rebuildIndex('HEAD');
// Store treeOid for later use with loadIndex()

// With custom limit
const limitedTreeOid = await graph.rebuildIndex('HEAD', { limit: 100000 });
```

#### `async loadIndex(treeOid)`

Loads a pre-built bitmap index for O(1) queries.

**Parameters:**
- `treeOid` (string): OID of the index tree (from `rebuildIndex()`)

**Returns:** `Promise<void>`

**Memory:** Lazy loading - shards are loaded on-demand. Initial overhead is minimal (~50KB).

**Example:**
```javascript
const treeOid = await graph.rebuildIndex('HEAD');
await graph.loadIndex(treeOid);
// Now getParents() and getChildren() are available
```

#### `async getParents(sha)`

Gets parent SHAs for a node using the bitmap index. Requires `loadIndex()` to be called first.

**Parameters:**
- `sha` (string): The node's SHA

**Returns:** `Promise<string[]>` - Array of parent SHAs

**Throws:** `Error` if index is not loaded

**Example:**
```javascript
await graph.loadIndex(indexOid);
const parents = await graph.getParents(childSha);
console.log(parents); // ['abc123...', 'def456...']
```

#### `async getChildren(sha)`

Gets child SHAs for a node using the bitmap index. Requires `loadIndex()` to be called first.

**Parameters:**
- `sha` (string): The node's SHA

**Returns:** `Promise<string[]>` - Array of child SHAs

**Throws:** `Error` if index is not loaded

**Example:**
```javascript
await graph.loadIndex(indexOid);
const children = await graph.getChildren(parentSha);
console.log(children); // ['abc123...']
```

### Graph Traversal

The `graph.traversal` service provides graph traversal algorithms for exploring node relationships. Requires a loaded index (call `loadIndex()` first).

#### `async *bfs({ start, maxDepth?, maxNodes?, direction? })`

Breadth-first traversal from a starting node.

**Example:**
```javascript
// BFS traversal
for await (const node of graph.traversal.bfs({ start: sha, maxDepth: 5 })) {
  console.log(node.sha, node.depth, node.parent);
}
```

#### `async *dfs({ start, maxDepth?, maxNodes?, direction? })`

Depth-first traversal from a starting node.

**Example:**
```javascript
// DFS traversal
for await (const node of graph.traversal.dfs({ start: sha })) {
  console.log(node.sha);
}
```

#### `async *ancestors({ sha, maxDepth?, maxNodes? })`

Find all ancestors of a node (follows parent edges).

**Example:**
```javascript
// Find all ancestors
for await (const node of graph.traversal.ancestors({ sha })) {
  console.log(node.sha);
}
```

#### `async *descendants({ sha, maxDepth?, maxNodes? })`

Find all descendants of a node (follows child edges).

**Example:**
```javascript
// Find all descendants
for await (const node of graph.traversal.descendants({ sha })) {
  console.log(node.sha);
}
```

#### `async findPath({ from, to, maxDepth?, maxNodes? })`

Find any path between two nodes.

**Returns:** `Promise<{ found: boolean, path: string[] }>`

**Example:**
```javascript
// Find any path between nodes
const result = await graph.traversal.findPath({ from: a, to: b });
if (result.found) console.log(result.path); // ['a', 'x', 'y', 'b']
```

#### `async shortestPath({ from, to, maxDepth?, maxNodes? })`

Find the shortest path between two nodes using bidirectional BFS (unweighted).

**Returns:** `Promise<{ found: boolean, path: string[], length: number }>`

**Example:**
```javascript
// Find shortest path (bidirectional BFS)
const shortest = await graph.traversal.shortestPath({ from: a, to: b });
console.log(shortest.path, shortest.length);
```

#### `async weightedShortestPath({ from, to, weightProvider?, direction? })`

Find the shortest path using Dijkstra's algorithm with custom edge weights.

**Parameters:**
- `from` (string): Starting SHA
- `to` (string): Target SHA
- `weightProvider` (function, optional): `async (fromSha, toSha) => number`. Defaults to `() => 1`
- `direction` ('children' | 'parents', optional): Traversal direction. Defaults to `'children'`

**Returns:** `Promise<{ path: string[], totalCost: number }>`

**Example:**
```javascript
// Lagrangian pathfinding with resource-weighted edges
const { path, totalCost } = await graph.traversal.weightedShortestPath({
  from: startSha,
  to: targetSha,
  weightProvider: async (from, to) => {
    const message = await graph.readNode(to);
    const event = JSON.parse(message);
    const cpu = event.payload?.metrics?.cpu ?? 1;
    const mem = event.payload?.metrics?.mem ?? 1;
    return cpu * 1.0 + mem * 1.5; // Lagrangian cost
  }
});
```

#### `async aStarSearch({ from, to, weightProvider?, heuristicProvider?, direction? })`

Find the shortest path using A* algorithm with heuristic guidance.

**Parameters:**
- `from` (string): Starting SHA
- `to` (string): Target SHA
- `weightProvider` (function, optional): `async (fromSha, toSha) => number`. Defaults to `() => 1`
- `heuristicProvider` (function, optional): `(sha, targetSha) => number`. Defaults to `() => 0` (becomes Dijkstra)
- `direction` ('children' | 'parents', optional): Traversal direction. Defaults to `'children'`

**Returns:** `Promise<{ path: string[], totalCost: number, nodesExplored: number }>`

**Example:**
```javascript
// A* with heuristic for faster pathfinding
const { path, totalCost, nodesExplored } = await graph.traversal.aStarSearch({
  from: startSha,
  to: targetSha,
  weightProvider: async (from, to) => getCost(to),
  heuristicProvider: (sha, target) => estimateDistance(sha, target)
});
console.log(`Explored ${nodesExplored} nodes`);
```

#### `async bidirectionalAStar({ from, to, weightProvider?, forwardHeuristic?, backwardHeuristic? })`

Bidirectional A* search that meets in the middle from both ends.

**Parameters:**
- `from` (string): Starting SHA
- `to` (string): Target SHA
- `weightProvider` (function, optional): `async (fromSha, toSha) => number`
- `forwardHeuristic` (function, optional): `(sha, targetSha) => number` for forward search
- `backwardHeuristic` (function, optional): `(sha, targetSha) => number` for backward search

**Returns:** `Promise<{ path: string[], totalCost: number, nodesExplored: number }>`

**Example:**
```javascript
// Bidirectional A* for large graphs
const result = await graph.traversal.bidirectionalAStar({
  from: startSha,
  to: targetSha,
  forwardHeuristic: (sha, target) => estimate(sha, target),
  backwardHeuristic: (sha, target) => estimate(sha, target)
});
```

#### `async isReachable({ from, to, maxDepth?, maxNodes? })`

Check if one node can reach another.

**Returns:** `Promise<boolean>`

**Example:**
```javascript
// Check reachability
const canReach = await graph.traversal.isReachable({ from: a, to: b });
```

#### `async commonAncestors({ shas, maxDepth?, maxNodes? })`

Find common ancestors of multiple nodes.

**Returns:** `Promise<string[]>` - Array of common ancestor SHAs

**Example:**
```javascript
// Find common ancestors of multiple nodes
const common = await graph.traversal.commonAncestors({ shas: [a, b, c] });
```

#### `async *topologicalSort({ start, maxDepth?, maxNodes? })`

Topological sort starting from a node (dependencies before dependents).

**Example:**
```javascript
// Topological sort
for await (const node of graph.traversal.topologicalSort({ start: sha })) {
  console.log(node.sha); // Dependencies before dependents
}
```

### Cancellation Support

Long-running operations can be cancelled using `AbortSignal`:

```javascript
import EmptyGraph, { createTimeoutSignal, OperationAbortedError } from '@git-stunts/empty-graph';

// With manual AbortController
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000); // Cancel after 5s

try {
  for await (const node of graph.iterateNodes({ ref: 'HEAD', signal: controller.signal })) {
    // Process nodes...
  }
} catch (err) {
  if (err instanceof OperationAbortedError) {
    console.log('Operation cancelled');
  }
}

// With timeout signal (auto-aborts after duration)
const treeOid = await graph.rebuildIndex('HEAD', {
  signal: createTimeoutSignal(30000) // 30 second timeout
});
```

#### Traversal Options

| Option | Default | Description |
| -------- | --------- | ------------- |
| `maxNodes` | 100000 | Maximum number of nodes to visit |
| `maxDepth` | 1000 | Maximum traversal depth |
| `direction` | `'forward'` | Traversal direction: `'forward'` or `'reverse'` for `bfs`/`dfs`; `'children'` or `'parents'` for weighted algorithms (`weightedShortestPath`, `aStarSearch`). |

All traversal generators are async and memory-efficient, suitable for large graphs with millions of nodes.

#### `hasIndex`

Property that indicates whether an index is currently loaded.

**Returns:** `boolean`

**Example:**
```javascript
if (!graph.hasIndex) {
  await graph.loadIndex(savedTreeOid);
}
```

#### `indexOid`

Property that returns the current index tree OID.

**Returns:** `string | null`

#### `async saveIndex(ref?)`

Saves the current index OID to a git ref for persistence across sessions.

**Parameters:**
- `ref` (string, optional): The ref name (default: `'refs/empty-graph/index'`)

**Returns:** `Promise<void>`

**Throws:** `Error` if no index has been built or loaded

**Example:**
```javascript
await graph.rebuildIndex('HEAD');
await graph.saveIndex(); // Persists to refs/empty-graph/index
```

#### `async loadIndexFromRef(ref?)`

Loads the index from a previously saved git ref.

**Parameters:**
- `ref` (string, optional): The ref name (default: `'refs/empty-graph/index'`)

**Returns:** `Promise<boolean>` - True if loaded, false if ref doesn't exist

**Example:**
```javascript
// On application startup
const loaded = await graph.loadIndexFromRef();
if (!loaded) {
  await graph.rebuildIndex('HEAD');
  await graph.saveIndex();
}
const parents = await graph.getParents(someSha);
```

#### `async getHealth()`

Gets detailed health information for all components.

**Returns:** `Promise<HealthResult>` - Health status with component breakdown

**HealthResult:**
- `status` ('healthy' | 'degraded' | 'unhealthy'): Overall health
- `components.repository`: Repository health with `status` and `latencyMs`
- `components.index`: Index health with `status`, `loaded`, and `shardCount`
- `cachedAt` (string, optional): ISO timestamp if result is cached

Results are cached for the configured TTL (default: 5 seconds).

**Example:**
```javascript
const health = await graph.getHealth();
console.log(health.status); // 'healthy' | 'degraded' | 'unhealthy'
console.log(health.components.repository.latencyMs); // e.g., 1.23
```

#### `async isReady()`

K8s-style readiness probe: Can the service serve requests?

**Returns:** `Promise<boolean>` - True if all critical components are healthy

Use this for Kubernetes readiness probes. A `false` result removes the pod from the load balancer.

**Example:**
```javascript
// Express health endpoint
app.get('/ready', async (req, res) => {
  const ready = await graph.isReady();
  res.status(ready ? 200 : 503).json({ ready });
});
```

#### `async isAlive()`

K8s-style liveness probe: Is the service running?

**Returns:** `Promise<boolean>` - True if the repository is accessible

Use this for Kubernetes liveness probes. A `false` result typically triggers a container restart.

**Example:**
```javascript
// Express health endpoint
app.get('/alive', async (req, res) => {
  const alive = await graph.isAlive();
  res.status(alive ? 200 : 503).json({ alive });
});
```

### `GraphNode`

Immutable entity representing a graph node.

**Properties:**
- `sha` (string): Commit SHA
- `author` (string): Author name
- `date` (string): Commit date
- `message` (string): Node message/data
- `parents` (string[]): Array of parent SHAs

## Working with the Bitmap Index

The bitmap index enables O(1) parent/child lookups for large graphs. Here's the complete workflow:

```javascript
import GitPlumbing from '@git-stunts/plumbing';
import EmptyGraph, { GitGraphAdapter } from '@git-stunts/empty-graph';

// Setup
const plumbing = new GitPlumbing({ cwd: './my-graph-db' });
const persistence = new GitGraphAdapter({ plumbing });
const graph = new EmptyGraph({ persistence });

// === First-time setup: Build and persist the index ===
const treeOid = await graph.rebuildIndex('HEAD');
await graph.saveIndex();  // Persists to refs/empty-graph/index
console.log(`Index built: ${treeOid}`);

// === Subsequent runs: Load the persisted index ===
const loaded = await graph.loadIndexFromRef();
if (!loaded) {
  // Index doesn't exist yet, rebuild it
  await graph.rebuildIndex('HEAD');
  await graph.saveIndex();
}

// === Query parent/child relationships (O(1)) ===
const parents = await graph.getParents(someSha);
const children = await graph.getChildren(someSha);

console.log(`Node ${someSha} has:`);
console.log(`  ${parents.length} parents:`, parents);
console.log(`  ${children.length} children:`, children);
```

**How it works internally:**

1. `rebuildIndex()` walks the graph and builds sharded bitmap files:
   - `meta_XX.json` - Maps SHAs to numeric IDs (sharded by SHA prefix)
   - `shards_fwd_XX.json` - Forward edges (parent → children)
   - `shards_rev_XX.json` - Reverse edges (child → parents)

2. `loadIndex()` sets up lazy loading - shards are fetched on-demand:
   ```javascript
   // When you call getParents('abcd1234...')
   // Only loads: meta_ab.json, shards_rev_ab.json
   // Other shards remain unloaded until needed
   ```

3. `saveIndex()` / `loadIndexFromRef()` persist the index tree OID to a git ref for reuse across sessions.

## Choosing the Right Method

| Scenario | Method | Reason |
| ---------- | -------- | -------- |
| < 1,000 nodes | `listNodes()` | Returns array, easier to work with |
| > 1,000 nodes | `iterateNodes()` | Streams results, constant memory |
| Single node lookup | `readNode()` | O(1) direct access |
| Find parents/children | `getParents()` / `getChildren()` | O(1) with bitmap index |

```javascript
// Example: Processing small graphs
const recentNodes = await graph.listNodes({ ref: 'HEAD', limit: 100 });
recentNodes.forEach(node => console.log(node.message));

// Example: Processing large graphs (memory-safe)
for await (const node of graph.iterateNodes({ ref: 'HEAD' })) {
  await processNode(node); // Handle millions of nodes without OOM
}

// Example: O(1) relationship queries with bitmap index
const treeOid = await graph.rebuildIndex('HEAD');
await graph.loadIndex(treeOid);
const parents = await graph.getParents(someSha);
const children = await graph.getChildren(someSha);
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Create Node | O(1) | Constant time commit creation |
| Read Node | O(1) | Direct SHA lookup |
| List Nodes (small) | O(n) | Linear scan up to limit |
| Iterate Nodes (large) | O(n) | Streaming, constant memory |
| Bitmap Index Lookup | O(1) | With `BitmapIndexService` |

## Memory Considerations

The `BitmapIndexReader` caches all SHA-to-ID mappings in memory for O(1) lookups. Each entry consumes approximately 40 bytes (SHA string + numeric ID). For a graph with 10 million nodes, this equates to roughly 400MB of memory.

A warning is logged when the cache exceeds 1 million entries to help identify memory pressure early. For very large graphs (>10M nodes), consider:
- Pagination strategies to limit active working sets
- External indexing solutions (Redis, SQLite)
- Periodic index rebuilds to remove unreachable nodes

## Multi-Writer API (WARP v4)

EmptyGraph supports multi-writer convergent graphs via the WARP protocol. Multiple writers can independently create patches that deterministically merge.

### Quick Start

```javascript
import { EmptyGraph, GitGraphAdapter } from '@git-stunts/empty-graph';
import Plumbing from '@git-stunts/plumbing';

// Setup
const plumbing = new Plumbing({ cwd: '/path/to/repo' });
const persistence = new GitGraphAdapter({ plumbing });

// Open multi-writer graph
const graph = await EmptyGraph.openMultiWriter({
  persistence,
  graphName: 'my-graph',
  writerId: 'writer-1',
});

// Create a patch with graph mutations
await graph.createPatch()
  .addNode('user:alice')
  .setProperty('user:alice', 'name', 'Alice')
  .addEdge('user:alice', 'group:admins', 'member-of')
  .commit();

// Materialize current state (merges all writers)
const state = await graph.materialize();

// Create checkpoint for fast recovery
const checkpointSha = await graph.createCheckpoint();

// Later: materialize incrementally from checkpoint
const state2 = await graph.materializeAt(checkpointSha);
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Writer** | Independent actor with unique ID. Each writer has its own patch chain. |
| **Patch** | Atomic batch of graph operations from a single writer. |
| **EventId** | Tuple `(lamport, writerId, patchSha, opIndex)` for total ordering. |
| **Frontier** | Map of `writerId → lastPatchSha` representing processed state. |
| **Checkpoint** | Snapshot of materialized state for fast recovery. |

### Conflict Resolution

WARP uses Last-Writer-Wins (LWW) semantics. When two writers modify the same entity:
- Higher Lamport timestamp wins
- Same timestamp: lexicographically greater writerId wins
- Same writerId: greater patchSha wins

This guarantees **deterministic convergence** - all replicas reach identical state.

### Multi-Writer Example

```javascript
// Writer 1 (on machine A)
const alice = await EmptyGraph.openMultiWriter({
  persistence, graphName: 'shared', writerId: 'alice'
});
await alice.createPatch().addNode('doc:1').commit();

// Writer 2 (on machine B)
const bob = await EmptyGraph.openMultiWriter({
  persistence, graphName: 'shared', writerId: 'bob'
});
await bob.createPatch().addNode('doc:2').commit();

// After git sync, either writer can materialize combined state
const writers = await alice.discoverWriters(); // ['alice', 'bob']
const state = await alice.materialize(); // Contains doc:1 and doc:2
```

### API Reference

#### `EmptyGraph.openMultiWriter(options)`
Opens a multi-writer graph.
- `options.persistence` - GitGraphAdapter instance
- `options.graphName` - Graph namespace (allows multiple graphs per repo)
- `options.writerId` - Unique identifier for this writer

#### `graph.createPatch()`
Returns a `PatchBuilder` for fluent patch construction.
- `.addNode(nodeId)` - Add a node
- `.removeNode(nodeId)` - Tombstone a node
- `.addEdge(from, to, label)` - Add an edge
- `.removeEdge(from, to, label)` - Tombstone an edge
- `.setProperty(nodeId, key, value)` - Set a property
- `.commit()` - Commit the patch, returns SHA

#### `graph.materialize()`
Reduces all patches from all writers to current state.

#### `graph.materializeAt(checkpointSha)`
Incrementally materializes from a checkpoint.

#### `graph.createCheckpoint()`
Creates a checkpoint of current state. Returns checkpoint SHA.

#### `graph.syncCoverage()`
Creates octopus anchor ensuring all writers are reachable from single ref.

#### `graph.discoverWriters()`
Returns sorted array of all writer IDs.

## Architecture

EmptyGraph follows hexagonal architecture (ports & adapters):

```mermaid
flowchart TD
  EG[EmptyGraph<br/>(Facade)]
  GS[GraphService<br/>(Domain)]
  IRS[IndexRebuildService<br/>(Domain)]
  GPP[GraphPersistencePort<br/>(Port)]
  ISP[IndexStoragePort<br/>(Port)]
  GGA[GitGraphAdapter<br/>(Adapter)]
  PL[@git-stunts/plumbing]

  EG --> GS
  EG --> IRS
  GS --> GPP
  GS --> ISP
  IRS --> ISP
  GPP --> GGA
  ISP --> GGA
  GGA --> PL
```

**Key Components:**

| Layer | Component | Responsibility |
| --- | --- | --- |
| Facade | `EmptyGraph` | Simplified public API |
| Domain | `GraphService` | Node CRUD operations |
| Domain | `IndexRebuildService` | Index building orchestration |
| Domain | `BitmapIndexBuilder` | Pure in-memory index construction |
| Domain | `BitmapIndexReader` | O(1) index queries |
| Domain | `HealthCheckService` | K8s-style health probes |
| Port | `GraphPersistencePort` | Graph storage contract |
| Port | `IndexStoragePort` | Index storage contract |
| Port | `ClockPort` | High-resolution timing abstraction |
| Adapter | `GitGraphAdapter` | Git implementation of both ports |
| Adapter | `PerformanceClockAdapter` | Node.js clock (uses `perf_hooks`) |
| Adapter | `GlobalClockAdapter` | Bun/Deno/Browser clock (uses global `performance`) |

## Error Handling

Common errors and solutions:

### Invalid Ref Format
```javascript
// Error: Invalid ref format: --upload-pack
// Solution: Refs must be alphanumeric, /, -, _, ^, ~, or .
const nodes = await graph.listNodes({ ref: 'main' });
```

### GraphNode Validation Error
```javascript
// Error: GraphNode requires a valid sha string
// Solution: Ensure createNode returned a valid SHA
const sha = await graph.createNode({ message: 'data' });
const message = await graph.readNode(sha);
```

### Ref Too Long
```javascript
// Error: Ref too long: 2048 chars. Maximum is 1024
// Solution: Use shorter branch names or commit SHAs
const nodes = await graph.listNodes({ ref: 'abc123def' }); // Use SHA instead
```

### Invalid OID Format
```javascript
// Error: Invalid OID format: not-a-valid-sha
// Solution: OIDs must be 4-64 hexadecimal characters
const message = await graph.readNode('abc123def456'); // Valid short SHA
```

## Security

- **Ref Validation**: All refs validated against strict patterns to prevent injection
- **OID Validation**: All Git object IDs validated against `/^[0-9a-fA-F]{4,64}$/`
- **Length Limits**: Refs cannot exceed 1024 characters, OIDs cannot exceed 64 characters
- **No Arbitrary Commands**: Only whitelisted Git plumbing commands
- **Delimiter Safety**: Uses ASCII Record Separator (`\x1E`) to prevent message collision
- **Streaming Only**: No unbounded memory usage
- **UTF-8 Safe**: Streaming decoder handles multibyte characters across chunk boundaries

See [SECURITY.md](./SECURITY.md) for details.

## Development Setup

### Git Hooks

This project uses custom git hooks (no husky). To enable pre-commit linting:

```bash
npm run setup:hooks
```

This configures git to use the hooks in `scripts/hooks/`.
- `pre-commit` runs ESLint on staged JavaScript files.
- `pre-push` runs lint, unit tests, benchmarks, and the Docker bats CLI suite.

To bypass the hook temporarily (not recommended):
```bash
git commit --no-verify
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

Apache-2.0 © 2026 by James Ross

---

## AIΩN Foundations Series

This project is part of the [AIΩN Foundations Series](https://github.com/flyingrobots/aion/)—a reference implementation of WARP (Worldline Algebra for Recursive Provenance) graphs. empty-graph is the Git-native, JavaScript implementation: accessible, distributed, and built on CRDTs for coordination-free multi-writer collaboration.

---

<p align="center">

<sub>Built by <a href="https://github.com/flyingrobots">FLYING•ROBOTS</a></sub>

</p>
