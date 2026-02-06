/**
 * @git-stunts/git-warp - A graph database where every node is a Git commit pointing to the Empty Tree.
 */

/**
 * Result of a ping health check.
 */
export interface PingResult {
  /** Whether the ping succeeded */
  ok: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
}

/**
 * Health status of a repository component.
 */
export interface RepositoryHealth {
  /** Repository status */
  status: 'healthy' | 'unhealthy';
  /** Ping latency in milliseconds */
  latencyMs: number;
}

/**
 * Health status of the index component.
 */
export interface IndexHealth {
  /** Index status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Whether an index is loaded */
  loaded: boolean;
  /** Number of shards (if loaded) */
  shardCount?: number;
}

/**
 * Complete health check result.
 */
export interface HealthResult {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Component health breakdown */
  components: {
    /** Repository health */
    repository: RepositoryHealth;
    /** Index health */
    index: IndexHealth;
  };
  /** ISO timestamp if result is cached */
  cachedAt?: string;
}

/**
 * Health status constants.
 */
export const HealthStatus: {
  readonly HEALTHY: 'healthy';
  readonly DEGRADED: 'degraded';
  readonly UNHEALTHY: 'unhealthy';
};

/**
 * Options for creating a new graph node.
 */
export interface CreateNodeOptions {
  /** The node's message/data */
  message: string;
  /** Array of parent commit SHAs */
  parents?: string[];
  /** Whether to GPG-sign the commit */
  sign?: boolean;
}

/**
 * Specification for a node to be created in bulk.
 * Parents can include placeholder references like '$0', '$1' to reference
 * nodes created earlier in the same batch (by their array index).
 */
export interface BulkNodeSpec {
  /** The node's message/data */
  message: string;
  /** Array of parent commit SHAs or placeholder references ('$0', '$1', etc.) */
  parents?: string[];
}

/**
 * Options for listing nodes.
 */
export interface ListNodesOptions {
  /** Git ref to start from (HEAD, branch, SHA) */
  ref: string;
  /** Maximum nodes to return (default: 50) */
  limit?: number;
}

/**
 * Options for iterating nodes.
 */
export interface IterateNodesOptions {
  /** Git ref to start from */
  ref: string;
  /** Maximum nodes to yield (default: 1000000) */
  limit?: number;
  /** Optional AbortSignal for cancellation support */
  signal?: AbortSignal;
}

/**
 * Options for rebuilding the index.
 */
export interface RebuildOptions {
  /** Maximum nodes to process (default: 10000000, max: 10000000) */
  limit?: number;
  /** Enable streaming mode with this memory threshold in bytes */
  maxMemoryBytes?: number;
  /** Optional AbortSignal for cancellation support */
  signal?: AbortSignal;
  /** Callback invoked on each flush (streaming mode only) */
  onFlush?: (info: { flushedBytes: number; totalFlushedBytes: number; flushCount: number }) => void;
  /** Callback invoked periodically during processing */
  onProgress?: (info: { processedNodes: number; currentMemoryBytes: number | null }) => void;
}

/**
 * Options for loading a previously built index.
 */
export interface LoadOptions {
  /** Enable strict integrity verification (fail-closed). Default: true */
  strict?: boolean;
  /** Frontier to compare for staleness (maps writer IDs to their current tip SHAs) */
  currentFrontier?: Map<string, string>;
  /** Auto-rebuild when a stale index is detected. Requires rebuildRef. Default: false */
  autoRebuild?: boolean;
  /** Git ref to rebuild from when autoRebuild is true */
  rebuildRef?: string;
}

/**
 * Direction for graph traversal.
 */
export type TraversalDirection = 'forward' | 'reverse';

/**
 * Node yielded during graph traversal.
 */
export interface TraversalNode {
  /** The node's SHA */
  sha: string;
  /** Distance from start node */
  depth: number;
  /** SHA of the node that led to this one, or null for start */
  parent: string | null;
}

/**
 * Result of a path-finding operation.
 */
export interface PathResult {
  /** Whether a path was found */
  found: boolean;
  /** Array of SHAs from source to target (empty if not found) */
  path: string[];
  /** Path length (-1 if not found) */
  length: number;
}

/**
 * Snapshot of a node passed into query predicates.
 */
export interface QueryNodeSnapshot {
  id: string;
  props: Record<string, unknown>;
  edgesOut: Array<{ label: string; to: string }>;
  edgesIn: Array<{ label: string; from: string }>;
}

/**
 * Query result (standard).
 */
export interface QueryResultV1 {
  stateHash: string;
  nodes: Array<{
    id?: string;
    props?: Record<string, unknown>;
  }>;
}

/**
 * Aggregation specification for query results.
 */
export interface AggregateSpec {
  /** Count matched nodes */
  count?: boolean;
  /** Sum a numeric property (dot-notation path, e.g. 'props.total') */
  sum?: string;
  /** Average a numeric property */
  avg?: string;
  /** Minimum of a numeric property */
  min?: string;
  /** Maximum of a numeric property */
  max?: string;
}

/**
 * Result of an aggregate query.
 */
export interface AggregateResult {
  stateHash: string;
  count?: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
}

/**
 * Depth option for multi-hop traversal.
 */
export interface HopOptions {
  /** Number of hops or [min, max] range. Default: [1, 1] (single hop). */
  depth?: number | [number, number];
}

/**
 * Fluent query builder.
 */
export class QueryBuilder {
  match(pattern: string): QueryBuilder;
  where(fn: ((node: QueryNodeSnapshot) => boolean) | Record<string, unknown>): QueryBuilder;
  outgoing(label?: string, options?: HopOptions): QueryBuilder;
  incoming(label?: string, options?: HopOptions): QueryBuilder;
  select(fields?: Array<'id' | 'props'>): QueryBuilder;
  aggregate(spec: AggregateSpec): QueryBuilder;
  run(): Promise<QueryResultV1 | AggregateResult>;
}

