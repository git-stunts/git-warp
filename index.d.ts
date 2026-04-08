/**
 * @git-stunts/git-warp - A graph database where every node is a Git commit pointing to the Empty Tree.
 */

/**
 * Causality tracking for distributed CRDT systems.
 * Maps each writer ID to the highest observed operation counter.
 */
export class VersionVector {
  static empty(): VersionVector;
  static from(source: VersionVector | Map<string, number> | Record<string, number>): VersionVector;
  get(writerId: string): number | undefined;
  set(writerId: string, counter: number): this;
  has(writerId: string): boolean;
  get size(): number;
  keys(): IterableIterator<string>;
  values(): IterableIterator<number>;
  entries(): IterableIterator<[string, number]>;
  [Symbol.iterator](): IterableIterator<[string, number]>;
  increment(writerId: string): { writerId: string; counter: number };
  merge(other: VersionVector): VersionVector;
  descends(other: VersionVector): boolean;
  contains(dot: { writerId: string; counter: number }): boolean;
  clone(): VersionVector;
  equals(other: VersionVector): boolean;
}

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
  match(pattern: string | string[]): QueryBuilder;
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
export interface TraverseFacadeOptions {
  maxDepth?: number;
  dir?: 'out' | 'in' | 'both';
  labelFilter?: string | string[];
}

/** Edge weight function for weighted traversal algorithms. */
export type EdgeWeightFn = (from: string, to: string, label: string) => number | Promise<number>;
/** Node weight function for weighted traversal algorithms. */
export type NodeWeightFn = (nodeId: string) => number | Promise<number>;
/** Selector for weighted cost traversal mode — supply either an edge or node weight function, not both. */
export type WeightedCostSelector =
  | { weightFn?: EdgeWeightFn; nodeWeightFn?: never }
  | { nodeWeightFn?: NodeWeightFn; weightFn?: never };

