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
    maxDepth?: number;
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
 * Port interface for cryptographic operations.
 * @abstract
 */
export abstract class CryptoPort {
  /** Computes a hash digest of the given data */
  abstract hash(algorithm: string, data: string | Buffer | Uint8Array): Promise<string>;
  /** Computes an HMAC of the given data */
  abstract hmac(algorithm: string, key: string | Buffer | Uint8Array, data: string | Buffer | Uint8Array): Promise<Buffer | Uint8Array>;
  /** Constant-time comparison of two buffers */
  abstract timingSafeEqual(a: Buffer | Uint8Array, b: Buffer | Uint8Array): boolean;
}

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
 * Unified clock adapter supporting both Node.js and global performance APIs.
 *
 * Use the static factory methods for common cases:
 * - `ClockAdapter.node()` -- Node.js `perf_hooks.performance`
 * - `ClockAdapter.global()` -- `globalThis.performance` (Bun/Deno/browsers)
 */
export class ClockAdapter extends ClockPort {
  constructor(options?: { performanceImpl?: Performance });
  static node(): ClockAdapter;
  static global(): ClockAdapter;
  now(): number;
  timestamp(): string;
}

/**
 * @deprecated Use ClockAdapter instead. Backward-compatibility re-export.
 */
export class PerformanceClockAdapter extends ClockPort {
  now(): number;
  timestamp(): string;
}

/**
 * @deprecated Use ClockAdapter instead. Backward-compatibility re-export.
 */
export class GlobalClockAdapter extends ClockPort {
  now(): number;
  timestamp(): string;
}

/**
 * Port interface for seek materialization cache operations.
 *
 * Implementations store serialized WarpStateV5 snapshots keyed by
 * (ceiling, frontier) tuples for near-instant restoration of
 * previously-visited ticks during seek exploration.
 *
 * @abstract
 */
export abstract class SeekCachePort {
  /** Retrieves a cached state buffer by key, or null on miss. */
  abstract get(key: string): Promise<Buffer | null>;
  /** Stores a state buffer under the given key. */
  abstract set(key: string, buffer: Buffer): Promise<void>;
  /** Checks whether a key exists in the cache index. */
  abstract has(key: string): Promise<boolean>;
  /** Lists all keys currently in the cache index. */
  abstract keys(): Promise<string[]>;
  /** Removes a single entry from the cache. */
  abstract delete(key: string): Promise<boolean>;
  /** Removes all entries from the cache. */
  abstract clear(): Promise<void>;
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
 * In-memory persistence adapter for fast unit/integration tests.
 *
 * Implements the same GraphPersistencePort contract as GitGraphAdapter
 * but stores all data in Maps — no real Git I/O required.
 */
export class InMemoryGraphAdapter extends GraphPersistencePort {
  constructor();

  get emptyTree(): string;
  commitNode(options: CreateNodeOptions): Promise<string>;
  showNode(sha: string): Promise<string>;
  getNodeInfo(sha: string): Promise<NodeInfo>;
  logNodesStream(options: ListNodesOptions & { format: string }): Promise<AsyncIterable<Uint8Array | string>>;
  logNodes(options: ListNodesOptions & { format: string }): Promise<string>;
  ping(): Promise<PingResult>;
  countNodes(ref: string): Promise<number>;
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
 * Node.js crypto adapter implementing CryptoPort.
 *
 * Uses Node.js built-in crypto module for hash and HMAC operations.
 */
export class NodeCryptoAdapter extends CryptoPort {
  constructor();
  hash(algorithm: string, data: string | Buffer | Uint8Array): Promise<string>;
  hmac(algorithm: string, key: string | Buffer | Uint8Array, data: string | Buffer | Uint8Array): Promise<Buffer | Uint8Array>;
  timingSafeEqual(a: Buffer | Uint8Array, b: Buffer | Uint8Array): boolean;
}

/**
 * Web Crypto API adapter implementing CryptoPort.
 *
 * Uses the standard Web Crypto API (globalThis.crypto.subtle) which is
 * available in browsers, Deno, Bun, and Node.js 20+.
 */
export class WebCryptoAdapter extends CryptoPort {
  constructor(options?: { subtle?: SubtleCrypto });
  hash(algorithm: string, data: string | Buffer | Uint8Array): Promise<string>;
  hmac(algorithm: string, key: string | Buffer | Uint8Array, data: string | Buffer | Uint8Array): Promise<Buffer | Uint8Array>;
  timingSafeEqual(a: Buffer | Uint8Array, b: Buffer | Uint8Array): boolean;
}

/**
 * Port interface for HTTP server operations.
 * @abstract
 */
export abstract class HttpServerPort {
  abstract createServer(requestHandler: (request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: Buffer | Uint8Array;
  }) => Promise<{ status?: number; headers?: Record<string, string>; body?: string | Uint8Array }>): {
    listen(port: number, callback?: (err?: Error | null) => void): void;
    listen(port: number, host: string, callback?: (err?: Error | null) => void): void;
    close(callback?: (err?: Error | null) => void): void;
    address(): { address: string; port: number; family: string } | null;
  };
}

/**
 * Bun HTTP adapter implementing HttpServerPort.
 *
 * Uses globalThis.Bun.serve() to create an HTTP server.
 */
export class BunHttpAdapter extends HttpServerPort {
  constructor(options?: { logger?: { error: (msg: string, ...args: unknown[]) => void } });
  createServer(requestHandler: (request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: Buffer | Uint8Array;
  }) => Promise<{ status?: number; headers?: Record<string, string>; body?: string | Uint8Array }>): {
    listen(port: number, callback?: (err?: Error | null) => void): void;
    listen(port: number, host: string, callback?: (err?: Error | null) => void): void;
    close(callback?: (err?: Error | null) => void): void;
    address(): { address: string; port: number; family: string } | null;
  };
}