/**
 * Logical graph traversal module.
 */
export interface LogicalTraversal {
  bfs(start: string, options?: {
    maxDepth?: number;
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
  }): Promise<string[]>;
  dfs(start: string, options?: {
    maxDepth?: number;
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
  }): Promise<string[]>;
  shortestPath(from: string, to: string, options?: {
    maxDepth?: number;
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
  }): Promise<{ found: boolean; path: string[]; length: number }>;
  connectedComponent(start: string, options?: {
    labelFilter?: string | string[];
  }): Promise<string[]>;
}

/**
 * Options for BFS/DFS traversal.
 */
export interface TraversalOptions {
  /** Starting node SHA */
  start: string;
  /** Maximum nodes to visit (default: 100000) */
  maxNodes?: number;
  /** Maximum depth to traverse (default: 1000) */
  maxDepth?: number;
  /** Traversal direction (default: 'forward') */
  direction?: TraversalDirection;
}

/**
 * Options for ancestor/descendant traversal.
 */
export interface AncestorOptions {
  /** Starting node SHA */
  sha: string;
  /** Maximum nodes to visit (default: 100000) */
  maxNodes?: number;
  /** Maximum depth to traverse (default: 1000) */
  maxDepth?: number;
}

/**
 * Options for path-finding operations.
 */
export interface PathOptions {
  /** Source node SHA */
  from: string;
  /** Target node SHA */
  to: string;
  /** Maximum search depth (default: 1000) */
  maxDepth?: number;
  /** Maximum nodes to visit */
  maxNodes?: number;
}

/**
 * Options for finding common ancestors.
 */
export interface CommonAncestorsOptions {
  /** Array of node SHAs */
  shas: string[];
  /** Maximum ancestors to return (default: 100) */
  maxResults?: number;
  /** Maximum depth to search (default: 1000) */
  maxDepth?: number;
}

/**
 * Options for topological sort.
 */
export interface TopologicalSortOptions {
  /** Starting node SHA */
  start: string;
  /** Maximum nodes to yield (default: 100000) */
  maxNodes?: number;
  /** Direction determines dependency order (default: 'forward') */
  direction?: TraversalDirection;
  /** If true, throws TraversalError when cycle detected (default: false) */
  throwOnCycle?: boolean;
}

/**
 * Immutable entity representing a graph node.
 */
export class GraphNode {
  /** Commit SHA */
  readonly sha: string;
  /** Author name */
  readonly author: string | undefined;
  /** Commit date */
  readonly date: string | undefined;
  /** Node message/data */
  readonly message: string;
  /** Array of parent SHAs */
  readonly parents: readonly string[];

  constructor(data: {
    sha: string;
    message: string;
    author?: string;
    date?: string;
    parents?: string[];
  });
}

/**
 * Port interface for graph persistence operations.
 * @abstract
 */
/**
 * Full commit metadata returned by getNodeInfo.
 */
export interface NodeInfo {
  /** Commit SHA */
  sha: string;
  /** Commit message */
  message: string;
  /** Author name */
  author: string;
  /** Commit date */
  date: string;
  /** Parent commit SHAs */
  parents: string[];
}

export abstract class GraphPersistencePort {
  /** The empty tree SHA */
  abstract get emptyTree(): string;

  abstract commitNode(options: CreateNodeOptions): Promise<string>;
  abstract showNode(sha: string): Promise<string>;
  /** Gets full commit metadata for a node */
  abstract getNodeInfo(sha: string): Promise<NodeInfo>;
  abstract logNodesStream(options: ListNodesOptions & { format: string }): Promise<AsyncIterable<Uint8Array | string>>;
  abstract logNodes(options: ListNodesOptions & { format: string }): Promise<string>;
  /** Pings the repository to verify accessibility */
  abstract ping(): Promise<PingResult>;
  /** Counts nodes reachable from a ref without loading them into memory */
  abstract countNodes(ref: string): Promise<number>;
  /** Checks if a node exists by SHA */
  nodeExists(sha: string): Promise<boolean>;
}

/**
 * Port interface for index storage operations.
 * @abstract
 */
export abstract class IndexStoragePort {
  /** Writes a blob and returns its OID */
  abstract writeBlob(content: Buffer | string): Promise<string>;
  /** Writes a tree from entries and returns its OID */
  abstract writeTree(entries: string[]): Promise<string>;
  /** Reads a blob by OID */
  abstract readBlob(oid: string): Promise<Buffer>;
  /** Reads a tree and returns a map of path to blob OID */
  abstract readTreeOids(treeOid: string): Promise<Record<string, string>>;
  /** Updates a ref to point to an OID */
  abstract updateRef(ref: string, oid: string): Promise<void>;
  /** Reads the OID a ref points to */
  abstract readRef(ref: string): Promise<string | null>;
}

/**
 * Log levels in order of severity.
 */
export const LogLevel: {
  readonly DEBUG: 0;
  readonly INFO: 1;
  readonly WARN: 2;
  readonly ERROR: 3;
  readonly SILENT: 4;
};

export type LogLevelValue = 0 | 1 | 2 | 3 | 4;

/**
 * Port interface for time-related operations.
 * @abstract
 */
export abstract class ClockPort {
  /** Returns a high-resolution timestamp in milliseconds */
  abstract now(): number;
  /** Returns the current wall-clock time as an ISO string */
  abstract timestamp(): string;
}

/**
 * Clock adapter using Node.js performance API.
 * Use this for Node.js environments.
 */
export class PerformanceClockAdapter extends ClockPort {
  now(): number;
  timestamp(): string;
}

