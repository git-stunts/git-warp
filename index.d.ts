/**
 * @git-stunts/empty-graph - A graph database where every node is a Git commit pointing to the Empty Tree.
 */

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
 */
export abstract class GraphPersistencePort {
  /** The empty tree SHA */
  abstract get emptyTree(): string;

  abstract commitNode(options: CreateNodeOptions): Promise<string>;
  abstract showNode(sha: string): Promise<string>;
  abstract logNodesStream(options: ListNodesOptions & { format: string }): Promise<AsyncIterable<Uint8Array | string>>;
  abstract logNodes(options: ListNodesOptions & { format: string }): Promise<string>;
  abstract writeBlob(content: Buffer | string): Promise<string>;
  abstract writeTree(entries: string[]): Promise<string>;
  abstract readTree(treeOid: string): Promise<Record<string, Buffer>>;
  abstract readTreeOids(treeOid: string): Promise<Record<string, string>>;
  abstract readBlob(oid: string): Promise<Buffer>;
  abstract updateRef(ref: string, oid: string): Promise<void>;
  abstract readRef(ref: string): Promise<string | null>;
  abstract deleteRef(ref: string): Promise<void>;
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
 * Implementation of GraphPersistencePort using GitPlumbing.
 */
export class GitGraphAdapter extends GraphPersistencePort {
  constructor(options: { plumbing: GitPlumbing });

  get emptyTree(): string;
  commitNode(options: CreateNodeOptions): Promise<string>;
  showNode(sha: string): Promise<string>;
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
}

/**
 * Domain service for graph database operations.
 */
export class GraphService {
  constructor(options: { persistence: GraphPersistencePort });

  createNode(options: CreateNodeOptions): Promise<string>;
  readNode(sha: string): Promise<string>;
  listNodes(options: ListNodesOptions): Promise<GraphNode[]>;
  iterateNodes(options: IterateNodesOptions): AsyncGenerator<GraphNode, void, unknown>;
}

/**
 * Rebuild state for BitmapIndexService.
 */
export interface BitmapRebuildState {
  shaToId: Map<string, number>;
  idToSha: string[];
  bitmaps: Map<string, unknown>;
}

/**
 * High-performance sharded bitmap index with lazy loading.
 */
export class BitmapIndexService {
  constructor(options?: { persistence?: GraphPersistencePort });

  /** Look up the numeric ID for a SHA */
  lookupId(sha: string): Promise<number | undefined>;

  /** Get parent SHAs for a node (O(1) via reverse bitmap) */
  getParents(sha: string): Promise<string[]>;

  /** Get child SHAs for a node (O(1) via forward bitmap) */
  getChildren(sha: string): Promise<string[]>;

  /** Set up the index with shard OIDs */
  setup(shardOids: Record<string, string>): void;

  /** Create a new rebuild state */
  static createRebuildState(): BitmapRebuildState;

  /** Add an edge to the rebuild state */
  static addEdge(srcSha: string, tgtSha: string, state: BitmapRebuildState): void;

  /** Register a node in the rebuild state without adding edges */
  static registerNode(sha: string, state: BitmapRebuildState): number;

  /** Get or create a numeric ID for a SHA (internal) */
  static _getOrCreateId(sha: string, state: BitmapRebuildState): number;

  /** Serialize the rebuild state to a tree of files */
  static serialize(state: BitmapRebuildState): Record<string, Buffer>;
}

/**
 * Service to rebuild and load the graph index.
 */
export class CacheRebuildService {
  constructor(options: { persistence: GraphPersistencePort; graphService: GraphService });

  /** Rebuild the index from a ref */
  rebuild(ref: string): Promise<string>;

  /** Load an index from a tree OID */
  load(treeOid: string): Promise<BitmapIndexService>;
}

/** Default ref for storing the index OID */
export const DEFAULT_INDEX_REF: string;

/**
 * Facade class for the EmptyGraph library.
 */
export default class EmptyGraph {
  /** The underlying GraphService instance */
  readonly service: GraphService;

  /** The underlying CacheRebuildService instance */
  readonly rebuildService: CacheRebuildService;

  /** Whether an index is currently loaded */
  readonly hasIndex: boolean;

  /** The current index tree OID, or null if no index is loaded */
  readonly indexOid: string | null;

  /**
   * Creates a new EmptyGraph instance.
   * @param options Configuration options
   * @param options.plumbing Instance of @git-stunts/plumbing
   */
  constructor(options: { plumbing: GitPlumbing });

  /**
   * Creates a new graph node as a Git commit.
   * @param options Node creation options
   * @returns SHA of the created commit
   */
  createNode(options: CreateNodeOptions): Promise<string>;

  /**
   * Reads a node's message.
   * @param sha Commit SHA to read
   * @returns The node's message
   */
  readNode(sha: string): Promise<string>;

  /**
   * Lists nodes in history (for small graphs).
   * @param options List options
   * @returns Array of GraphNode instances
   */
  listNodes(options: ListNodesOptions): Promise<GraphNode[]>;

  /**
   * Async generator for streaming large graphs.
   * @param options Iteration options
   * @yields GraphNode instances
   */
  iterateNodes(options: IterateNodesOptions): AsyncGenerator<GraphNode, void, unknown>;

  /**
   * Rebuilds the bitmap index for the graph.
   * @param ref Git ref to rebuild from
   * @returns OID of the created index tree
   */
  rebuildIndex(ref: string): Promise<string>;

  /**
   * Loads a pre-built bitmap index for O(1) queries.
   * @param treeOid OID of the index tree (from rebuildIndex)
   */
  loadIndex(treeOid: string): Promise<void>;

  /**
   * Saves the current index OID to a git ref.
   * @param ref The ref to store the index OID (default: 'refs/empty-graph/index')
   * @throws Error if no index has been built or loaded
   */
  saveIndex(ref?: string): Promise<void>;

  /**
   * Loads the index from a git ref.
   * @param ref The ref containing the index OID (default: 'refs/empty-graph/index')
   * @returns True if index was loaded, false if ref doesn't exist
   */
  loadIndexFromRef(ref?: string): Promise<boolean>;

  /**
   * Gets parent SHAs for a node using the bitmap index.
   * Requires loadIndex() to be called first.
   * @param sha The node's SHA
   * @returns Array of parent SHAs
   * @throws Error if index is not loaded
   */
  getParents(sha: string): Promise<string[]>;

  /**
   * Gets child SHAs for a node using the bitmap index.
   * Requires loadIndex() to be called first.
   * @param sha The node's SHA
   * @returns Array of child SHAs
   * @throws Error if index is not loaded
   */
  getChildren(sha: string): Promise<string[]>;
}
