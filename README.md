# @git-stunts/empty-graph

[![CI](https://github.com/git-stunts/empty-graph/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/empty-graph/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://badge.fury.io/js/%40git-stunts%2Fempty-graph.svg)](https://www.npmjs.com/package/@git-stunts/empty-graph)

> *A **graph database that lives inside Git**. Stores data invisibly (no files) within Git commits using the **empty-tree pattern***.

## Key highlights:

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

### When EmptyGraph Makes Sense

#### You need offline-first graph data.

Git works without a network. Clone the repo, query locally, sync when you reconnect. Perfect for edge computing, field work, or airplane mode.

#### You want Git-native replication.

Your graph automatically inherits Git's distributed model. Fork it. Push to multiple remotes. Merge branches of graph data (carefully). No separate replication infrastructure.

#### Your graph is append-mostly.

Git loves immutable data. Add nodes, add edges, never delete? Perfect fit. *The reflog even lets you recover "deleted" nodes.*

#### You're already in a Git ecosystem.

If your workflow is Git-centric (CI/CD, GitOps, infrastructure-as-code), adding a graph that lives in Git means one less system to manage.

#### You need an audit trail for free.

Every mutation is a commit. `git log` is your audit log. `git blame` tells you when a node was added. `git bisect` can find when a relationship broke.

#### The graph is small-to-medium (< 10M nodes).

The bitmap index handles millions of nodes comfortably. At 1M nodes, you're looking at ~150-200MB of index data. That's fine.

#### You value simplicity over features.

No query language to learn. No cluster to manage. No connection pools. It's just JavaScript and Git.

### When EmptyGraph Is A Bad Idea

You should probably consider a more legit and powerful solution if:

#### You need ACID transactions.

Git commits are atomic, but there's no rollback, no isolation levels, no multi-statement transactions. If you need "transfer money from A to B" semantics, *please* use a real database.

#### You need real-time updates.

Git has no pubsub. No change streams. No WebSocket notifications. Polling `git fetch` is your only option, and it's not fast.

#### You need complex queries.

"Find all users who bought product X and also reviewed product Y in the last 30 days" - this requires a query planner, indexes, and probably Cypher or Gremlin. EmptyGraph gives you raw traversal primitives, not a query language (... *yet*).

#### Your graph is write-heavy.

Every write is a `git commit-tree` + `git commit`. That's fast, but not "10,000 writes per second" fast. Write-heavy workloads need a database that is designed for writes.

#### You need to delete data (for real).

GDPR "right to be forgotten"? Git's immutability works against you. Yes, you can rewrite history with `git filter-branch`, but it's painful and breaks every clone.

#### The graph is huge (> 100M nodes).

At some point, you're fighting Git's assumptions. Pack files get unwieldy. Index shards multiply. Clone times become brutal. Neo4j, DGraph, or TigerGraph exist for a reason.

#### You need fine-grained access control.

Git repos are all-or-nothing. Either you can clone it or you can't. There's no "user A can see nodes 1-100 but not 101-200." If you need row-level security, look elsewhere.

> [!note]
> There *is* a trick to accomplish this, and I'll post it in a blog post sometime. You can run a [git startgate](https://github.com/flyingrobots/git-stargate) that uses git receive hooks + encryption to achieve "distributed opaque data", but it's too hacky to include in this project and you might want to question why you want to have private data live in git in the first place.

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

## Quick Start

```javascript
import GitPlumbing from '@git-stunts/plumbing';
import EmptyGraph, { GitGraphAdapter } from '@git-stunts/empty-graph';

// Create the persistence adapter
const plumbing = new GitPlumbing({ cwd: './my-db' });
const persistence = new GitGraphAdapter({ plumbing });

// Create the graph with injected adapter
const graph = new EmptyGraph({ persistence });

// Create a node (commit)
const parentSha = await graph.createNode({ message: 'First Entry' });

// Create a child node
const childSha = await graph.createNode({
  message: 'Second Entry',
  parents: [parentSha]
});

// Read data
const message = await graph.readNode(childSha);

// List linear history (small graphs)
const nodes = await graph.listNodes({ ref: childSha, limit: 50 });

// Stream large graphs (millions of nodes)
for await (const node of graph.iterateNodes({ ref: childSha })) {
  console.log(node.message);
}
```

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

#### `constructor({ persistence, clock?, healthCacheTtlMs? })`

Creates a new EmptyGraph instance.

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

This configures git to use the hooks in `scripts/hooks/`. The pre-commit hook runs ESLint on staged JavaScript files.

To bypass the hook temporarily (not recommended):
```bash
git commit --no-verify
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

Apache-2.0 © James Ross