/**
 * Clock adapter using global performance API.
 * Use this for Bun, Deno, and browser environments.
 */
export class GlobalClockAdapter extends ClockPort {
  now(): number;
  timestamp(): string;
}

/**
 * Port interface for structured logging operations.
 * @abstract
 */
export abstract class LoggerPort {
  /** Log a debug-level message */
  abstract debug(message: string, context?: Record<string, unknown>): void;
  /** Log an info-level message */
  abstract info(message: string, context?: Record<string, unknown>): void;
  /** Log a warning-level message */
  abstract warn(message: string, context?: Record<string, unknown>): void;
  /** Log an error-level message */
  abstract error(message: string, context?: Record<string, unknown>): void;
  /** Create a child logger with additional base context */
  abstract child(context: Record<string, unknown>): LoggerPort;
}

/**
 * No-operation logger adapter.
 * Discards all log messages. Zero overhead.
 */
export class NoOpLogger extends LoggerPort {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): NoOpLogger;
}

/**
 * Console logger adapter with structured JSON output.
 * Supports log level filtering, timestamps, and child loggers.
 */
export class ConsoleLogger extends LoggerPort {
  constructor(options?: {
    /** Minimum log level to output (default: LogLevel.INFO) */
    level?: LogLevelValue | 'debug' | 'info' | 'warn' | 'error' | 'silent';
    /** Base context for all log entries */
    context?: Record<string, unknown>;
    /** Custom timestamp function (defaults to ISO string) */
    timestampFn?: () => string;
  });

  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): ConsoleLogger;
}

/**
 * Git plumbing interface (from @git-stunts/plumbing).
 */
export interface GitPlumbing {
  readonly emptyTree: string;
  execute(options: { args: string[]; input?: string | Buffer }): Promise<string>;
  executeStream(options: { args: string[] }): Promise<AsyncIterable<Uint8Array> & { collect(opts?: { asString?: boolean }): Promise<Buffer | string> }>;
}

/**
 * Implementation of GraphPersistencePort and IndexStoragePort using GitPlumbing.
 */
export class GitGraphAdapter extends GraphPersistencePort implements IndexStoragePort {
  constructor(options: { plumbing: GitPlumbing });

  get emptyTree(): string;
  commitNode(options: CreateNodeOptions): Promise<string>;
  showNode(sha: string): Promise<string>;
  getNodeInfo(sha: string): Promise<NodeInfo>;
  logNodesStream(options: ListNodesOptions & { format: string }): Promise<AsyncIterable<Uint8Array | string>>;
  logNodes(options: ListNodesOptions & { format: string }): Promise<string>;
  writeBlob(content: Buffer | string): Promise<string>;
  writeTree(entries: string[]): Promise<string>;
  readTree(treeOid: string): Promise<Record<string, Buffer>>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  readBlob(oid: string): Promise<Buffer>;
  updateRef(ref: string, oid: string): Promise<void>;
  readRef(ref: string): Promise<string | null>;
  deleteRef(ref: string): Promise<void>;
  /** Checks if a node (commit) exists in the repository */
  nodeExists(sha: string): Promise<boolean>;
  ping(): Promise<PingResult>;
  /** Counts nodes reachable from a ref without loading them into memory */
  countNodes(ref: string): Promise<number>;
  /** Reads a git config value */
  configGet(key: string): Promise<string | null>;
  /** Sets a git config value */
  configSet(key: string, value: string): Promise<void>;
}


/**
 * Builder for constructing bitmap indexes in memory.
 *
 * Pure domain class with no infrastructure dependencies.
 */
export class BitmapIndexBuilder {
  /** SHA to numeric ID mappings */
  readonly shaToId: Map<string, number>;
  /** Numeric ID to SHA mappings */
  readonly idToSha: string[];

  constructor();

  /** Registers a node and returns its numeric ID */
  registerNode(sha: string): number;

  /** Adds a directed edge from source to target */
  addEdge(srcSha: string, tgtSha: string): void;

  /** Serializes the index to a tree structure of buffers */
  serialize(options?: { frontier?: Map<string, string> }): Record<string, Buffer>;
}

/**
 * Service for querying a loaded bitmap index.
 *
 * Provides O(1) lookups via lazy-loaded sharded bitmap data.
 */
export class BitmapIndexReader {
  constructor(options: {
    storage: IndexStoragePort;
    /** If true, throw on validation failures; if false, log and return empty (default: false) */
    strict?: boolean;
    /** Logger for structured logging (default: NoOpLogger) */
    logger?: LoggerPort;
  });

  /**
   * Configures the reader with shard OID mappings for lazy loading.
   *
   * The shardOids object maps shard filenames to their Git blob OIDs:
   * - `meta_XX.json` - SHA→ID mappings for nodes with SHA prefix XX
   * - `shards_fwd_XX.json` - Forward edge bitmaps (parent→children)
   * - `shards_rev_XX.json` - Reverse edge bitmaps (child→parents)
   *
   * @example
   * reader.setup({
   *   'meta_ab.json': 'a1b2c3d4e5f6...',
   *   'shards_fwd_ab.json': '1234567890ab...',
   *   'shards_rev_ab.json': 'abcdef123456...'
   * });
   */
  setup(shardOids: Record<string, string>): void;

  /** Looks up the numeric ID for a SHA */
  lookupId(sha: string): Promise<number | undefined>;

  /** Gets parent SHAs for a node (O(1) via reverse bitmap) */
  getParents(sha: string): Promise<string[]>;

  /** Gets child SHAs for a node (O(1) via forward bitmap) */
  getChildren(sha: string): Promise<string[]>;
}

/**
 * Service for building and loading the bitmap index from the graph.
 */