/** @deprecated Traversal facade that delegates to GraphTraversal. Use GraphTraversal directly. */
export interface LogicalTraversal {
  bfs(start: string, options?: TraverseFacadeOptions): Promise<string[]>;
  dfs(start: string, options?: TraverseFacadeOptions): Promise<string[]>;
  shortestPath(from: string, to: string, options?: TraverseFacadeOptions): Promise<{ found: boolean; path: string[]; length: number }>;
  connectedComponent(start: string, options?: {
    maxDepth?: number;
    labelFilter?: string | string[];
  }): Promise<string[]>;
  isReachable(from: string, to: string, options?: TraverseFacadeOptions & {
    signal?: AbortSignal;
  }): Promise<{ reachable: boolean }>;
  weightedShortestPath(from: string, to: string, options?: WeightedCostSelector & {
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
    signal?: AbortSignal;
  }): Promise<{ path: string[]; totalCost: number }>;
  aStarSearch(from: string, to: string, options?: WeightedCostSelector & {
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
    heuristicFn?: (nodeId: string, goalId: string) => number;
    signal?: AbortSignal;
  }): Promise<{ path: string[]; totalCost: number; nodesExplored: number }>;
  bidirectionalAStar(from: string, to: string, options?: WeightedCostSelector & {
    labelFilter?: string | string[];
    forwardHeuristic?: (nodeId: string, goalId: string) => number;
    backwardHeuristic?: (nodeId: string, goalId: string) => number;
    signal?: AbortSignal;
  }): Promise<{ path: string[]; totalCost: number; nodesExplored: number }>;
  topologicalSort(start: string | string[], options?: {
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
    throwOnCycle?: boolean;
    signal?: AbortSignal;
  }): Promise<{ sorted: string[]; hasCycle: boolean }>;
  commonAncestors(nodes: string[], options?: {
    maxDepth?: number;
    labelFilter?: string | string[];
    maxResults?: number;
    signal?: AbortSignal;
  }): Promise<{ ancestors: string[] }>;
  weightedLongestPath(from: string, to: string, options?: WeightedCostSelector & {
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
    signal?: AbortSignal;
  }): Promise<{ path: string[]; totalCost: number }>;
  levels(start: string | string[], options?: {
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
    signal?: AbortSignal;
  }): Promise<{ levels: Map<string, number>; maxLevel: number }>;
  transitiveReduction(start: string | string[], options?: {
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
    signal?: AbortSignal;
  }): Promise<{ edges: Array<{ from: string; to: string; label: string }>; removed: number }>;
  transitiveClosure(start: string | string[], options?: {
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
    maxEdges?: number;
    signal?: AbortSignal;
  }): Promise<{ edges: Array<{ from: string; to: string }> }>;
  transitiveClosureStream(start: string | string[], options?: {
    dir?: 'out' | 'in' | 'both';
    labelFilter?: string | string[];
    maxEdges?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<{ from: string; to: string }, void, unknown>;
  rootAncestors(start: string, options?: {
    labelFilter?: string | string[];
    maxDepth?: number;
    signal?: AbortSignal;
  }): Promise<{ roots: string[] }>;
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

/** Abstract port for Git persistence operations (commits, refs, blobs, trees). */
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
  abstract writeBlob(content: Uint8Array | string): Promise<string>;
  /** Writes a tree from entries and returns its OID */
  abstract writeTree(entries: string[]): Promise<string>;
  /** Reads a blob by OID */
  abstract readBlob(oid: string): Promise<Uint8Array>;
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

/** Numeric log level value (0=debug, 1=info, 2=warn, 3=error, 4=silent). */
export type LogLevelValue = 0 | 1 | 2 | 3 | 4;

/**
 * Port interface for cryptographic operations.
 * @abstract
 */
export abstract class CryptoPort {
  /** Computes a hash digest of the given data */
  abstract hash(algorithm: string, data: string | Uint8Array): Promise<string>;
  /** Computes an HMAC of the given data */
  abstract hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array>;
  /** Constant-time comparison of two byte arrays */
  abstract timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
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
  abstract get(key: string): Promise<{ buffer: Uint8Array; indexTreeOid?: string } | null>;
  /** Stores a state buffer under the given key. */
  abstract set(key: string, buffer: Uint8Array, options?: { indexTreeOid?: string }): Promise<void>;
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
 * Port interface for content blob storage operations.
 * Abstracts how large binary content is stored and retrieved.
 * @abstract
 */
export abstract class BlobStoragePort {
  /** Stores content and returns a storage identifier (e.g. CAS tree OID). */
  abstract store(content: Uint8Array | string, options?: { slug?: string; mime?: string | null; size?: number | null }): Promise<string>;
  /** Retrieves content by its storage identifier. */
  abstract retrieve(oid: string): Promise<Uint8Array>;
  /** Stores content from a streaming source and returns a storage identifier. */
  abstract storeStream(source: AsyncIterable<Uint8Array>, options?: { slug?: string; mime?: string | null; size?: number | null }): Promise<string>;
  /** Retrieves content as an async iterable of chunks. */
  abstract retrieveStream(oid: string): AsyncIterable<Uint8Array>;
}

/**
 * In-memory blob storage adapter for browser and test paths.
 * Content-addressed Map-based storage implementing BlobStoragePort.
 */
export class InMemoryBlobStorageAdapter extends BlobStoragePort {
  store(content: Uint8Array | string, options?: { slug?: string; mime?: string | null; size?: number | null }): Promise<string>;
  retrieve(oid: string): Promise<Uint8Array>;
  storeStream(source: AsyncIterable<Uint8Array>, options?: { slug?: string; mime?: string | null; size?: number | null }): Promise<string>;
  retrieveStream(oid: string): AsyncIterable<Uint8Array>;
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
  execute(options: { args: string[]; input?: string | Uint8Array }): Promise<string>;
  executeStream(options: { args: string[] }): Promise<AsyncIterable<Uint8Array> & { collect(opts?: { asString?: boolean }): Promise<Uint8Array | string> }>;
}

/**
 * In-memory persistence adapter for fast unit/integration tests.
 *
 * Implements the same GraphPersistencePort contract as GitGraphAdapter
 * but stores all data in Maps — no real Git I/O required.
 */
export class InMemoryGraphAdapter extends GraphPersistencePort {
  constructor(options?: {
    author?: string;
    clock?: { now: () => number };
    hash?: (data: Uint8Array) => string;
  });

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
  writeBlob(content: Uint8Array | string): Promise<string>;
  writeTree(entries: string[]): Promise<string>;
  readTree(treeOid: string): Promise<Record<string, Uint8Array>>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  readBlob(oid: string): Promise<Uint8Array>;
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
  hash(algorithm: string, data: string | Uint8Array): Promise<string>;
  hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array>;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

/**
 * Web Crypto API adapter implementing CryptoPort.
 *
 * Uses the standard Web Crypto API (globalThis.crypto.subtle) which is
 * available in browsers, Deno, Bun, and Node.js 20+.
 */
export class WebCryptoAdapter extends CryptoPort {
  constructor(options?: { subtle?: SubtleCrypto });
  hash(algorithm: string, data: string | Uint8Array): Promise<string>;
  hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array>;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
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
    body?: Uint8Array;
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
    body?: Uint8Array;
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
    body?: Uint8Array;
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
  serialize(options?: { frontier?: Map<string, string> }): Promise<Record<string, Uint8Array>>;
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
  serialize(): Promise<Record<string, Uint8Array>>;
}

/**
 * Builds a bitmap index from materialized WARP state.
 *
 * Convenience function that creates a WarpStateIndexBuilder, builds from state,
 * and returns the serialized tree and stats.
 */
export function buildWarpStateIndex(state: WarpStateV5, options?: { crypto?: CryptoPort }): Promise<{ tree: Record<string, Uint8Array>; stats: { nodes: number; edges: number } }>;

/**
 * Computes a deterministic hash of a WarpStateV5 state.
 *
 * Uses canonical serialization to ensure the same state always produces
 * the same hash regardless of property iteration order.
 */
export function computeStateHashV5(state: WarpStateV5, options?: { crypto?: CryptoPort; codec?: unknown }): Promise<string | null>;

/**
 * Projects a materialized WarpStateV5 into its visible graph projection.
 *
 * This is the stable substrate helper for higher layers that need to inspect
 * materialized strand or coordinate state without depending on OR-Set
 * internals.
 */
export function projectStateV5(state: WarpStateV5): VisibleStateProjectionV5;

/**
 * Creates a substrate-generic reader over a materialized WarpStateV5.
 *
 * The reader exposes stable node/edge/property helpers plus entity-local node
 * inspection without requiring callers to understand reducer internals.
 */
export function createStateReaderV5(state: WarpStateV5): VisibleStateReaderV5;

/**
 * Compares two materialized WarpStateV5 snapshots using only their visible
 * substrate truth.
 */
export function compareVisibleStateV5(
  leftState: WarpStateV5,
  rightState: WarpStateV5,
  options?: { targetId?: string | null },
): VisibleStateComparisonV5;

/**
 * Normalizes a substrate-generic visible-state scope. Current v1 scope
 * supports include/exclude node-id prefixes; dependent edges and properties
 * follow node visibility.
 */
export function normalizeVisibleStateScopeV1(
  scope: unknown,
  field?: string,
): VisibleStateScopeV1 | null;

/**
 * Projects a materialized WarpStateV5 down to the visible subset admitted by
 * a normalized visible-state scope.
 */
export function scopeMaterializedStateV5(
  state: WarpStateV5,
  scope?: VisibleStateScopeV1 | null,
): WarpStateV5;

/**
 * Exports the exact deterministic substrate fact hashed by a coordinate
 * comparison digest as a JSON-safe envelope for higher-layer storage.
 */
export function exportCoordinateComparisonFact(
  comparison: CoordinateComparisonV1,
): CoordinateComparisonFactExportV1;

/**
 * Exports the exact deterministic substrate fact hashed by a coordinate
 * transfer-plan digest as a JSON-safe envelope without raw attachment bytes.
 */
export function exportCoordinateTransferPlanFact(
  transferPlan: CoordinateTransferPlanV1,
): CoordinateTransferPlanFactExportV1;

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
 * Binary search over WARP graph history.
 * Finds the first bad patch between a known-good and known-bad commit.
 * @since 13.0.0
 */
export class BisectService {
  constructor(options: { graph: { getWriterPatches: WarpCore['getWriterPatches']; materialize: WarpCore['materialize'] } });

  /**
   * Runs bisect on a single writer's patch chain.
   */
  run(options: {
    good: string;
    bad: string;
    writerId: string;
    testFn: (state: WarpStateV5, sha: string) => Promise<boolean>;
  }): Promise<BisectResult>;
}

/**
 * Result of a bisect operation.
 *
 * Discriminated union on `result`:
 * - `'found'`: the first bad patch was identified.
 * - `'range-error'`: the good/bad range was invalid (e.g., SHAs not found, same SHA, not ancestor).
 */
export type BisectResult =
  | { result: 'found'; firstBadPatch: string; writerId: string; lamport: number; steps: number; totalCandidates: number }
  | { result: 'range-error'; message: string };

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
 * Error class for malformed or invalid patch operations.
 */
export class PatchError extends Error {
  readonly name: 'PatchError';
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: {
    code?: string;
    context?: Record<string, unknown>;
  });
}

/**
 * Error class for audit receipt validation and persistence failures.
 */
export class AuditError extends Error {
  readonly name: 'AuditError';
  readonly code: string;
  readonly context: Record<string, unknown>;

  static readonly E_AUDIT_INVALID: 'E_AUDIT_INVALID';
  static readonly E_AUDIT_CAS_FAILED: 'E_AUDIT_CAS_FAILED';
  static readonly E_AUDIT_DEGRADED: 'E_AUDIT_DEGRADED';
  static readonly E_AUDIT_CHAIN_GAP: 'E_AUDIT_CHAIN_GAP';
  static readonly E_AUDIT_WRITER_MISMATCH: 'E_AUDIT_WRITER_MISMATCH';

  constructor(message: string, options?: {
    code?: string;
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
 * Error class for strand descriptor and replay operations.
 */
export class StrandError extends Error {
  readonly name: 'StrandError';
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
 * Well-known property key for content attachment.
 * Stores a content-addressed blob OID as the property value.
 */
export const CONTENT_PROPERTY_KEY: '_content';

/**
 * Aperture definition for an observer.
 *
 * A lens describes which nodes are visible and which properties are exposed or
 * redacted within that projection.
 */
export interface Aperture {
  /** Glob pattern or array of patterns for visible nodes (e.g. 'user:*' or ['user:*', 'team:*']) */
  match: string | string[];
  /** Property keys to include (whitelist). If omitted, all non-redacted properties are visible. */
  expose?: string[];
  /** Property keys to exclude (blacklist). Takes precedence over expose. */
  redact?: string[];
}

/**
 * Legacy compatibility alias for Aperture.
 */
export type ObserverConfig = Aperture;

/** Observer source pinned to the live materialized frontier. */
export interface LiveObserverSource {
  kind: 'live';
  ceiling?: number | null;
}

/** Observer source pinned to an explicit coordinate (writer-tip frontier + ceiling). */
export interface CoordinateObserverSource {
  kind: 'coordinate';
  frontier: Map<string, string> | Record<string, string>;
  ceiling?: number | null;
}

/** Observer source pinned to a single strand's visible patch universe. */
export interface StrandObserverSource {
  kind: 'strand';
  strandId: string;
  ceiling?: number | null;
}

/** Union of observer source types for worldline creation. */
export type WorldlineSource = LiveObserverSource | CoordinateObserverSource | StrandObserverSource;

/** Abstract base for worldline selectors. */
export class WorldlineSelector {
  /** Deep-clone this selector. */
  clone(): WorldlineSelector;
  /** Convert to a plain DTO matching the WorldlineSource shape. */
  toDTO(): WorldlineSource;
  /** Normalize a raw source or plain object into a selector instance. */
  static from(raw: WorldlineSelector | WorldlineSource | null | undefined): WorldlineSelector;
}

/** Worldline selector for the canonical (live) worldline. */
export class LiveSelector extends WorldlineSelector {
  constructor(ceiling?: number | null);
  readonly ceiling: number | null;
  clone(): LiveSelector;
  toDTO(): LiveObserverSource;
}

/** Worldline selector for a hypothetical worldline at specific writer tips. */
export class CoordinateSelector extends WorldlineSelector {
  constructor(frontier: Map<string, string> | Record<string, string>, ceiling?: number | null);
  readonly frontier: Map<string, string>;
  readonly ceiling: number | null;
  clone(): CoordinateSelector;
  toDTO(): CoordinateObserverSource;
}

/** Worldline selector for one writer's isolated worldline. */
export class StrandSelector extends WorldlineSelector {
  constructor(strandId: string, ceiling?: number | null);
  readonly strandId: string;
  readonly ceiling: number | null;
  clone(): StrandSelector;
  toDTO(): StrandObserverSource;
}

/** Options for creating a worldline handle. */
export interface WorldlineOptions {
  source?: WorldlineSource;
}

/** Options for creating an observer. */
export interface ObserverOptions {
  source?: WorldlineSource;
}

/**
 * Read-only observer over a materialized WarpCore state.
 *
 * Provides the same query/traverse API as WarpCore, but filtered through a
 * lens (match pattern, expose, redact).
 * Edges are only visible when both endpoints pass the match filter.
 *
 */
export class Observer {
  /** Observer name (defaults to `observer` when omitted at construction time) */
  readonly name: string;

  /** Pinned observer source */
  readonly source: LiveObserverSource | CoordinateObserverSource | StrandObserverSource | null;

  /** Pinned snapshot hash (null only for internal delegate-mode instances) */
  readonly stateHash: string | null;

  /** Logical graph traversal helpers scoped to this observer */
  traverse: LogicalTraversal;

  /** Checks if a node exists and is visible to this observer */
  hasNode(nodeId: string): Promise<boolean>;

  /** Gets all visible nodes that match the observer aperture. */
  getNodes(): Promise<string[]>;

  /** Gets filtered properties for a visible node (null if hidden or missing). */
  getNodeProps(nodeId: string): Promise<Record<string, unknown> | null>;

  /** Gets all visible edges (both endpoints must match the observer aperture). */
  getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>>;

  /** Creates a fluent query builder operating on the filtered view. */
  query(): QueryBuilder;

  /** Creates a new observer over the same aperture at a different source */
  seek(options?: ObserverOptions): Promise<Observer>;
}

/**
 * First-class read-side history handle over a pinned source selector.
 */
export class Worldline {
  /** Pinned source for this worldline handle */
  readonly source: WorldlineSource;

  /** Full-aperture traversal helpers over this pinned source. */
  traverse: LogicalTraversal;

  /** Returns a new worldline handle pinned to a different source */
  seek(options?: WorldlineOptions): Promise<Worldline>;

  /**
   * Checks whether a node exists on this pinned worldline.
   */
  hasNode(nodeId: string): Promise<boolean>;

  /**
   * Full-aperture read over this pinned source.
   *
   * Useful for stable reads, but still a broad enumeration operation over the
   * visible worldline state.
   */
  getNodes(): Promise<string[]>;

  /**
   * Reads one node from this pinned worldline without requiring an explicit
   * observer aperture.
   */
  getNodeProps(nodeId: string): Promise<Record<string, unknown> | null>;

  /**
   * Full-aperture edge read over this pinned source.
   */
  getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>>;

  /**
   * Creates a fluent query builder over this pinned worldline.
   *
   * Use this when you want a stable read without a filtered observer aperture.
   * Add `observer(...)` when the application needs a narrower view.
   */
  query(): QueryBuilder;

  /**
   * Advanced substrate replay primitive for this pinned source.
   *
   * For application-facing reads, prefer `Observer` query/traverse helpers over direct materialization.
   */
  materialize(options: { receipts: true }): Promise<{ state: WarpStateV5; receipts: TickReceipt[] }>;
  materialize(options?: { receipts?: false }): Promise<WarpStateV5>;

  /** Creates an observer pinned to the worldline source when a filtered aperture is needed. */
  observer(config: Aperture): Promise<Observer>;
  observer(name: string, config: Aperture): Promise<Observer>;
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
 * @param configA - Aperture for observer A
 * @param configB - Aperture for observer B
 * @param state - WarpStateV5 materialized state
 */
export function computeTranslationCost(
  configA: Aperture,
  configB: Aperture,
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
// Temporal Query (history-aware temporal operators)
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

/** Options for content attachment metadata (mime type, size hint). */
export interface ContentAttachmentOptions {
  mime?: string | null;
  size?: number | null;
}

/** Structured content metadata returned by getContentMeta/getEdgeContentMeta. */
export interface ContentMeta {
  oid: string;
  mime: string | null;
  size: number | null;
}

// ============================================================================
// Patch & PatchBuilderV2
// ============================================================================

/**
 * WARP V5 patch object (schema 2 or 3).
 */
export interface Patch {
  /** Schema version (2 for node/edge ops, 3 if edge properties present) */
  schema: 2 | 3;
  /** Writer ID */
  writer: string;
  /** Lamport timestamp for ordering */
  lamport: number;
  /** Writer's observed frontier (version vector) */
  context: VersionVector | Record<string, number>;
  /** Ordered array of operations */
  ops: unknown[];
  /** Node/edge IDs read by this patch (provenance tracking) */
  reads?: string[] | undefined;
  /** Node/edge IDs written by this patch (provenance tracking) */
  writes?: string[] | undefined;
}

/** @deprecated Use Patch instead. */
export type PatchV2 = Patch;

/**
 * Fluent builder for creating WARP v5 patches with OR-Set semantics.
 *
 * Returned by WarpCore.createPatch(). Chain mutation methods then call
 * commit() to persist one atomic WARP patch under `refs/warp/...`.
 * This does not touch the caller's normal Git worktree.
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
  /** Attaches content to a node (writes blob + sets _content property). */
  attachContent(nodeId: string, content: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | Uint8Array | string, metadata?: ContentAttachmentOptions): Promise<PatchBuilderV2>;
  /** Clears content from a node (sets _content metadata registers to null). */
  clearContent(nodeId: string): PatchBuilderV2;
  /** Attaches content to an edge (writes blob + sets _content edge property). */
  attachEdgeContent(from: string, to: string, label: string, content: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | Uint8Array | string, metadata?: ContentAttachmentOptions): Promise<PatchBuilderV2>;
  /** Clears content from an edge (sets _content metadata registers to null). */
  clearEdgeContent(from: string, to: string, label: string): PatchBuilderV2;
  /** Builds the Patch object without committing. */
  build(): Patch;
  /** Commits one atomic WARP patch under `refs/warp/...` and returns the patch commit SHA. */
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
  /** Attaches content to a node (writes blob + sets _content property). */
  attachContent(nodeId: string, content: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | Uint8Array | string, metadata?: ContentAttachmentOptions): Promise<this>;
  /** Clears content from a node (sets _content metadata registers to null). */
  clearContent(nodeId: string): this;
  /** Attaches content to an edge (writes blob + sets _content edge property). */
  attachEdgeContent(from: string, to: string, label: string, content: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | Uint8Array | string, metadata?: ContentAttachmentOptions): Promise<this>;
  /** Clears content from an edge (sets _content metadata registers to null). */
  clearEdgeContent(from: string, to: string, label: string): this;
  /** Builds the Patch object without committing. */
  build(): Patch;
  /** Commits one atomic WARP patch with CAS protection. */
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
   * Builds and commits one patch in one call.
   * The callback does not commit per write; all queued mutations become one
   * atomic WARP patch after the callback finishes.
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

/**
 * Error thrown when a patch requires decryption but no patchBlobStorage
 * (with encryption key) is configured.
 */
export class EncryptionError extends Error {
  readonly name: 'EncryptionError';
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options?: { context?: Record<string, unknown> });
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
  skippedWriters?: Array<{ writerId: string; reason: string; localSha: string; remoteSha: string | null }>;
}

/**
 * Result of applySyncResponse().
 */
export interface ApplySyncResult {
  state: WarpStateV5;
  frontier: Map<string, number>;
  applied: number;
  skippedWriters: Array<{ writerId: string; reason: string; localSha: string; remoteSha: string | null }>;
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

/**
 * Trust configuration for inbound patch evaluation during sync.
 */
export interface SyncTrustOptions {
  mode?: 'off' | 'log-only' | 'enforce';
  pin?: string | null;
}

// ============================================================================
// Status snapshot
// ============================================================================

/**
 * Lightweight status snapshot of the graph.
 */
export interface WarpStatus {
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

declare class WarpCoreBase {
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
    trust?: SyncTrustOptions;
    /** Content blob storage (for attachContent/attachEdgeContent). */
    blobStorage?: BlobStoragePort;
    /** Patch blob storage — when set, patch CBOR is encrypted via this port. */
    patchBlobStorage?: BlobStoragePort;
    /** Pre-built effect pipeline (takes priority over effectSinks + externalizationPolicy). */
    effectPipeline?: EffectPipeline;
    /** Effect sinks — auto-constructs an EffectPipeline with a MultiplexSink. */
    effectSinks?: EffectSinkPort[];
    /** Externalization policy for auto-constructed pipeline (defaults to LIVE_LENS). */
    externalizationPolicy?: ExternalizationPolicy;
  }): Promise<WarpCore>;

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

  // ── Effect pipeline ──────────────────────────────────────────────────

  /** Returns the attached effect pipeline, or null if none is configured. */
  get effectPipeline(): EffectPipeline | null;
  /** Attaches (or replaces) the effect pipeline after construction. */
  set effectPipeline(pipeline: EffectPipeline | null);

  /** Returns all effect emissions from the pipeline, or an empty array. */
  readonly effectEmissions: readonly EffectEmission[];
  /** Returns all delivery observations from the pipeline, or an empty array. */
  readonly deliveryObservations: readonly DeliveryObservation[];

  /** Returns the current externalization policy, or null if no pipeline is configured. */
  get externalizationPolicy(): ExternalizationPolicy | null;
  /** Updates the externalization policy on the attached pipeline. */
  set externalizationPolicy(newLens: ExternalizationPolicy);


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
   * Applies multiple patches sequentially. Each callback sees the state
   * produced by the previous commit.
   * @since 13.0.0
   */
  patchMany(
    ...builds: Array<(patch: PatchBuilderV2) => void | Promise<void>>
  ): Promise<string[]>;

  /**
   * Returns patches from a writer's ref chain.
   */
  getWriterPatches(
    writerId: string,
    stopAtSha?: string | null
  ): Promise<Array<{ patch: Patch; sha: string }>>;

  /**
   * Inspection API: enumerates all visible nodes in the current materialized state.
   *
   * Legitimate for whole-visible-state reads, tooling, migration, and admin
   * surfaces. The anti-pattern is pulling results like this into an app-local
   * shadow graph instead of using `Worldline`, `Observer`, `query()`, or
   * `traverse`.
   */
  getNodes(): Promise<string[]>;

  /**
   * Inspection API: enumerates all visible edges in the current materialized state.
   *
   * Legitimate for whole-visible-state reads, tooling, migration, and admin
   * surfaces. Prefer pinned handles when you are exposing a stable product
   * surface, and avoid rebuilding your own traversal layer above the substrate.
   */
  getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>>;

  /**
   * Inspection API: reads one node from the current materialized state.
   *
   * Safe for targeted checks. If you find yourself looping this across many ids
   * to reconstruct graph structure, move the read flow toward `Worldline` /
   * `Observer` query or traversal instead.
   */
  getNodeProps(nodeId: string): Promise<Record<string, unknown> | null>;

  /**
   * Returns the number of property entries in the materialized state.
   */
  getPropertyCount(): Promise<number>;

  /**
   * Returns a defensive copy of the current materialized state,
   * or null if no state has been materialized yet.
   *
   * Useful for explicit substrate integration, debugging, or snapshot export.
   * Application-facing reads are usually clearer through `Worldline` or
   * `Observer` handles.
   */
  getStateSnapshot(): Promise<WarpStateV5 | null>;

  /**
   * Gets all properties for an edge from the materialized state.
   * Returns null if the edge does not exist or is tombstoned.
   */
  getEdgeProps(from: string, to: string, label: string): Promise<Record<string, unknown> | null>;

  /**
   * Gets the content blob OID for a node, or null if none is attached.
   */
  getContentOid(nodeId: string): Promise<string | null>;

  /**
   * Gets structured content metadata for a node attachment, or null if none is attached.
   */
  getContentMeta(nodeId: string): Promise<ContentMeta | null>;

  /**
   * Gets the content blob for a node, or null if none is attached.
   * Returns raw bytes; use `new TextDecoder().decode(result)` for text.
   */
  getContent(nodeId: string): Promise<Uint8Array | null>;

  /**
   * Gets the content blob OID for an edge, or null if none is attached.
   */
  getEdgeContentOid(from: string, to: string, label: string): Promise<string | null>;

  /**
   * Gets structured content metadata for an edge attachment, or null if none is attached.
   */
  getEdgeContentMeta(from: string, to: string, label: string): Promise<ContentMeta | null>;

  /**
   * Gets the content blob for an edge, or null if none is attached.
   * Returns raw bytes; use `new TextDecoder().decode(result)` for text.
   */
  getEdgeContent(from: string, to: string, label: string): Promise<Uint8Array | null>;

  /**
   * Gets the content blob for a node as a stream, or null if none is attached.
   * Returns an async iterable of Uint8Array chunks for incremental consumption.
   */
  getContentStream(nodeId: string): Promise<AsyncIterable<Uint8Array> | null>;

  /**
   * Gets the content blob for an edge as a stream, or null if none is attached.
   * Returns an async iterable of Uint8Array chunks for incremental consumption.
   */
  getEdgeContentStream(from: string, to: string, label: string): Promise<AsyncIterable<Uint8Array> | null>;

  /**
   * Checks if a node exists in the materialized state.
   */
  hasNode(nodeId: string): Promise<boolean>;

  /**
   * Inspection API: walks visible neighbors from the current materialized state.
   *
   * Useful for bounded graph exploration, admin reads, and tooling. When you
   * are building a stable product surface, prefer an explicit `Worldline` /
   * `Observer` handle and the built-in traversal helpers instead of inventing a
   * second traversal engine in app code.
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
   * Creates a fluent query builder over the currently visible materialized state.
   *
   * Prefer `worldline().query()` for stable product reads, or
   * `worldline().observer(...).query()` when you need a filtered aperture.
   * Direct runtime queries are still valid whole-visible-state or admin reads.
   * The thing to avoid is exporting those results into a separate app-local
   * graph/query layer when the substrate already provides one.
   */
  query(): QueryBuilder;

  /**
   * Creates a first-class worldline handle over a pinned read source.
   */
  worldline(options?: WorldlineOptions): Worldline;

  /**
   * Creates a read-only observer over the current materialized state.
  *
  * The observer sees only nodes matching the `match` glob pattern, with
  * property visibility controlled by `expose` and `redact` lists.
  * Edges are only visible when both endpoints pass the match filter.
  */
  observer(config: Aperture, options?: ObserverOptions): Promise<Observer>;
  observer(name: string, config: Aperture, options?: ObserverOptions): Promise<Observer>;

  /**
   * Computes the directed MDL translation cost from observer A to observer B.
   *
   * The cost measures how much information is lost when translating from
   * A's view to B's view. It is asymmetric: cost(A->B) != cost(B->A).
   *
   */
  translationCost(configA: Aperture, configB: Aperture): Promise<TranslationCostResult>;

  /**
   * Advanced substrate replay primitive over the live frontier.
   *
   * When `options.receipts` is true, returns `{ state, receipts }`.
   * Otherwise returns the WarpStateV5 directly.
   *
   * Use this when you need replay output itself. For application-facing reads,
   * prefer `Worldline` / `Observer` and then query or traverse through that
   * read handle.
   */
  materialize(options: { receipts: true; ceiling?: number | null }): Promise<{ state: WarpStateV5; receipts: TickReceipt[] }>;
  materialize(options?: { receipts?: false; ceiling?: number | null }): Promise<WarpStateV5>;

  /**
   * Advanced substrate replay primitive against an explicit pinned frontier.
   *
   * This is the substrate primitive used by strands to replay a pinned
   * observation without assuming the live frontier.
   */
  materializeCoordinate(options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts: true }): Promise<{ state: WarpStateV5; receipts: TickReceipt[] }>;
  materializeCoordinate(options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: false }): Promise<WarpStateV5>;

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
   * Syncs with a remote peer (HTTP URL or another WarpCore instance).
   *
   * When `options.materialize` is true, the returned object also contains a `state` property.
   */
  syncWith(remote: string | WarpCore, options?: {
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
    trust?: SyncTrustOptions;
    /** Auto-materialize after sync; when true, result includes `state` */
    materialize?: boolean;
  }): Promise<{ applied: number; attempts: number; skippedWriters: Array<{ writerId: string; reason: string; localSha: string; remoteSha: string | null }>; state?: WarpStateV5 }>;

  /**
   * Creates a fork of this graph at a specific point in a writer's history.
   *
   * A fork creates a new WarpCore instance that shares history up to the
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
  }): Promise<WarpCore>;

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
   * Analyzes read-only conflict provenance against the current frontier with
   * an optional Lamport ceiling.
   */
  analyzeConflicts(options?: {
    at?: { lamportCeiling?: number | null };
    strandId?: string;
    entityId?: string;
    target?: ConflictTargetSelector;
    kind?: ConflictKind | ConflictKind[];
    writerId?: string;
    evidence?: ConflictEvidenceLevel;
    scanBudget?: { maxPatches?: number };
  }): Promise<ConflictAnalysis>;

  /**
   * Creates a durable strand descriptor pinned to the current frontier
   * plus an optional Lamport ceiling.
   *
   * Strands do not duplicate the graph. They record a pinned base
   * observation plus overlay identity for future divergent writes.
   */
  createStrand(options?: StrandCreateOptions): Promise<StrandDescriptor>;

  /** Loads a previously-created strand descriptor. */
  getStrand(strandId: string): Promise<StrandDescriptor | null>;

  /** Lists all strand descriptors stored for this graph. */
  listStrands(): Promise<StrandDescriptor[]>;

  /**
   * Pins one or more supporting strand overlays as read-only braid inputs
   * on top of a target strand's base observation.
   */
  braidStrand(strandId: string, options?: StrandBraidOptions): Promise<StrandDescriptor>;

  /** Drops a strand descriptor by id. Returns false when it does not exist. */
  dropStrand(strandId: string): Promise<boolean>;

  /**
   * Advanced substrate replay primitive for a strand's pinned base observation plus overlay.
   */
  materializeStrand(strandId: string, options: { receipts: true; ceiling?: number | null }): Promise<{ state: WarpStateV5; receipts: TickReceipt[] }>;
  materializeStrand(strandId: string, options?: { receipts?: false; ceiling?: number | null }): Promise<WarpStateV5>;

  /** Returns the causal patch entries visible inside a strand. */
  getStrandPatches(strandId: string, options?: { ceiling?: number | null }): Promise<Array<{ patch: Patch; sha: string }>>;

  /** Returns the visible patch SHAs that touched one entity inside a strand. */
  patchesForStrand(strandId: string, entityId: string, options?: { ceiling?: number | null }): Promise<string[]>;

  /** Creates a patch builder that writes into a strand's overlay patch-log. */
  createStrandPatch(strandId: string): Promise<PatchBuilderV2>;

  /** Convenience wrapper that creates and commits a strand overlay patch. */
  patchStrand(strandId: string, build: (p: PatchBuilderV2) => void | Promise<void>): Promise<string>;

  /** Queues a patch-shaped intent against a strand without advancing its overlay. */
  queueStrandIntent(strandId: string, build: (p: PatchBuilderV2) => void | Promise<void>): Promise<StrandIntentDescriptor>;

  /** Lists the currently queued intents for one strand. */
  listStrandIntents(strandId: string): Promise<StrandIntentDescriptor[]>;

  /** Deterministically drains the queued intent set for one strand. */
  tickStrand(strandId: string): Promise<StrandTickRecord>;

  /**
   * Compares a strand against its base observation, the live frontier, or
   * another strand using only substrate facts.
   */
  compareStrand(strandId: string, options?: {
    against?: 'base' | 'live' | { kind: 'strand'; strandId: string };
    ceiling?: number | null;
    againstCeiling?: number | null;
    targetId?: string | null;
    scope?: VisibleStateScopeV1 | null;
  }): Promise<CoordinateComparisonV1>;

  /**
   * Plans a deterministic transfer from a strand into live truth, its
   * pinned base observation, or another strand without mutating either
   * side.
   */
  planStrandTransfer(strandId: string, options?: {
    into?: 'base' | 'live' | { kind: 'strand'; strandId: string };
    ceiling?: number | null;
    intoCeiling?: number | null;
    scope?: VisibleStateScopeV1 | null;
  }): Promise<CoordinateTransferPlanV1>;

  /**
   * Compares two explicit substrate coordinate selectors.
   */
  compareCoordinates(options: {
    left: CoordinateComparisonSelectorV1;
    right: CoordinateComparisonSelectorV1;
    targetId?: string | null;
    scope?: VisibleStateScopeV1 | null;
  }): Promise<CoordinateComparisonV1>;

  /**
   * Plans a deterministic transfer between two explicit substrate coordinate
   * selectors without mutating either side.
   */
  planCoordinateTransfer(options: {
    source: CoordinateTransferPlanSelectorV1;
    target: CoordinateTransferPlanSelectorV1;
    scope?: VisibleStateScopeV1 | null;
  }): Promise<CoordinateTransferPlanV1>;

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
  status(): Promise<WarpStatus>;

  /**
   * Subscribes to graph changes after each materialize().
   * @since 13.0.0
   * @stability stable
   */
  subscribe(options: {
    onChange: (diff: StateDiffResult) => void;
    onError?: (error: unknown) => void;
    replay?: boolean;
  }): { unsubscribe: () => void };

  /**
   * Filtered watcher that only fires for changes matching a glob pattern.
   * @since 13.0.0
   * @stability stable
   */
  watch(
    pattern: string | string[],
    options: {
      onChange: (diff: StateDiffResult) => void;
      onError?: (error: unknown) => void;
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
 * Full plumbing-facing WARP surface.
 *
 * Use `WarpCore` for replay, provenance, inspection, debugger tooling, and
 * other advanced substrate mechanics.
 */
export declare class WarpCore extends WarpCoreBase {
  /**
   * Opens or creates a multi-writer graph and returns the full core surface.
   */
  static open(options: Parameters<typeof WarpCoreBase.open>[0]): Promise<WarpCore>;
}

/**
 * Curated product-facing WARP surface.
 *
 * Use `WarpApp` when building applications, agentic CLI flows, and other
 * higher-level integrations that should prefer worldlines, lenses, observers,
 * speculative lanes, and explicit sync over direct replay mechanics.
 */
export declare class WarpApp {
  /**
   * Opens or creates a multi-writer graph and returns the curated app surface.
   */
  static open(options: Parameters<typeof WarpCoreBase.open>[0]): Promise<WarpApp>;

  /** The graph namespace. */
  readonly graphName: WarpCore['graphName'];

  /** This writer's ID. */
  readonly writerId: WarpCore['writerId'];

  /** Explicit escape hatch to the full plumbing surface. */
  core(): WarpCore;

  /** Gets or creates a Writer, optionally resolving from git config. */
  writer(writerId?: Parameters<WarpCore['writer']>[0]): ReturnType<WarpCore['writer']>;

  /** Creates a new PatchBuilderV2 for adding operations. */
  createPatch(): ReturnType<WarpCore['createPatch']>;

  /**
   * Convenience wrapper that creates, builds, and commits one patch.
   * The callback does not commit per write; all queued mutations become one
   * atomic WARP patch after the callback finishes.
   */
  patch(build: Parameters<WarpCore['patch']>[0]): ReturnType<WarpCore['patch']>;

  /** Applies multiple patches sequentially. */
  patchMany(...builds: Parameters<WarpCore['patchMany']>): ReturnType<WarpCore['patchMany']>;

  /**
   * Syncs with a remote peer (HTTP URL, `WarpApp`, or `WarpCore`).
   */
  syncWith(
    remote: string | WarpApp | WarpCore,
    options?: Parameters<WarpCore['syncWith']>[1],
  ): ReturnType<WarpCore['syncWith']>;

  /** Creates a first-class worldline handle over a pinned read source. */
  worldline(options?: Parameters<WarpCore['worldline']>[0]): ReturnType<WarpCore['worldline']>;

  /** Creates a read-only observer over the current pinned read source. */
  observer(config: Aperture, options?: ObserverOptions): ReturnType<WarpCore['observer']>;
  observer(name: string, config: Aperture, options?: ObserverOptions): ReturnType<WarpCore['observer']>;

  /** Computes the directed MDL translation cost from one aperture to another. */
  translationCost(
    configA: Parameters<WarpCore['translationCost']>[0],
    configB: Parameters<WarpCore['translationCost']>[1],
  ): ReturnType<WarpCore['translationCost']>;

  /** Subscribes to graph changes after each materialize(). */
  subscribe(options: Parameters<WarpCore['subscribe']>[0]): ReturnType<WarpCore['subscribe']>;

  /** Filtered watcher for changes matching a glob pattern. */
  watch(
    pattern: Parameters<WarpCore['watch']>[0],
    options: Parameters<WarpCore['watch']>[1],
  ): ReturnType<WarpCore['watch']>;

  // ── Content attachment reads ──────────────────────────────────────

  /** Gets the content blob for a node, or null if none is attached. */
  getContent(nodeId: string): Promise<Uint8Array | null>;
  /** Gets the content blob for a node as a stream, or null if none is attached. */
  getContentStream(nodeId: string): Promise<AsyncIterable<Uint8Array> | null>;
  /** Gets the content blob OID for a node, or null if none is attached. */
  getContentOid(nodeId: string): Promise<string | null>;
  /** Gets structured content metadata for a node attachment, or null if none is attached. */
  getContentMeta(nodeId: string): Promise<ContentMeta | null>;
  /** Gets the content blob for an edge, or null if none is attached. */
  getEdgeContent(from: string, to: string, label: string): Promise<Uint8Array | null>;
  /** Gets the content blob for an edge as a stream, or null if none is attached. */
  getEdgeContentStream(from: string, to: string, label: string): Promise<AsyncIterable<Uint8Array> | null>;
  /** Gets the content blob OID for an edge, or null if none is attached. */
  getEdgeContentOid(from: string, to: string, label: string): Promise<string | null>;
  /** Gets structured content metadata for an edge attachment, or null if none is attached. */
  getEdgeContentMeta(from: string, to: string, label: string): Promise<ContentMeta | null>;

  /** Creates a durable strand descriptor. */
  createStrand(options?: Parameters<WarpCore['createStrand']>[0]): ReturnType<WarpCore['createStrand']>;

  /** Loads a previously-created strand descriptor. */
  getStrand(strandId: Parameters<WarpCore['getStrand']>[0]): ReturnType<WarpCore['getStrand']>;

  /** Lists all strand descriptors stored for this graph. */
  listStrands(): ReturnType<WarpCore['listStrands']>;

  /** Pins one or more supporting overlays as braid inputs on a target strand. */
  braidStrand(
    strandId: Parameters<WarpCore['braidStrand']>[0],
    options?: Parameters<WarpCore['braidStrand']>[1],
  ): ReturnType<WarpCore['braidStrand']>;

  /** Drops a strand descriptor by id. */
  dropStrand(strandId: Parameters<WarpCore['dropStrand']>[0]): ReturnType<WarpCore['dropStrand']>;

  /** Creates a patch builder that writes into a strand overlay patch-log. */
  createStrandPatch(
    strandId: Parameters<WarpCore['createStrandPatch']>[0],
  ): ReturnType<WarpCore['createStrandPatch']>;

  /** Convenience wrapper that creates and commits a strand overlay patch. */
  patchStrand(
    strandId: Parameters<WarpCore['patchStrand']>[0],
    build: Parameters<WarpCore['patchStrand']>[1],
  ): ReturnType<WarpCore['patchStrand']>;

  /** Queues a patch-shaped intent against a strand. */
  queueStrandIntent(
    strandId: Parameters<WarpCore['queueStrandIntent']>[0],
    build: Parameters<WarpCore['queueStrandIntent']>[1],
  ): ReturnType<WarpCore['queueStrandIntent']>;

  /** Lists the currently queued intents for one strand. */
  listStrandIntents(
    strandId: Parameters<WarpCore['listStrandIntents']>[0],
  ): ReturnType<WarpCore['listStrandIntents']>;

  /** Deterministically drains the queued intent set for one strand. */
  tickStrand(strandId: Parameters<WarpCore['tickStrand']>[0]): ReturnType<WarpCore['tickStrand']>;
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
  serialize(): Uint8Array;

  /**
   * Deserializes an index from CBOR format.
   *
   * @throws Error if the buffer contains an unsupported version
   */
  static deserialize(buffer: Uint8Array): ProvenanceIndex;

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
// Conflict Analyzer
// ============================================================================

/** Kind of conflict detected between concurrent patches. */
export type ConflictKind = 'supersession' | 'eventual_override' | 'redundancy';
/** Level of evidence detail in conflict analysis results. */
export type ConflictEvidenceLevel = 'summary' | 'standard' | 'full';
/** Causal relationship between conflicting patches. */
export type ConflictCausalRelation = 'concurrent' | 'ordered' | 'replay_equivalent' | 'reducer_collapsed';

/** Selector identifying the entity targeted by conflict analysis. */
export interface ConflictTargetSelector {
  targetKind: 'node' | 'edge' | 'node_property' | 'edge_property';
  entityId?: string;
  propertyKey?: string;
  from?: string;
  to?: string;
  label?: string;
}

/** Anchor point (commit SHA + Lamport ceiling) for conflict analysis. */
export interface ConflictAnchor {
  patchSha: string;
  writerId: string;
  lamport: number;
  opIndex: number;
  receiptPatchSha?: string;
  receiptLamport?: number;
  receiptOpIndex?: number;
}

/** Resolved target entity with node/edge identity for conflict analysis. */
export interface ConflictTarget {
  targetKind: 'node' | 'edge' | 'node_property' | 'edge_property';
  targetDigest: string;
  entityId?: string;
  propertyKey?: string;
  from?: string;
  to?: string;
  label?: string;
  edgeKey?: string;
}

/** A writer that participated in a conflict with its contributing patch. */
export interface ConflictParticipant {
  anchor: ConflictAnchor;
  effectDigest: string;
  causalRelationToWinner?: ConflictCausalRelation;
  structurallyDistinctAlternative: boolean;
  replayableFromAnchors: boolean;
  notes?: string[];
}

/** How a conflict was resolved by the CRDT reducer. */
export interface ConflictResolution {
  reducerId: string;
  basis: { code: string; reason?: string };
  winnerMode: 'immediate' | 'eventual';
  comparator?: {
    type: 'event_id' | 'effect_digest';
    winnerEventId?: { lamport: number; writerId: string; patchSha: string; opIndex: number };
    loserEventId?: { lamport: number; writerId: string; patchSha: string; opIndex: number };
  };
}

/** Single conflict trace: two participants, their causal relation, and resolution. */
export interface ConflictTrace {
  conflictId: string;
  kind: ConflictKind;
  target: ConflictTarget;
  winner: {
    anchor: ConflictAnchor;
    effectDigest: string;
  };
  losers: ConflictParticipant[];
  resolution: ConflictResolution;
  whyFingerprint: string;
  classificationNotes?: string[];
  evidence: {
    level: ConflictEvidenceLevel;
    patchRefs: string[];
    receiptRefs: Array<{ patchSha: string; lamport: number; opIndex: number }>;
  };
}

/** Diagnostic summary for a single entity's conflict history. */
export interface ConflictDiagnostic {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

/** Full conflict analysis result for a materialized coordinate. */
export interface ConflictAnalysis {
  analysisVersion: string;
  resolvedCoordinate: {
    analysisVersion: string;
    coordinateKind: 'frontier' | 'strand';
    frontier: Record<string, string>;
    frontierDigest: string;
    lamportCeiling: number | null;
    scanBudgetApplied: { maxPatches: number | null };
    truncationPolicy: string;
    strand?: {
      strandId: string;
      baseLamportCeiling: number | null;
      overlayHeadPatchSha: string | null;
      overlayPatchCount: number;
      overlayWritable: boolean;
      braid: {
        readOverlayCount: number;
        braidedStrandIds: string[];
      };
    };
  };
  analysisSnapshotHash: string;
  diagnostics?: ConflictDiagnostic[];
  conflicts: ConflictTrace[];
}

/** Options for creating a new strand descriptor. */
export interface StrandCreateOptions {
  strandId?: string;
  lamportCeiling?: number | null;
  owner?: string | null;
  scope?: string | null;
  leaseExpiresAt?: string | null;
}

/** Options for braiding read-only overlays onto a strand. */
export interface StrandBraidOptions {
  braidedStrandIds?: string[];
  writable?: boolean | null;
}

/** Descriptor for a braided read-only overlay on a strand. */
export interface StrandReadOverlayDescriptor {
  strandId: string;
  overlayId: string;
  kind: string;
  headPatchSha: string | null;
  patchCount: number;
}

/** Descriptor for a queued intent on a strand. */
export interface StrandIntentDescriptor {
  intentId: string;
  enqueuedAt: string;
  patch: Patch;
  reads: string[];
  writes: string[];
  contentBlobOids: string[];
}

/** Counterfactual produced by ticking a strand (rejected patches). */
export interface StrandTickCounterfactual {
  intentId: string;
  reason: string;
  conflictsWith: string[];
  reads: string[];
  writes: string[];
}

/** Record of a strand tick: accepted patches and counterfactuals. */
export interface StrandTickRecord {
  tickId: string;
  strandId: string;
  tickIndex: number;
  createdAt: string;
  drainedIntentCount: number;
  admittedIntentIds: string[];
  rejected: StrandTickCounterfactual[];
  baseOverlayHeadPatchSha: string | null;
  overlayHeadPatchSha: string | null;
  overlayPatchShas: string[];
}

/** Durable descriptor for a speculative strand with base observation and overlay. */
export interface StrandDescriptor {
  schemaVersion: number;
  strandId: string;
  graphName: string;
  createdAt: string;
  updatedAt: string;
  owner: string | null;
  scope: string | null;
  lease: {
    expiresAt: string | null;
  };
  baseObservation: {
    coordinateVersion: string;
    frontier: Record<string, string>;
    frontierDigest: string;
    lamportCeiling: number | null;
  };
  overlay: {
    overlayId: string;
    kind: string;
    headPatchSha: string | null;
    patchCount: number;
    writable: boolean;
  };
  braid: {
    readOverlays: StrandReadOverlayDescriptor[];
  };
  intentQueue?: {
    nextIntentSeq: number;
    intents: StrandIntentDescriptor[];
  };
  evolution?: {
    tickCount: number;
    lastTick: StrandTickRecord | null;
  };
  materialization: {
    cacheAuthority: 'derived';
  };
}

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
  patch: Patch;
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

/** Compact projection of materialized state: node IDs, edge tuples, and properties. */
export interface VisibleStateProjectionV5 {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
  props: Array<{ node: string; key: string; value: unknown }>;
}

/** Neighbor entry from visible state: target node, edge label, and direction. */
export interface VisibleStateNeighborV5 {
  nodeId: string;
  label: string;
  direction: 'outgoing' | 'incoming';
}

/** Edge-local view from visible state: endpoints, label, and properties. */
export interface VisibleEdgeViewV5 {
  from: string;
  to: string;
  label: string;
  props: Record<string, unknown>;
}

/** Node-local view from visible state: properties, neighbors, and content metadata. */
export interface VisibleNodeViewV5 {
  nodeId: string;
  props: Record<string, unknown>;
  outgoing: VisibleStateNeighborV5[];
  incoming: VisibleStateNeighborV5[];
  content: ContentMeta | null;
}

/** Read-only accessor over materialized V5 state with entity-local inspection. */
export interface VisibleStateReaderV5 {
  project(): VisibleStateProjectionV5;
  hasNode(nodeId: string): boolean;
  getNodes(): string[];
  getEdges(): VisibleEdgeViewV5[];
  getNodeProps(nodeId: string): Record<string, unknown> | null;
  getEdgeProps(from: string, to: string, label: string): Record<string, unknown> | null;
  neighbors(
    nodeId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
    edgeLabel?: string,
  ): VisibleStateNeighborV5[];
  getNodeContentMeta(nodeId: string): ContentMeta | null;
  getEdgeContentMeta(from: string, to: string, label: string): ContentMeta | null;
  inspectNode(nodeId: string): VisibleNodeViewV5 | null;
}

/** Compact summary of visible state: entity and property counts. */
export interface VisibleStateSummaryV5 {
  nodeCount: number;
  edgeCount: number;
  nodePropertyCount: number;
  edgePropertyCount: number;
}

/** Single node property value in a visible state comparison. */
export interface VisibleStateNodePropertyValueV5 {
  node: string;
  key: string;
  value: unknown;
}

/** Node property change between two visible states. */
export interface VisibleStateNodePropertyChangeV5 {
  node: string;
  key: string;
  leftValue: unknown;
  rightValue: unknown;
}

/** Single edge property value in a visible state comparison. */
export interface VisibleStateEdgePropertyValueV5 {
  from: string;
  to: string;
  label: string;
  key: string;
  value: unknown;
}

/** Edge property change between two visible states. */
export interface VisibleStateEdgePropertyChangeV5 {
  from: string;
  to: string;
  label: string;
  key: string;
  leftValue: unknown;
  rightValue: unknown;
}

/** Per-node detail in a visible state comparison: property and neighbor deltas. */
export interface VisibleStateComparisonTargetV5 {
  targetId: string | null;
  leftExists: boolean;
  rightExists: boolean;
  changed: boolean;
  left: VisibleNodeViewV5 | null;
  right: VisibleNodeViewV5 | null;
  propertyDelta: {
    added: Array<{ key: string; value: unknown }>;
    removed: Array<{ key: string; value: unknown }>;
    changed: Array<{ key: string; leftValue: unknown; rightValue: unknown }>;
  };
  outgoingDelta: {
    added: VisibleStateNeighborV5[];
    removed: VisibleStateNeighborV5[];
  };
  incomingDelta: {
    added: VisibleStateNeighborV5[];
    removed: VisibleStateNeighborV5[];
  };
  contentChanged: boolean;
}

/** Full visible state comparison between two materialized states. */
export interface VisibleStateComparisonV5 {
  comparisonVersion: string;
  changed: boolean;
  summary: {
    left: VisibleStateSummaryV5;
    right: VisibleStateSummaryV5;
    nodes: { added: number; removed: number };
    edges: { added: number; removed: number };
    nodeProperties: { added: number; removed: number; changed: number };
    edgeProperties: { added: number; removed: number; changed: number };
  };
  nodes: {
    added: string[];
    removed: string[];
  };
  edges: {
    added: Array<{ from: string; to: string; label: string }>;
    removed: Array<{ from: string; to: string; label: string }>;
  };
  nodeProperties: {
    added: VisibleStateNodePropertyValueV5[];
    removed: VisibleStateNodePropertyValueV5[];
    changed: VisibleStateNodePropertyChangeV5[];
  };
  edgeProperties: {
    added: VisibleStateEdgePropertyValueV5[];
    removed: VisibleStateEdgePropertyValueV5[];
    changed: VisibleStateEdgePropertyChangeV5[];
  };
  target?: VisibleStateComparisonTargetV5;
}

/** Prefix-based filter for scoping visible state to node ID families. */
export interface VisibleStateScopePrefixFilterV1 {
  include?: string[];
  exclude?: string[];
}

/** Scope configuration for filtering visible state comparison or transfer. */
export interface VisibleStateScopeV1 {
  nodeIdPrefixes?: VisibleStateScopePrefixFilterV1;
}

/** Selector identifying source or target coordinate for comparison. */
export type CoordinateComparisonSelectorV1 =
  | { kind: 'live'; ceiling?: number | null }
  | { kind: 'strand'; strandId: string; ceiling?: number | null }
  | { kind: 'strand_base'; strandId: string; ceiling?: number | null }
  | { kind: 'coordinate'; frontier: Map<string, string> | Record<string, string>; ceiling?: number | null };

/** Selector for coordinate transfer planning (same shape as comparison selector). */
export type CoordinateTransferPlanSelectorV1 = CoordinateComparisonSelectorV1;

/** Resolved side of a coordinate comparison with frontier, patches, and state. */
export interface CoordinateComparisonResolvedSideV1 {
  coordinateKind: 'frontier' | 'strand' | 'strand_base';
  patchFrontier: Record<string, string>;
  patchFrontierDigest: string;
  lamportFrontier: Record<string, number>;
  lamportFrontierDigest: string;
  lamportCeiling: number | null;
  stateHash: string;
  patchUniverseDigest: string;
  summary: VisibleStateSummaryV5 & { patchCount: number };
  strand?: {
    strandId: string;
    baseLamportCeiling: number | null;
    overlayHeadPatchSha: string | null;
    overlayPatchCount: number;
    overlayWritable: boolean;
    braid: {
      readOverlayCount: number;
      braidedStrandIds: string[];
    };
  };
}

/** Patch-level divergence between two coordinates: shared vs side-only counts. */
export interface CoordinateComparisonPatchDivergenceV1 {
  sharedCount: number;
  leftOnlyCount: number;
  rightOnlyCount: number;
  leftOnlyPatchShas: string[];
  rightOnlyPatchShas: string[];
  target?: {
    targetId: string;
    leftCount: number;
    rightCount: number;
    sharedCount: number;
    leftOnlyCount: number;
    rightOnlyCount: number;
    leftOnlyPatchShas: string[];
    rightOnlyPatchShas: string[];
  };
}

/** Unresolved-to-resolved side pair for a coordinate comparison. */
export interface CoordinateComparisonSideV1 {
  requested: Record<string, unknown>;
  resolved: CoordinateComparisonResolvedSideV1;
}

/** Full coordinate comparison result with side digests and visible state diff. */
export interface CoordinateComparisonV1 {
  comparisonVersion: string;
  comparisonDigest: string;
  scope?: VisibleStateScopeV1;
  left: CoordinateComparisonSideV1;
  right: CoordinateComparisonSideV1;
  visiblePatchDivergence: CoordinateComparisonPatchDivergenceV1;
  visibleState: VisibleStateComparisonV5;
}

/** Canonical fact payload for a coordinate comparison. */
export interface CoordinateComparisonFactV1 {
  comparisonVersion: string;
  scope?: VisibleStateScopeV1;
  left: CoordinateComparisonSideV1;
  right: CoordinateComparisonSideV1;
  visiblePatchDivergence: CoordinateComparisonPatchDivergenceV1;
  visibleState: VisibleStateComparisonV5;
}

/** Exported coordinate comparison fact with canonical JSON and digest. */
export interface CoordinateComparisonFactExportV1 {
  exportVersion: string;
  factKind: 'coordinate-comparison';
  factDigest: string;
  canonicalFactJson: string;
  fact: CoordinateComparisonFactV1;
}

/** Summary of candidate transfer operations between two visible states. */
export interface VisibleStateTransferPlanSummaryV1 {
  opCount: number;
  addNodeCount: number;
  removeNodeCount: number;
  setNodePropertyCount: number;
  clearNodePropertyCount: number;
  addEdgeCount: number;
  removeEdgeCount: number;
  setEdgePropertyCount: number;
  clearEdgePropertyCount: number;
  attachNodeContentCount: number;
  clearNodeContentCount: number;
  attachEdgeContentCount: number;
  clearEdgeContentCount: number;
}

/** Single candidate transfer operation (add/remove/set/attach/clear). */
export type VisibleStateTransferOperationV1 =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown }
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown }
  | { op: 'attach_node_content'; nodeId: string; content: Uint8Array; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_node_content'; nodeId: string }
  | { op: 'attach_edge_content'; from: string; to: string; label: string; content: Uint8Array; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_edge_content'; from: string; to: string; label: string };

/** Canonical fact form of a transfer operation (without inline content bytes). */
export type VisibleStateTransferOperationFactV1 =
  | { op: 'add_node'; nodeId: string }
  | { op: 'remove_node'; nodeId: string }
  | { op: 'set_node_property'; nodeId: string; key: string; value: unknown }
  | { op: 'add_edge'; from: string; to: string; label: string }
  | { op: 'remove_edge'; from: string; to: string; label: string }
  | { op: 'set_edge_property'; from: string; to: string; label: string; key: string; value: unknown }
  | { op: 'attach_node_content'; nodeId: string; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_node_content'; nodeId: string }
  | { op: 'attach_edge_content'; from: string; to: string; label: string; contentOid: string; mime?: string | null; size?: number | null }
  | { op: 'clear_edge_content'; from: string; to: string; label: string };

/** Side label for a transfer plan (same shape as comparison side). */
export type CoordinateTransferPlanSideV1 = CoordinateComparisonSideV1;

/** Full coordinate transfer plan with candidate operations and digests. */
export interface CoordinateTransferPlanV1 {
  transferVersion: string;
  transferDigest: string;
  comparisonDigest: string;
  scope?: VisibleStateScopeV1;
  changed: boolean;
  source: CoordinateTransferPlanSideV1;
  target: CoordinateTransferPlanSideV1;
  summary: VisibleStateTransferPlanSummaryV1;
  ops: VisibleStateTransferOperationV1[];
}

/** Canonical fact payload for a coordinate transfer plan. */
export interface CoordinateTransferPlanFactV1 {
  transferVersion: string;
  comparisonDigest: string;
  scope?: VisibleStateScopeV1;
  changed: boolean;
  source: CoordinateTransferPlanSideV1;
  target: CoordinateTransferPlanSideV1;
  summary: VisibleStateTransferPlanSummaryV1;
  ops: VisibleStateTransferOperationFactV1[];
}

/** Exported coordinate transfer plan fact with canonical JSON and digest. */
export interface CoordinateTransferPlanFactExportV1 {
  exportVersion: string;
  factKind: 'coordinate-transfer-plan';
  factDigest: string;
  canonicalFactJson: string;
  fact: CoordinateTransferPlanFactV1;
}

/**
 * ProvenancePayload - Transferable provenance as a monoid.
 *
 * Implements transferable provenance as an ordered sequence of tick patches:
 * P = (mu_0, ..., mu_{n-1}).
 *
 * The payload monoid (Payload, ., epsilon):
 * - Composition is concatenation
 * - Identity is empty sequence
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

// ============================================================================
// Effect Emission & Delivery Observation
// ============================================================================

/** Execution/delivery context that shapes outbound effect behavior. */
export interface ExternalizationPolicy {
  /** Execution mode. */
  readonly mode: 'live' | 'replay' | 'inspect';
  /** Whether external delivery should be blocked. */
  readonly suppressExternal: boolean;
}

/** Valid delivery modes. */
export const DELIVERY_MODES: readonly ['live', 'replay', 'inspect'];

/** Valid delivery outcomes. */
export const DELIVERY_OUTCOMES: readonly [
  'delivered',
  'suppressed',
  'failed',
  'skipped',
];

/** Delivery outcome discriminant. */
export type DeliveryOutcome = 'delivered' | 'suppressed' | 'failed' | 'skipped';

/** Delivery mode discriminant. */
export type DeliveryMode = 'live' | 'replay' | 'inspect';

/** Creates an immutable ExternalizationPolicy. */
export function createExternalizationPolicy(params: {
  mode: DeliveryMode;
  suppressExternal: boolean;
}): Readonly<ExternalizationPolicy>;

/** Live execution lens — effects are delivered normally. */
export const LIVE_LENS: Readonly<ExternalizationPolicy>;
/** Replay execution lens — external delivery is suppressed. */
export const REPLAY_LENS: Readonly<ExternalizationPolicy>;
/** Inspect execution lens — dry-run, external delivery is suppressed. */
export const INSPECT_LENS: Readonly<ExternalizationPolicy>;

/** Causal coordinate at which an effect was emitted. */
export interface EffectCoordinate {
  /** Writer tip SHAs at emission time. */
  readonly frontier: Record<string, string> | null;
  /** Lamport ceiling (if capped). */
  readonly ceiling: number | null;
}

/** Immutable substrate fact: an outbound effect candidate was produced. */
export interface EffectEmission {
  /** Unique emission ID. */
  readonly id: string;
  /** Effect kind — generic string, app chooses meaning. */
  readonly kind: string;
  /** Opaque effect payload — substrate does not interpret it. */
  readonly payload: unknown;
  /** Wall-clock milliseconds. */
  readonly timestamp: number;
  /** Writer ID (null if not writer-scoped). */
  readonly writer: string | null;
  /** Causal position where this effect was produced. */
  readonly coordinate: Readonly<EffectCoordinate>;
}

/** Creates an immutable EffectEmission. */
export function createEffectEmission(params: {
  id: string;
  kind: string;
  payload: unknown;
  timestamp: number;
  writer: string | null;
  coordinate: {
    frontier: Record<string, string> | null;
    ceiling: number | null;
  };
}): Readonly<EffectEmission>;

/** Produces a deterministic JSON string for an EffectEmission. */
export function canonicalEmissionJson(emission: EffectEmission): string;

/** Immutable substrate fact: a sink handled an emitted effect. */
export interface DeliveryObservation {
  /** Links to the EffectEmission. */
  readonly emissionId: string;
  /** Which sink/adapter handled it. */
  readonly sinkId: string;
  /** Delivery outcome. */
  readonly outcome: DeliveryOutcome;
  /** Why (e.g., "replay mode", "transport unavailable"). */
  readonly reason?: string;
  /** Wall-clock milliseconds. */
  readonly timestamp: number;
  /** Execution context at delivery time. */
  readonly lens: Readonly<ExternalizationPolicy>;
}

/** Creates an immutable DeliveryObservation. */
export function createDeliveryObservation(params: {
  emissionId: string;
  sinkId: string;
  outcome: DeliveryOutcome;
  reason?: string;
  timestamp: number;
  lens: { mode: DeliveryMode; suppressExternal: boolean };
}): Readonly<DeliveryObservation>;

/** Produces a deterministic JSON string for a DeliveryObservation. */
export function canonicalObservationJson(
  observation: DeliveryObservation,
): string;

/**
 * Abstract port for effect delivery sinks.
 *
 * Each sink has a unique `id` and a `deliver()` method.
 */
export class EffectSinkPort {
  /** Unique identifier for this sink. */
  get id(): string;
  /** Delivers an effect emission under the given externalization policy. */
  deliver(
    emission: EffectEmission,
    lens: ExternalizationPolicy,
  ): Promise<DeliveryObservation | DeliveryObservation[]>;
}

/**
 * Fans out one EffectEmission to multiple child sinks.
 * Implements EffectSinkPort (composite pattern).
 */
export class MultiplexSink extends EffectSinkPort {
  constructor(options?: { id?: string });
  get id(): string;
  get sinks(): readonly EffectSinkPort[];
  addSink(sink: EffectSinkPort): void;
  removeSink(id: string): boolean;
  deliver(
    emission: EffectEmission,
    lens: ExternalizationPolicy,
  ): Promise<DeliveryObservation[]>;
}

/**
 * Orchestrates effect emission, delivery, and observation collection.
 */
export class EffectPipeline {
  constructor(options: {
    sink: EffectSinkPort;
    lens: Readonly<ExternalizationPolicy>;
    clock: { now: () => number };
  });
  get lens(): Readonly<ExternalizationPolicy>;
  set lens(newLens: Readonly<ExternalizationPolicy>);
  get emissions(): readonly EffectEmission[];
  get observations(): readonly DeliveryObservation[];
  emit(
    kind: string,
    payload: unknown,
    options?: {
      writer?: string | null;
      coordinate?: {
        frontier?: Record<string, string> | null;
        ceiling?: number | null;
      };
    },
  ): Promise<{
    emission: EffectEmission;
    observations: DeliveryObservation | DeliveryObservation[];
  }>;
}

/** Null/test sink — swallows effects. */
export class NoOpEffectSink extends EffectSinkPort {
  constructor(options?: { id?: string });
  get id(): string;
}

/** Console logging sink — logs via a logger, suppresses in replay/inspect. */
export class ConsoleEffectSink extends EffectSinkPort {
  constructor(options?: {
    logger?: { info: (...args: unknown[]) => void };
    id?: string;
  });
  get id(): string;
}

/** Rotating append-only NDJSON file sink for local forensic streams. */
export class ChunkEffectSink extends EffectSinkPort {
  constructor(options: { dir: string; id?: string; maxBytes?: number });
  get id(): string;
}

/** Default package export — the curated product-facing WARP surface. */
export default WarpApp;
