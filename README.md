# @git-stunts/empty-graph

[![CI](https://github.com/git-stunts/empty-graph/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/empty-graph/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://badge.fury.io/js/%40git-stunts%2Fempty-graph.svg)](https://www.npmjs.com/package/@git-stunts/empty-graph)

A graph database where every node is a Git commit pointing to the "Empty Tree."

## Why EmptyGraph?

Git is usually used to track files. `EmptyGraph` subverts this by using Git's Directed Acyclic Graph (DAG) to store structured data *in the commits themselves*.

Because all commits point to the "Empty Tree" (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`), your data does not exist as files in the working directory—it exists entirely within the Git object database.

## Features

- **Invisible Storage**: No files are created in the working directory
- **Atomic Operations**: Leverages Git's reference updates for ACID guarantees
- **DAG Native**: Inherits Git's parent-child relationship model
- **High Performance**: O(1) lookups via sharded Roaring Bitmap indexes
- **Streaming First**: Handle millions of nodes without OOM via async generators
- **Security Hardened**: All refs validated, command injection prevention built-in

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

# 5. Clean up when done
npm run demo:down
```

The demo is **idempotent** - running `demo:setup` multiple times will clean up and recreate the data.

**What the demo shows:**

- **Event Replay**: Reconstructs the full event history using `graph.traversal.ancestors()`
- **Event Sourcing**: Projects events into application state (users, carts, orders)
- **Branch Comparison**: Compares main branch vs cancelled-order branch
- **Path Finding**: Uses `graph.traversal.shortestPath()` to find paths between events
- **Topological Sort**: Shows dependency order with `graph.traversal.topologicalSort()`
- **Performance Comparison**: Shows O(1) bitmap index lookups vs git log (with speedup factors)
- **Index Inspector**: Visualizes shard distribution with ASCII charts

**Sample output:**

```
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

## Choosing the Right Method

| Scenario | Method | Reason |
|----------|--------|--------|
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
const treeOid = await graph.rebuildIndex('HEAD', { limit: 100000 });
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

Find the shortest path between two nodes using bidirectional BFS.

**Returns:** `Promise<{ found: boolean, path: string[], length: number }>`

**Example:**
```javascript
// Find shortest path (bidirectional BFS)
const shortest = await graph.traversal.shortestPath({ from: a, to: b });
console.log(shortest.path, shortest.length);
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

#### Traversal Options

| Option | Default | Description |
|--------|---------|-------------|
| `maxNodes` | 100000 | Maximum number of nodes to visit |
| `maxDepth` | 1000 | Maximum traversal depth |
| `direction` | `'forward'` | Traversal direction: `'forward'` (children) or `'reverse'` (parents). For `bfs`/`dfs` only. |

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

```text
┌─────────────────────────────────────────────┐
│         EmptyGraph (Facade)                 │
└────────────────┬────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      │                     │
┌─────▼──────┐    ┌────────▼─────────┐
│ GraphService│    │IndexRebuildService│
│  (Domain)   │    │    (Domain)      │
└─────┬──────┘    └────────┬─────────┘
      │                     │
      │    ┌────────────────┤
      │    │                │
┌─────▼────▼───┐    ┌──────▼────────┐
│GraphPersistence│   │IndexStoragePort│
│    Port       │   │    (Port)      │
└─────┬────────┘    └──────┬────────┘
      │                     │
┌─────▼─────────────────────▼─────────┐
│     GitGraphAdapter (Adapter)       │
└──────────────┬──────────────────────┘
               │
     ┌─────────▼──────────┐
     │ @git-stunts/plumbing│
     └────────────────────┘
```

**Key Components:**

| Layer | Component | Responsibility |
|-------|-----------|----------------|
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
// ❌ Error: Invalid ref format: --upload-pack
// ✅ Solution: Refs must be alphanumeric, /, -, _, ^, ~, or .
const nodes = await graph.listNodes({ ref: 'main' });
```

### GraphNode Validation Error
```javascript
// ❌ Error: GraphNode requires a valid sha string
// ✅ Solution: Ensure createNode returned a valid SHA
const sha = await graph.createNode({ message: 'data' });
const message = await graph.readNode(sha);
```

### Ref Too Long
```javascript
// ❌ Error: Ref too long: 2048 chars. Maximum is 1024
// ✅ Solution: Use shorter branch names or commit SHAs
const nodes = await graph.listNodes({ ref: 'abc123def' }); // Use SHA instead
```

### Invalid OID Format
```javascript
// ❌ Error: Invalid OID format: not-a-valid-sha
// ✅ Solution: OIDs must be 4-64 hexadecimal characters
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

## Use Cases

- **Event Sourcing**: Store events as commits, traverse history
- **Knowledge Graphs**: Build semantic networks with Git's DAG
- **Blockchain-like**: Immutable, cryptographically verified data structures
- **Distributed Databases**: Leverage Git's sync/merge capabilities
- **Audit Trails**: Every change is a commit with author/timestamp

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

Apache-2.0 © James Ross