/**
 * Deno HTTP adapter implementing HttpServerPort.
 *
 * Uses globalThis.Deno.serve() (Deno 1.35+) to create an HTTP server.
 */
export class DenoHttpAdapter extends HttpServerPort {
  constructor(options?: { logger?: { error: (msg: string, ...args: unknown[]) => void } });
  createServer(requestHandler: (request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: Buffer | Uint8Array;
  }) => Promise<{ status?: number; headers?: Record<string, string>; body?: string | Uint8Array }>): {
    listen(port: number, callback?: (err?: Error | null) => void): void;
    listen(port: number, host: string, callback?: (err?: Error | null) => void): void;
    close(callback?: (err?: Error | null) => void): void;
    address(): { address: string; port: number; family: string } | null;
  };
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
  serialize(options?: { frontier?: Map<string, string> }): Promise<Record<string, Buffer>>;
}

/**
 * Builder for constructing bitmap indexes from materialized WARP state.
 *
 * This builder creates adjacency indexes from WarpStateV5.edgeAlive OR-Set,
 * NOT from Git commit DAG topology.
 */
export class WarpStateIndexBuilder {
  constructor(options?: { crypto?: CryptoPort });

  /**
   * Builds an index from materialized WARP state.
   */
  buildFromState(state: WarpStateV5): { builder: BitmapIndexBuilder; stats: { nodes: number; edges: number } };

  /**
   * Serializes the index to a tree structure of buffers.
   */
  serialize(): Promise<Record<string, Buffer>>;
}

/**
 * Builds a bitmap index from materialized WARP state.
 *
 * Convenience function that creates a WarpStateIndexBuilder, builds from state,
 * and returns the serialized tree and stats.
 */
export function buildWarpStateIndex(state: WarpStateV5, options?: { crypto?: CryptoPort }): Promise<{ tree: Record<string, Buffer>; stats: { nodes: number; edges: number } }>;

/**
 * Computes a deterministic hash of a WarpStateV5 state.
 *
 * Uses canonical serialization to ensure the same state always produces
 * the same hash regardless of property iteration order.
 */
export function computeStateHashV5(state: WarpStateV5, options?: { crypto?: CryptoPort; codec?: unknown }): Promise<string | null>;

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
    /** CryptoPort instance for checksum verification. When not provided, checksum validation is skipped. */
    crypto?: CryptoPort;
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
  readonly name: string;
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
 * Configuration for an observer view.
 */
export interface ObserverConfig {
  /** Glob pattern for visible nodes (e.g. 'user:*') */
  match: string;
  /** Property keys to include (whitelist). If omitted, all non-redacted properties are visible. */
  expose?: string[];
  /** Property keys to exclude (blacklist). Takes precedence over expose. */
  redact?: string[];
}