export class IndexRebuildService {
  constructor(options: {
    /** Graph service providing iterateNodes() for walking the graph */
    graphService: { iterateNodes(options: IterateNodesOptions): AsyncGenerator<GraphNode, void, unknown> };
    storage: IndexStoragePort;
    /** Logger for structured logging (default: NoOpLogger) */
    logger?: LoggerPort;
  });

  /**
   * Rebuilds the bitmap index by walking the graph from a ref.
   *
   * **Memory**: O(N) where N is nodes. ~150-200MB for 1M nodes.
   * **Time**: O(N) single pass.
   */
  rebuild(ref: string, options?: RebuildOptions): Promise<string>;

  /**
   * Loads a previously built index from a tree OID.
   *
   * **Memory**: Lazy loading - O(1) initial, shards loaded on demand.
   */
  load(treeOid: string, options?: LoadOptions): Promise<BitmapIndexReader>;
}

/**
 * Service for performing health checks on the graph system.
 *
 * Follows hexagonal architecture by depending on ports, not adapters.
 * Provides K8s-style probes (liveness vs readiness) and detailed component health.
 */
export class HealthCheckService {
  constructor(options: {
    /** Persistence port for repository checks */
    persistence: GraphPersistencePort;
    /** Clock port for timing operations */
    clock: ClockPort;
    /** How long to cache health results in milliseconds (default: 5000) */
    cacheTtlMs?: number;
    /** Logger for structured logging (default: NoOpLogger) */
    logger?: LoggerPort;
  });

  /**
   * Sets the index reader for index health checks.
   * Call this when an index is loaded.
   */
  setIndexReader(reader: BitmapIndexReader | null): void;

  /**
   * K8s-style liveness probe: Is the service running?
   * Returns true if the repository is accessible.
   */
  isAlive(): Promise<boolean>;

  /**
   * K8s-style readiness probe: Can the service serve requests?
   * Returns true if all critical components are healthy.
   */
  isReady(): Promise<boolean>;

  /**
   * Gets detailed health information for all components.
   * Results are cached for the configured TTL.
   */
  getHealth(): Promise<HealthResult>;
}

/**
 * Service for commit DAG traversal operations.
 *
 * Provides BFS, DFS, path finding, and topological sort algorithms
 * using O(1) bitmap index lookups.
 */
export class CommitDagTraversalService {
  constructor(options: {
    /** Index reader for O(1) lookups */
    indexReader: BitmapIndexReader;
    /** Logger for structured logging (default: NoOpLogger) */
    logger?: LoggerPort;
  });

  /**
   * Breadth-first traversal from a starting node.
   */
  bfs(options: TraversalOptions): AsyncGenerator<TraversalNode, void, unknown>;

  /**
   * Depth-first pre-order traversal from a starting node.
   */
  dfs(options: TraversalOptions): AsyncGenerator<TraversalNode, void, unknown>;

  /**
   * Yields all ancestors of a node (transitive closure going backwards).
   */
  ancestors(options: AncestorOptions): AsyncGenerator<TraversalNode, void, unknown>;

  /**
   * Yields all descendants of a node (transitive closure going forwards).
   */
  descendants(options: AncestorOptions): AsyncGenerator<TraversalNode, void, unknown>;

  /**
   * Finds ANY path between two nodes using BFS.
   */
  findPath(options: PathOptions): Promise<PathResult>;

  /**
   * Finds the shortest path between two nodes using bidirectional BFS.
   */
  shortestPath(options: PathOptions): Promise<PathResult>;

  /**
   * Checks if there is any path from one node to another.
   */
  isReachable(options: PathOptions): Promise<boolean>;

  /**
   * Finds common ancestors of multiple nodes.
   */
  commonAncestors(options: CommonAncestorsOptions): Promise<string[]>;

  /**
   * Yields nodes in topological order using Kahn's algorithm.
   */
  topologicalSort(options: TopologicalSortOptions): AsyncGenerator<TraversalNode, void, unknown>;

  /**
   * Finds shortest path using Dijkstra's algorithm with custom edge weights.
   */
  weightedShortestPath(options: {
    from: string;
    to: string;
    weightProvider?: (fromSha: string, toSha: string) => number | Promise<number>;
    direction?: 'children' | 'parents';
  }): Promise<{ path: string[]; totalCost: number }>;

  /**
   * Finds shortest path using A* algorithm with heuristic guidance.
   */
  aStarSearch(options: {
    from: string;
    to: string;
    weightProvider?: (fromSha: string, toSha: string) => number | Promise<number>;
    heuristicProvider?: (sha: string, targetSha: string) => number | Promise<number>;
    direction?: 'children' | 'parents';
  }): Promise<{ path: string[]; totalCost: number; nodesExplored: number }>;

  /**
   * Bi-directional A* search - meets in the middle from both ends.
   */
  bidirectionalAStar(options: {
    from: string;
    to: string;
    weightProvider?: (fromSha: string, toSha: string) => number | Promise<number>;
    forwardHeuristic?: (sha: string, targetSha: string) => number | Promise<number>;
    backwardHeuristic?: (sha: string, targetSha: string) => number | Promise<number>;
  }): Promise<{ path: string[]; totalCost: number; nodesExplored: number }>;
}

/**
 * @deprecated Use CommitDagTraversalService instead.
 */
export { CommitDagTraversalService as TraversalService };

/**
 * Error class for graph traversal operations.
 */
