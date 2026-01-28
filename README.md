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

## API Reference

### `EmptyGraph`

#### `constructor({ persistence })`

Creates a new EmptyGraph instance.

**Parameters:**
- `persistence` (GitGraphAdapter): Adapter implementing `GraphPersistencePort` & `IndexStoragePort`

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
| Port | `GraphPersistencePort` | Graph storage contract |
| Port | `IndexStoragePort` | Index storage contract |
| Adapter | `GitGraphAdapter` | Git implementation of both ports |

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