/**
 * Read-only observer view of a materialized WarpGraph state.
 *
 * Provides the same query/traverse API as WarpGraph, but filtered
 * by observer configuration (match pattern, expose, redact).
 * Edges are only visible when both endpoints pass the match filter.
 *
 * @see Paper IV, Section 3 -- Observers as resource-bounded functors
 */
export class ObserverView {
  /** Observer name */
  readonly name: string;

  /** Logical graph traversal helpers scoped to this observer */
  traverse: LogicalTraversal;

  /** Checks if a node exists and is visible to this observer */
  hasNode(nodeId: string): Promise<boolean>;

  /** Gets all visible nodes that match the observer pattern */
  getNodes(): Promise<string[]>;

  /** Gets filtered properties for a visible node (null if hidden or missing) */
  getNodeProps(nodeId: string): Promise<Map<string, unknown> | null>;

  /** Gets all visible edges (both endpoints must match the observer pattern) */
  getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>>;

  /** Creates a fluent query builder operating on the filtered view */
  query(): QueryBuilder;
}

/**
 * Breakdown of MDL translation cost components.
 */
export interface TranslationCostBreakdown {
  /** Fraction of A's nodes not visible to B */
  nodeLoss: number;
  /** Fraction of A's edges not visible to B */
  edgeLoss: number;
  /** Fraction of A's properties not visible to B */
  propLoss: number;
}

/**
 * Result of a directed MDL translation cost computation.
 */
export interface TranslationCostResult {
  /** Weighted cost normalized to [0, 1] */
  cost: number;
  /** Per-component breakdown */
  breakdown: TranslationCostBreakdown;
}

/**
 * Computes the directed MDL translation cost from observer A to observer B.
 *
 * @param configA - Observer configuration for A
 * @param configB - Observer configuration for B
 * @param state - WarpStateV5 materialized state
 * @see Paper IV, Section 4 -- Directed rulial cost
 */
export function computeTranslationCost(
  configA: ObserverConfig,
  configB: ObserverConfig,
  state: WarpStateV5
): TranslationCostResult;

// ============================================================================
// State Diff (PULSE subscriptions)
// ============================================================================

/**
 * Edge change in a state diff.
 */
export interface EdgeChange {
  from: string;
  to: string;
  label: string;
}

/**
 * Property set/changed entry in a state diff.
 */
export interface PropSet {
  key: string;
  nodeId: string;
  propKey: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Property removed entry in a state diff.
 */
export interface PropRemoved {
  key: string;
  nodeId: string;
  propKey: string;
  oldValue: unknown;
}

/**
 * Deterministic diff between two materialized states.
 */
export interface StateDiffResult {
  nodes: { added: string[]; removed: string[] };
  edges: { added: EdgeChange[]; removed: EdgeChange[] };
  props: { set: PropSet[]; removed: PropRemoved[] };
}

// ============================================================================
// Temporal Query (Paper IV CTL* operators)
// ============================================================================

/**
 * Node snapshot passed to temporal predicates.
 */
export interface TemporalNodeSnapshot {
  id: string;
  exists: boolean;
  props: Record<string, unknown>;
}

/**
 * CTL*-style temporal operators over WARP graph history.
 */
export interface TemporalQuery {
  /** True iff predicate holds at every tick since `since` where the node exists. */
  always(
    nodeId: string,
    predicate: (snapshot: TemporalNodeSnapshot) => boolean,
    options?: { since?: number },
  ): Promise<boolean>;