export class TraversalError extends Error {
  /** Error name */
  readonly name: 'TraversalError';
  /** Error code for programmatic handling */
  readonly code: string;
  /** Serializable context for debugging */
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: {
    code?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * Error thrown when an operation is aborted via AbortSignal.
 */
export class OperationAbortedError extends Error {
  readonly name: 'OperationAbortedError';
  readonly code: string;
  readonly operation?: string;
  readonly reason: string;
  readonly context: Record<string, unknown>;

  constructor(operation?: string, options?: {
    reason?: string;
    code?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * Error class for query builder operations.
 */
export class QueryError extends Error {
  readonly name: 'QueryError';
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: {
    code?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * Error thrown when a patch contains operations unsupported by the current schema version.
 * Raised during sync when a v2 reader encounters edge property ops (schema v3).
 */
export class SchemaUnsupportedError extends Error {
  readonly name: 'SchemaUnsupportedError';
  readonly code: 'E_SCHEMA_UNSUPPORTED';
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: {
    context?: Record<string, unknown>;
  });
}

/**
 * Error class for sync transport operations.
 */
export class SyncError extends Error {
  readonly name: 'SyncError';
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: {
    code?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * Base error class for bitmap index operations.
 */
export class IndexError extends Error {
  readonly name: 'IndexError';
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: {
    code?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * Error thrown when a shard fails to load.
 */
export class ShardLoadError extends IndexError {
  readonly name: 'ShardLoadError';
  readonly shardPath?: string;
  readonly oid?: string;
  readonly cause?: Error;

  constructor(message: string, options?: {
    shardPath?: string;
    oid?: string;
    cause?: Error;
    context?: Record<string, unknown>;
  });
}

/**
 * Error thrown when shard data is corrupted or invalid.
 */
export class ShardCorruptionError extends IndexError {
  readonly name: 'ShardCorruptionError';
  readonly shardPath?: string;
  readonly oid?: string;
  readonly reason?: string;

  constructor(message: string, options?: {
    shardPath?: string;
    oid?: string;
    reason?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * Error thrown when shard validation fails.
 */
export class ShardValidationError extends IndexError {
  readonly name: 'ShardValidationError';
  readonly shardPath?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly field?: string;

  constructor(message: string, options?: {
    shardPath?: string;
    expected?: unknown;
    actual?: unknown;
    field?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * Error thrown when a storage operation fails.
 */
export class StorageError extends IndexError {
  readonly name: 'StorageError';
  readonly operation?: 'read' | 'write';
  readonly oid?: string;
  readonly cause?: Error;

  constructor(message: string, options?: {
    operation?: 'read' | 'write';
    oid?: string;
    cause?: Error;
    context?: Record<string, unknown>;
  });
}

/**
 * Checks if an AbortSignal is aborted and throws OperationAbortedError if so.
 */
export function checkAborted(signal?: AbortSignal, operation?: string): void;

/**
 * Creates an AbortSignal that automatically aborts after the specified timeout.
 */
export function createTimeoutSignal(ms: number): AbortSignal;

/**
 * Encodes an edge property key for Map storage.
 * Format: \x01from\0to\0label\0propKey
 */
export function encodeEdgePropKey(from: string, to: string, label: string, propKey: string): string;

/**
 * Decodes an edge property key string.
 */
export function decodeEdgePropKey(encoded: string): { from: string; to: string; label: string; propKey: string };

/**
 * Returns true if the encoded key is an edge property key.
 */
export function isEdgePropKey(key: string): boolean;

/**
 * Multi-writer graph database using WARP CRDT protocol.
 *
 * V7 primary API - uses patch-based storage with OR-Set semantics.
 * See docs/V7_CONTRACT.md for architecture details.
 */
export default class WarpGraph {
  /**
   * Opens or creates a multi-writer graph.
   */
  static open(options: {
    graphName: string;
    persistence: GraphPersistencePort;
    writerId: string;
    logger?: LoggerPort;
    adjacencyCacheSize?: number;
    gcPolicy?: {
      enabled?: boolean;
      tombstoneRatioThreshold?: number;
      entryCountThreshold?: number;
      minPatchesSinceCompaction?: number;
      maxTimeSinceCompaction?: number;
      compactOnCheckpoint?: boolean;
    };
    checkpointPolicy?: { every: number };
    autoMaterialize?: boolean;
  }): Promise<WarpGraph>;

  /**
   * The graph namespace.
   */
  readonly graphName: string;

  /**
   * This writer's ID.
   */
  readonly writerId: string;

  /**
   * Creates a new patch for adding operations.
   */
  createPatch(): Promise<unknown>;

  /**
   * Returns patches from a writer's ref chain.
   */
  getWriterPatches(
    writerId: string,
    stopAtSha?: string | null
  ): Promise<Array<{ patch: unknown; sha: string }>>;

  /**
   * Gets all visible nodes in the materialized state.
   */
  getNodes(): string[];

  /**
   * Gets all visible edges in the materialized state.
   */
  getEdges(): Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>;

  /**
   * Gets all properties for a node from the materialized state.
   */
  getNodeProps(nodeId: string): Map<string, unknown> | null;

  /**
   * Gets all properties for an edge from the materialized state.
   * Returns null if the edge does not exist or is tombstoned.
   */
  getEdgeProps(from: string, to: string, label: string): Record<string, unknown> | null;

  /**
   * Checks if a node exists in the materialized state.
   */
  hasNode(nodeId: string): boolean;

  /**
   * Gets neighbors of a node from the materialized state.
   */
  neighbors(
    nodeId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
    edgeLabel?: string,
  ): Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>;

  /**
   * Discovers all writers that have contributed to this graph.
   */
  discoverWriters(): Promise<string[]>;

  /**
   * Gets the current frontier (map of writerId to tip SHA).
   */
  getFrontier(): Promise<Map<string, string>>;

  /**
   * Checks whether any writer tip has changed since the last materialize.
   * O(writers) comparison — cheap "has anything changed?" check without materialization.
   */
  hasFrontierChanged(): Promise<boolean>;

  /**
   * Creates a checkpoint snapshot of the current materialized state.
   */
  createCheckpoint(): Promise<string>;

  /**
   * Materializes graph state from a checkpoint, applying incremental patches.
   */
  materializeAt(checkpointSha: string): Promise<unknown>;

  /**
   * Logical graph traversal helpers.
   */
  traverse: LogicalTraversal;

  /**
   * Creates a fluent query builder for the logical graph.
   */
  query(): QueryBuilder;

  /**
   * Materializes the current graph state from all patches.
   */
  materialize(): Promise<unknown>;

  /**
   * Gets the current version vector.
   */
  getVersionVector(): unknown;

  /**
   * Starts a built-in sync server for this graph.
   */
  serve(options: {
    port: number;
    host?: string;
    path?: string;
    maxRequestBytes?: number;
  }): Promise<{ close(): Promise<void>; url: string }>;

  /**
   * Syncs with a remote peer (HTTP URL or another WarpGraph instance).
   */
  syncWith(remote: string | WarpGraph, options?: {
    path?: string;
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onStatus?: (event: {
      type: string;
      attempt: number;
      durationMs?: number;
      status?: number;
      error?: Error;
    }) => void;
  }): Promise<{ applied: number; attempts: number }>;

  /**
   * Creates a fork of this graph at a specific point in a writer's history.
   *
   * A fork creates a new WarpGraph instance that shares history up to the
   * specified patch SHA. Due to Git's content-addressed storage, the shared
   * history is automatically deduplicated.
   */
  fork(options: {
    /** Writer ID whose chain to fork from */
    from: string;
    /** Patch SHA to fork at (must be in the writer's chain) */
    at: string;
    /** Name for the forked graph. Defaults to `<graphName>-fork-<timestamp>` */
    forkName?: string;
    /** Writer ID for the fork. Defaults to a new canonical ID. */
    forkWriterId?: string;
  }): Promise<WarpGraph>;

  /**
   * Creates a wormhole compressing a range of patches.
   *
   * The range is specified by two patch SHAs from the same writer. The `fromSha`
   * must be an ancestor of `toSha` in the writer's patch chain.
   */
  createWormhole(fromSha: string, toSha: string): Promise<WormholeEdge>;

  /**
   * Returns patch SHAs that affected a given entity (node or edge).
   *
   * If autoMaterialize is enabled, automatically materializes if state is dirty.
   *
   * @throws {QueryError} If no provenance index exists and autoMaterialize is off
   */
  patchesFor(entityId: string): Promise<string[]>;

  /**
   * Materializes only the backward causal cone for a specific node.
   *
   * Uses the provenance index to identify which patches contributed to the
   * target node's state, then replays only those patches.
   *
   * @throws {QueryError} If no provenance index exists (call materialize first)
   */
  materializeSlice(nodeId: string, options?: {
    /** If true, collect tick receipts */
    receipts?: boolean;
  }): Promise<{
    state: WarpStateV5;
    patchCount: number;
    receipts?: TickReceipt[];
  }>;

  /**
   * The provenance index mapping entities to contributing patches.
   * Available after materialize() has been called.
   */
  readonly provenanceIndex: ProvenanceIndex | null;
}

/**
 * Index mapping entities (nodes/edges) to the patches that affected them.
 *
 * Used for provenance queries and slice materialization. Implements HG/IO/2
 * from the AION Foundations Series, enabling quick answers to "which patches
 * affected node X?" without replaying all patches.
 */
export class ProvenanceIndex {
  constructor(initialIndex?: Map<string, Set<string>>);

  /**
   * Creates an empty ProvenanceIndex.
   */
  static empty(): ProvenanceIndex;

  /**
   * Adds a patch to the index, recording which entities it read/wrote.
   * Both reads and writes are indexed because both indicate the patch
   * "affected" the entity.
   *
   * @returns This index for chaining
   */
  addPatch(patchSha: string, reads?: string[], writes?: string[]): this;

  /**
   * Returns patch SHAs that affected a given entity.
   * The returned array is sorted alphabetically for determinism.
   */
  patchesFor(entityId: string): string[];

  /**
   * Returns whether the index has any entries for a given entity.
   */
  has(entityId: string): boolean;

  /**
   * Number of entities tracked in the index.
   */
  readonly size: number;

  /**
   * Returns all entity IDs in the index, sorted alphabetically.
   */
  entities(): string[];

  /**
   * Clears all entries from the index.
   *
   * @returns This index for chaining
   */
  clear(): this;

  /**
   * Merges another index into this one. All entries from the other index
   * are added to this index.
   *
   * @returns This index for chaining
   */
  merge(other: ProvenanceIndex): this;

  /**
   * Creates a deep clone of this index.
   */
  clone(): ProvenanceIndex;

  /**
   * Serializes the index to CBOR format for checkpoint storage.
   */
  serialize(): Buffer;

  /**
   * Deserializes an index from CBOR format.
   *
   * @throws Error if the buffer contains an unsupported version
   */
  static deserialize(buffer: Buffer): ProvenanceIndex;

  /**
   * Returns a JSON-serializable representation of this index.
   */
  toJSON(): { version: number; entries: Array<[string, string[]]> };

  /**
   * Creates a ProvenanceIndex from a JSON representation.
   *
   * @throws Error if the JSON contains an unsupported version
   */
  static fromJSON(json: { version: number; entries: Array<[string, string[]]> }): ProvenanceIndex;

  /**
   * Iterator over [entityId, patchShas[]] pairs in deterministic order.
   */
  [Symbol.iterator](): IterableIterator<[string, string[]]>;
}

/**
 * Error thrown when a fork operation fails.
 */
export class ForkError extends Error {
  readonly name: 'ForkError';
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: {
    code?: string;
    context?: Record<string, unknown>;
  });
}

// ============================================================================
// Tick Receipts (LIGHTHOUSE)
// ============================================================================

/**
 * Valid operation types that can appear in a tick receipt.
 */
export type TickReceiptOpType = 'NodeAdd' | 'NodeTombstone' | 'EdgeAdd' | 'EdgeTombstone' | 'PropSet' | 'BlobValue';

/**
 * Valid result values for an operation outcome.
 */
export type TickReceiptResult = 'applied' | 'superseded' | 'redundant';

/**
 * Per-operation outcome within a tick receipt.
 */
export interface OpOutcome {
  /** Operation type */
  readonly op: TickReceiptOpType;
  /** Node ID or edge key */
  readonly target: string;
  /** Outcome of the operation */
  readonly result: TickReceiptResult;
  /** Human-readable explanation */
  readonly reason?: string;
}

/**
 * Immutable record of per-operation outcomes from a single patch application.
 *
 * @see Paper II, Section 5 -- Tick receipts
 */
export interface TickReceipt {
  /** SHA of the patch commit */
  readonly patchSha: string;
  /** Writer ID that produced the patch */
  readonly writer: string;
  /** Lamport timestamp of the patch */
  readonly lamport: number;
  /** Per-operation outcomes (frozen) */
  readonly ops: readonly Readonly<OpOutcome>[];
}

/**
 * Creates an immutable TickReceipt.
 *
 * @throws {Error} If any parameter is invalid
 */
export function createTickReceipt(params: {
  patchSha: string;
  writer: string;
  lamport: number;
  ops: Array<{
    op: TickReceiptOpType;
    target: string;
    result: TickReceiptResult;
    reason?: string;
  }>;
}): Readonly<TickReceipt>;

/**
 * Produces a deterministic JSON string for a TickReceipt (sorted keys at every level).
 */
export function tickReceiptCanonicalJson(receipt: TickReceipt): string;

/**
 * Valid operation types that can appear in a tick receipt.
 */
export const TICK_RECEIPT_OP_TYPES: readonly TickReceiptOpType[];

/**
 * Valid result values for an operation outcome.
 */
export const TICK_RECEIPT_RESULT_TYPES: readonly TickReceiptResult[];

/**
 * A patch entry in a provenance payload.
 */
export interface PatchEntry {
  /** The decoded patch object */
  patch: {
    schema: 2 | 3;
    writer: string;
    lamport: number;
    context: Record<string, number> | Map<string, number>;
    ops: unknown[];
    /** Node/edge IDs read by this patch (V2 provenance) */
    reads?: string[];
    /** Node/edge IDs written by this patch (V2 provenance) */
    writes?: string[];
  };
  /** The Git SHA of the patch commit */
  sha: string;
}

/**
 * WARP V5 materialized state.
 */
export interface WarpStateV5 {
  nodeAlive: unknown;
  edgeAlive: unknown;
  prop: Map<string, unknown>;
  observedFrontier: Map<string, number>;
  edgeBirthEvent: Map<string, unknown>;
}

/**
 * ProvenancePayload - Transferable provenance as a monoid.
 *
 * Implements the provenance payload from Paper III (Computational Holography):
 * P = (mu_0, ..., mu_{n-1}) - an ordered sequence of tick patches.
 *
 * The payload monoid (Payload, ., epsilon):
 * - Composition is concatenation
 * - Identity is empty sequence
 *
 * @see Paper III, Section 4 -- Computational Holography
 */
export class ProvenancePayload {
  /**
   * Creates a new ProvenancePayload from an ordered sequence of patches.
   *
   * @param patches - Ordered sequence of patch entries
   * @throws {TypeError} If patches is not an array
   */
  constructor(patches?: PatchEntry[]);

  /**
   * Returns the identity element of the payload monoid (empty payload).
   */
  static identity(): ProvenancePayload;

  /**
   * Returns the number of patches in this payload.
   */
  readonly length: number;

  /**
   * Concatenates this payload with another, forming a new payload.
   *
   * @param other - The payload to append
   * @throws {TypeError} If other is not a ProvenancePayload
   */
  concat(other: ProvenancePayload): ProvenancePayload;

  /**
   * Replays the payload to produce a materialized state.
   *
   * @param initialState - Optional initial state to replay from
   */
  replay(initialState?: WarpStateV5): WarpStateV5;

  /**
   * Returns the patch entry at the given index.
   */
  at(index: number): PatchEntry | undefined;

  /**
   * Returns a new payload containing a slice of this payload's patches.
   */
  slice(start?: number, end?: number): ProvenancePayload;

  /**
   * Returns an iterator over the patch entries.
   */
  [Symbol.iterator](): Iterator<PatchEntry>;

  /**
   * Returns a JSON-serializable representation of this payload.
   */
  toJSON(): PatchEntry[];

  /**
   * Creates a ProvenancePayload from a JSON-serialized array.
   */
  static fromJSON(json: PatchEntry[]): ProvenancePayload;
}

// ============================================================================
// Boundary Transition Records (HOLOGRAM)
// ============================================================================

/**
 * Boundary Transition Record - Tamper-evident provenance packaging.
 *
 * Binds (h_in, h_out, U_0, P, t, kappa) for auditable exchange of graph
 * segments between parties who don't share full history.
 *
 * @see Paper III, Section 4 -- Boundary Transition Records
 */
export interface BTR {
  /** BTR format version */
  readonly version: number;
  /** Hash of input state (hex SHA-256) */
  readonly h_in: string;
  /** Hash of output state (hex SHA-256) */
  readonly h_out: string;
  /** Serialized initial state (CBOR) */
  readonly U_0: Buffer;
  /** Serialized provenance payload */
  readonly P: PatchEntry[];
  /** ISO 8601 timestamp */
  readonly t: string;
  /** Authentication tag (hex HMAC-SHA256) */
  readonly kappa: string;
}

/**
 * Result of BTR verification.
 */
export interface BTRVerificationResult {
  /** Whether the BTR is valid */
  valid: boolean;
  /** Reason for failure (if invalid) */
  reason?: string;
}

/**
 * Options for creating a BTR.
 */
export interface CreateBTROptions {
  /** HMAC key for authentication */
  key: string | Buffer;
  /** Custom ISO timestamp (defaults to now) */
  timestamp?: string;
}

/**
 * Options for verifying a BTR.
 */
export interface VerifyBTROptions {
  /** Also verify replay produces h_out (default: false) */
  verifyReplay?: boolean;
}

/**
 * Creates a Boundary Transition Record from an initial state and payload.
 *
 * @param initialState - The input state U_0
 * @param payload - The provenance payload P
 * @param options - Creation options including key and optional timestamp
 * @throws {TypeError} If payload is not a ProvenancePayload
 */
export function createBTR(
  initialState: WarpStateV5,
  payload: ProvenancePayload,
  options: CreateBTROptions
): BTR;

/**
 * Verifies a Boundary Transition Record.
 *
 * @param btr - The BTR to verify
 * @param key - HMAC key
 * @param options - Verification options
 */
export function verifyBTR(
  btr: BTR,
  key: string | Buffer,
  options?: VerifyBTROptions
): BTRVerificationResult;

/**
 * Replays a BTR to produce the final state.
 *
 * @param btr - The BTR to replay
 * @returns The final state and its hash
 */
export function replayBTR(btr: BTR): { state: WarpStateV5; h_out: string };

/**
 * Serializes a BTR to CBOR bytes for transport.
 *
 * @param btr - The BTR to serialize
 */
export function serializeBTR(btr: BTR): Buffer;

/**
 * Deserializes a BTR from CBOR bytes.
 *
 * @param bytes - CBOR-encoded BTR
 * @throws {Error} If the bytes are not valid CBOR or missing required fields
 */
export function deserializeBTR(bytes: Buffer): BTR;

// ============================================================================
// Wormhole Compression (HOLOGRAM)
// ============================================================================

/**
 * Error thrown when a wormhole operation fails.
 */
export class WormholeError extends Error {
  readonly name: 'WormholeError';
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: {
    code?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * A compressed range of patches (wormhole).
 *
 * A WormholeEdge contains:
 * - The SHA of the first (oldest) patch in the range (fromSha)
 * - The SHA of the last (newest) patch in the range (toSha)
 * - The writer ID who created all patches in the range
 * - A ProvenancePayload containing all patches for replay
 */
export interface WormholeEdge {
  /** SHA of the first (oldest) patch commit */
  readonly fromSha: string;
  /** SHA of the last (newest) patch commit */
  readonly toSha: string;
  /** Writer ID of all patches in the range */
  readonly writerId: string;
  /** Sub-payload for replay */
  readonly payload: ProvenancePayload;
  /** Number of patches compressed */
  readonly patchCount: number;
}

/**
 * Options for creating a wormhole.
 */
export interface CreateWormholeOptions {
  /** Git persistence adapter */
  persistence: GraphPersistencePort;
  /** Name of the graph */
  graphName: string;
  /** SHA of the first (oldest) patch commit */
  fromSha: string;
  /** SHA of the last (newest) patch commit */
  toSha: string;
}

/**
 * Options for composing wormholes.
 */
export interface ComposeWormholesOptions {
  /** Git persistence adapter (for validation) */
  persistence?: GraphPersistencePort;
}

/**
 * Creates a wormhole compressing a range of patches.
 *
 * The range is specified by two patch SHAs from the same writer. The `fromSha`
 * must be an ancestor of `toSha` in the writer's patch chain. Both endpoints
 * are inclusive in the wormhole.
 *
 * @throws {WormholeError} If fromSha or toSha doesn't exist (E_WORMHOLE_SHA_NOT_FOUND)
 * @throws {WormholeError} If fromSha is not an ancestor of toSha (E_WORMHOLE_INVALID_RANGE)
 * @throws {WormholeError} If commits span multiple writers (E_WORMHOLE_MULTI_WRITER)
 * @throws {WormholeError} If a commit is not a patch commit (E_WORMHOLE_NOT_PATCH)
 */
export function createWormhole(options: CreateWormholeOptions): Promise<WormholeEdge>;

/**
 * Composes two consecutive wormholes into a single wormhole.
 *
 * The wormholes must be from the same writer. When persistence is provided,
 * validates that the wormholes are actually consecutive in the commit chain.
 *
 * @throws {WormholeError} If wormholes are from different writers (E_WORMHOLE_MULTI_WRITER)
 * @throws {WormholeError} If wormholes are not consecutive (E_WORMHOLE_INVALID_RANGE)
 */
export function composeWormholes(
  first: WormholeEdge,
  second: WormholeEdge,
  options?: ComposeWormholesOptions
): Promise<WormholeEdge>;

/**
 * Replays a wormhole's sub-payload to materialize the compressed state.
 *
 * @param wormhole - The wormhole to replay
 * @param initialState - Optional initial state to start from
 */
export function replayWormhole(
  wormhole: WormholeEdge,
  initialState?: WarpStateV5
): WarpStateV5;

/**
 * Serializes a wormhole to a JSON-serializable object.
 */
export function serializeWormhole(wormhole: WormholeEdge): {
  fromSha: string;
  toSha: string;
  writerId: string;
  patchCount: number;
  payload: PatchEntry[];
};

/**
 * Deserializes a wormhole from a JSON object.
 */
export function deserializeWormhole(json: {
  fromSha: string;
  toSha: string;
  writerId: string;
  patchCount: number;
  payload: PatchEntry[];
}): WormholeEdge;