  /** True iff predicate holds at some tick since `since`. */
  eventually(
    nodeId: string,
    predicate: (snapshot: TemporalNodeSnapshot) => boolean,
    options?: { since?: number },
  ): Promise<boolean>;
}

// ============================================================================
// PatchV2 & PatchBuilderV2
// ============================================================================

/**
 * WARP V5 patch object (schema 2 or 3).
 */
export interface PatchV2 {
  /** Schema version (2 for node/edge ops, 3 if edge properties present) */
  schema: 2 | 3;
  /** Writer ID */
  writer: string;
  /** Lamport timestamp for ordering */
  lamport: number;
  /** Writer's observed frontier (version vector) */
  context: Record<string, number>;
  /** Ordered array of operations */
  ops: unknown[];
  /** Node/edge IDs read by this patch (provenance tracking) */
  reads?: string[];
  /** Node/edge IDs written by this patch (provenance tracking) */
  writes?: string[];
}

/**
 * Fluent builder for creating WARP v5 patches with OR-Set semantics.
 *
 * Returned by WarpGraph.createPatch(). Chain mutation methods then call
 * commit() to persist the patch atomically.
 */
export class PatchBuilderV2 {
  /** Adds a node to the graph. */
  addNode(nodeId: string): PatchBuilderV2;
  /** Removes a node from the graph. */
  removeNode(nodeId: string): PatchBuilderV2;
  /** Adds an edge between two nodes. */
  addEdge(from: string, to: string, label: string): PatchBuilderV2;
  /** Removes an edge between two nodes. */
  removeEdge(from: string, to: string, label: string): PatchBuilderV2;
  /** Sets a property on a node. */
  setProperty(nodeId: string, key: string, value: unknown): PatchBuilderV2;
  /** Sets a property on an edge. */
  setEdgeProperty(from: string, to: string, label: string, key: string, value: unknown): PatchBuilderV2;
  /** Builds the PatchV2 object without committing. */
  build(): PatchV2;
  /** Commits the patch to the graph and returns the commit SHA. */
  commit(): Promise<string>;
  /** Number of operations in this patch. */
  readonly opCount: number;
}

// ============================================================================
// Writer & PatchSession
// ============================================================================

/**
 * Fluent patch session for building and committing graph mutations.
 *
 * Created by Writer.beginPatch(). Wraps a PatchBuilderV2 with CAS protection.
 */
export class PatchSession {
  /** Adds a node to the graph. */
  addNode(nodeId: string): this;
  /** Removes a node from the graph. */
  removeNode(nodeId: string): this;
  /** Adds an edge between two nodes. */
  addEdge(from: string, to: string, label: string): this;
  /** Removes an edge between two nodes. */
  removeEdge(from: string, to: string, label: string): this;
  /** Sets a property on a node. */
  setProperty(nodeId: string, key: string, value: unknown): this;
  /** Sets a property on an edge. */
  setEdgeProperty(from: string, to: string, label: string, key: string, value: unknown): this;
  /** Builds the PatchV2 object without committing. */
  build(): PatchV2;
  /** Commits the patch with CAS protection. */
  commit(): Promise<string>;
  /** Number of operations in this patch. */
  readonly opCount: number;
}

/**
 * Writer - WARP writer abstraction for safe graph mutations.
 */
export class Writer {
  /** The writer's ID. */
  readonly writerId: string;
  /** The graph namespace. */
  readonly graphName: string;
  /** Gets the current writer head SHA. */
  head(): Promise<string | null>;
  /** Begins a new patch session. */
  beginPatch(): Promise<PatchSession>;
  /**
   * Builds and commits a patch in one call.
   * @throws {WriterError} COMMIT_IN_PROGRESS if called while another commitPatch() is in progress (not reentrant)
   */
  commitPatch(build: (p: PatchSession) => void | Promise<void>): Promise<string>;
}

/**
 * Error class for Writer operations.
 */
export class WriterError extends Error {
  readonly name: 'WriterError';
  readonly code: string;
  readonly cause?: Error;

  constructor(code: string, message: string, cause?: Error);
}

// ============================================================================
// GC Types
// ============================================================================

/**
 * GC policy configuration.
 */
export interface GCPolicyConfig {
  enabled: boolean;
  tombstoneRatioThreshold: number;
  entryCountThreshold: number;
  minPatchesSinceCompaction: number;
  maxTimeSinceCompaction: number;
  compactOnCheckpoint: boolean;
}

/**
 * Result of a GC execution.
 */
export interface GCExecuteResult {
  nodesCompacted: number;
  edgesCompacted: number;
  tombstonesRemoved: number;
  durationMs: number;
}

/**
 * GC metrics for the cached state.
 */
export interface GCMetrics {
  nodeCount: number;
  edgeCount: number;
  tombstoneCount: number;
  tombstoneRatio: number;
  patchesSinceCompaction: number;
  lastCompactionTime: number;
}

/**
 * Result of maybeRunGC().
 */
export interface MaybeGCResult {
  ran: boolean;
  result: GCExecuteResult | null;
  reasons: string[];
}

// ============================================================================
// Sync Protocol Types
// ============================================================================

/**
 * Sync request message.
 */
export interface SyncRequest {
  type: 'sync-request';
  frontier: Record<string, string>;
}

/**
 * Sync response message.
 */
export interface SyncResponse {
  type: 'sync-response';
  frontier: Record<string, string>;
  patches: Array<{ writerId: string; sha: string; patch: unknown }>;
}

/**
 * Result of applySyncResponse().
 */
export interface ApplySyncResult {
  state: WarpStateV5;
  frontier: Map<string, number>;
  applied: number;
}

/**
 * Server-side auth configuration for serve().
 */
export interface SyncAuthServerOptions {
  keys: Record<string, string>;
  mode?: 'enforce' | 'log-only';
  allowedWriters?: string[];
}

/**
 * Client-side auth credentials for syncWith().
 */
export interface SyncAuthClientOptions {
  secret: string;
  keyId?: string;
}

// ============================================================================
// Status snapshot
// ============================================================================

/**
 * Lightweight status snapshot of the graph.
 */
export interface WarpGraphStatus {
  cachedState: 'fresh' | 'stale' | 'none';
  patchesSinceCheckpoint: number;
  tombstoneRatio: number;
  writers: number;
  frontier: Record<string, string>;
}

// ============================================================================
// Join Receipt
// ============================================================================

/**
 * Receipt from a join (CRDT merge) operation.
 */
export interface JoinReceipt {
  nodesAdded: number;
  nodesRemoved: number;
  edgesAdded: number;
  edgesRemoved: number;
  propsChanged: number;
  frontierMerged: boolean;
}

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
    /** If true (default), query methods auto-materialize when no cached state exists. */
    autoMaterialize?: boolean;
    onDeleteWithData?: 'reject' | 'cascade' | 'warn';
    clock?: ClockPort;
    crypto?: CryptoPort;
    codec?: unknown;
    seekCache?: SeekCachePort;
  }): Promise<WarpGraph>;

  /**
   * The graph namespace.
   */
  readonly graphName: string;

  /**
   * This writer's ID.
   */
  readonly writerId: string;

  /** Returns the attached seek cache, or null if none is set. */
  readonly seekCache: SeekCachePort | null;

  /** Attaches (or detaches, with null) a persistent seek cache. */
  setSeekCache(cache: SeekCachePort | null): void;

  /**
   * Creates a new PatchBuilderV2 for adding operations.
   */
  createPatch(): Promise<PatchBuilderV2>;

  /**
   * Convenience wrapper: creates a patch, runs the callback, and commits.
   *
   * The callback receives a PatchBuilderV2 and may be synchronous or
   * asynchronous. The commit happens only after the callback resolves.
   * If the callback throws or rejects, no commit is attempted.
   *
   * Not reentrant: calling `graph.patch()` inside a callback throws.
   * Use `createPatch()` directly for nested or concurrent patches.
   */
  patch(build: (patch: PatchBuilderV2) => void | Promise<void>): Promise<string>;

  /**
   * Returns patches from a writer's ref chain.
   */
  getWriterPatches(
    writerId: string,
    stopAtSha?: string | null
  ): Promise<Array<{ patch: PatchV2; sha: string }>>;

  /**
   * Gets all visible nodes in the materialized state.
   */
  getNodes(): Promise<string[]>;

  /**
   * Gets all visible edges in the materialized state.
   */
  getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>>;

  /**
   * Gets all properties for a node from the materialized state.
   */
  getNodeProps(nodeId: string): Promise<Map<string, unknown> | null>;

  /**
   * Returns the number of property entries in the materialized state.
   */
  getPropertyCount(): Promise<number>;

  /**
   * Returns a defensive copy of the current materialized state,
   * or null if no state has been materialized yet.
   */
  getStateSnapshot(): Promise<WarpStateV5 | null>;

  /**
   * Gets all properties for an edge from the materialized state.
   * Returns null if the edge does not exist or is tombstoned.
   */
  getEdgeProps(from: string, to: string, label: string): Promise<Record<string, unknown> | null>;

  /**
   * Checks if a node exists in the materialized state.
   */
  hasNode(nodeId: string): Promise<boolean>;

  /**
   * Gets neighbors of a node from the materialized state.
   */
  neighbors(
    nodeId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
    edgeLabel?: string,
  ): Promise<Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }>>;

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
  materializeAt(checkpointSha: string): Promise<WarpStateV5>;

  /**
   * Logical graph traversal helpers.
   */
  traverse: LogicalTraversal;

  /**
   * Creates a fluent query builder for the logical graph.
   */
  query(): QueryBuilder;

  /**
   * Creates a read-only observer view of the current materialized state.
   *
   * The observer sees only nodes matching the `match` glob pattern, with
   * property visibility controlled by `expose` and `redact` lists.
   * Edges are only visible when both endpoints pass the match filter.
   */
  observer(name: string, config: ObserverConfig): Promise<ObserverView>;

  /**
   * Computes the directed MDL translation cost from observer A to observer B.
   *
   * The cost measures how much information is lost when translating from
   * A's view to B's view. It is asymmetric: cost(A->B) != cost(B->A).
   *
   * @see Paper IV, Section 4 -- Directed rulial cost
   */
  translationCost(configA: ObserverConfig, configB: ObserverConfig): Promise<TranslationCostResult>;

  /**
   * Materializes the current graph state from all patches.
   *
   * When `options.receipts` is true, returns `{ state, receipts }`.
   * Otherwise returns the WarpStateV5 directly.
   */
  materialize(options: { receipts: true; ceiling?: number | null }): Promise<{ state: WarpStateV5; receipts: TickReceipt[] }>;
  materialize(options?: { receipts?: false; ceiling?: number | null }): Promise<WarpStateV5>;

  /**
   * Starts a built-in sync server for this graph.
   */
  serve(options: {
    port: number;
    host?: string;
    path?: string;
    maxRequestBytes?: number;
    httpPort: HttpServerPort;
    auth?: SyncAuthServerOptions;
    allowedWriters?: string[];
  }): Promise<{ close(): Promise<void>; url: string }>;

  /**
   * Syncs with a remote peer (HTTP URL or another WarpGraph instance).
   *
   * When `options.materialize` is true, the returned object also contains a `state` property.
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
    auth?: SyncAuthClientOptions;
    /** Auto-materialize after sync; when true, result includes `state` */
    materialize?: boolean;
  }): Promise<{ applied: number; attempts: number; state?: WarpStateV5 }>;

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

  /** Gets the persistence adapter. */
  get persistence(): GraphPersistencePort;

  /** Gets the onDeleteWithData policy. */
  get onDeleteWithData(): 'reject' | 'cascade' | 'warn';

  /** Synchronous CRDT merge of another state into the cached state. */
  join(otherState: WarpStateV5): { state: WarpStateV5; receipt: JoinReceipt };

  /** Creates an octopus anchor commit recording all writer tips. */
  syncCoverage(): Promise<void>;

  /** Returns a lightweight status snapshot of the graph. */
  status(): Promise<WarpGraphStatus>;

  /** Subscribes to graph changes after each materialize(). */
  subscribe(options: {
    onChange: (diff: StateDiffResult) => void;
    onError?: (error: Error) => void;
    replay?: boolean;
  }): { unsubscribe: () => void };

  /** Filtered watcher that only fires for changes matching a glob pattern. */
  watch(
    pattern: string,
    options: {
      onChange: (diff: StateDiffResult) => void;
      onError?: (error: Error) => void;
      poll?: number;
    },
  ): { unsubscribe: () => void };

  /** Creates a sync request containing the local frontier. */
  createSyncRequest(): Promise<SyncRequest>;

  /** Processes an incoming sync request and returns patches the requester needs. */
  processSyncRequest(request: SyncRequest): Promise<SyncResponse>;

  /** Applies a sync response to the cached state. */
  applySyncResponse(response: SyncResponse): ApplySyncResult;

  /** Checks if sync is needed with a remote frontier. */
  syncNeeded(remoteFrontier: Map<string, string>): Promise<boolean>;

  /** Gets or creates a Writer, optionally resolving from git config. */
  writer(writerId?: string): Promise<Writer>;

  /**
   * Creates a new Writer with a fresh canonical ID.
   * @deprecated Use writer() or writer(id) instead.
   */
  createWriter(opts?: {
    persist?: 'config' | 'none';
    alias?: string;
  }): Promise<Writer>;

  /** Checks GC thresholds and runs GC if needed. */
  maybeRunGC(): MaybeGCResult;

  /** Explicitly runs GC on the cached state. */
  runGC(): GCExecuteResult;

  /** Gets current GC metrics for the cached state. */
  getGCMetrics(): GCMetrics | null;

  /** Gets the current GC policy configuration. */
  get gcPolicy(): GCPolicyConfig;

  /** CTL*-style temporal operators over graph history. */
  get temporal(): TemporalQuery;
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

// ============================================================================
// WARP Type Constructors
// ============================================================================

/** Operation: node add */
export interface OpNodeAdd {
  readonly type: 'NodeAdd';
  readonly node: string;
}

/** Operation: node tombstone */
export interface OpNodeTombstone {
  readonly type: 'NodeTombstone';
  readonly node: string;
}

/** Operation: edge add */
export interface OpEdgeAdd {
  readonly type: 'EdgeAdd';
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

/** Operation: edge tombstone */
export interface OpEdgeTombstone {
  readonly type: 'EdgeTombstone';
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

/** Operation: property set */
export interface OpPropSet {
  readonly type: 'PropSet';
  readonly node: string;
  readonly key: string;
  readonly value: ValueRef;
}

/** Inline value reference */
export interface ValueRefInline {
  readonly type: 'inline';
  readonly value: unknown;
}

/** Blob value reference */
export interface ValueRefBlob {
  readonly type: 'blob';
  readonly oid: string;
}

/** Value reference -- either inline or blob */
export type ValueRef = ValueRefInline | ValueRefBlob;

/** EventId for total ordering of operations across patches */
export interface EventId {
  readonly lamport: number;
  readonly writerId: string;
  readonly patchSha: string;
  readonly opIndex: number;
}

/** Creates a NodeAdd operation. */
export function createNodeAdd(node: string): OpNodeAdd;

/** Creates a NodeTombstone operation. */
export function createNodeTombstone(node: string): OpNodeTombstone;

/** Creates an EdgeAdd operation. */
export function createEdgeAdd(from: string, to: string, label: string): OpEdgeAdd;

/** Creates an EdgeTombstone operation. */
export function createEdgeTombstone(from: string, to: string, label: string): OpEdgeTombstone;

/** Creates a PropSet operation. */
export function createPropSet(node: string, key: string, value: ValueRef): OpPropSet;

/** Creates an inline value reference. */
export function createInlineValue(value: unknown): ValueRefInline;

/** Creates a blob value reference. */
export function createBlobValue(oid: string): ValueRefBlob;

/** Creates an EventId for total ordering of operations. */
export function createEventId(options: {
  lamport: number;
  writerId: string;
  patchSha: string;
  opIndex: number;
}): EventId;

// ============================================================================
// WARP Migration
// ============================================================================

/** Migrates a V4 visible-projection state to a V5 state with ORSet internals. */
export function migrateV4toV5(v4State: {
  nodeAlive: Map<string, { value: boolean }>;
  edgeAlive: Map<string, { value: boolean }>;
  prop: Map<string, unknown>;
}, migrationWriterId: string): WarpStateV5;

/**
 * A patch entry in a provenance payload.
 */
export interface PatchEntry {
  /** The decoded patch object */
  patch: PatchV2;
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
  readonly U_0: Uint8Array;
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
  key: string | Uint8Array;
  /** Custom ISO timestamp (defaults to now) */
  timestamp?: string;
  /** CryptoPort instance for HMAC computation */
  crypto?: CryptoPort;
  /** Custom codec for serialization */
  codec?: unknown;
}

/**
 * Options for verifying a BTR.
 */
export interface VerifyBTROptions {
  /** Also verify replay produces h_out (default: false) */
  verifyReplay?: boolean;
  /** CryptoPort instance for HMAC verification */
  crypto?: CryptoPort;
  /** Custom codec for serialization */
  codec?: unknown;
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
): Promise<BTR>;

/**
 * Verifies a Boundary Transition Record.
 *
 * @param btr - The BTR to verify
 * @param key - HMAC key
 * @param options - Verification options
 */
export function verifyBTR(
  btr: BTR,
  key: string | Uint8Array,
  options?: VerifyBTROptions
): Promise<BTRVerificationResult>;

/**
 * Replays a BTR to produce the final state.
 *
 * @param btr - The BTR to replay
 * @returns The final state and its hash
 */
export function replayBTR(btr: BTR, options?: { crypto?: CryptoPort; codec?: unknown }): Promise<{ state: WarpStateV5; h_out: string }>;

/**
 * Serializes a BTR to CBOR bytes for transport.
 *
 * @param btr - The BTR to serialize
 */
export function serializeBTR(btr: BTR): Uint8Array;

/**
 * Deserializes a BTR from CBOR bytes.
 *
 * @param bytes - CBOR-encoded BTR
 * @throws {Error} If the bytes are not valid CBOR or missing required fields
 */
export function deserializeBTR(bytes: Uint8Array): BTR;

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
