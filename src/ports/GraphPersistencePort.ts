import type { Readable } from 'node:stream';
import type {
  CommitNodeOptions,
  CommitNodeWithTreeOptions,
  LogNodesOptions,
  NodeInfo,
  PingResult,
} from './CommitPort.ts';
import type { ListRefsOptions } from './RefPort.ts';

/**
 * Abstract port for graph persistence operations.
 *
 * Defines the contract for reading and writing graph data to a Git-backed
 * storage layer. Concrete adapters (e.g., GitGraphAdapter) implement this
 * interface to provide actual Git operations.
 *
 * This is a **composite port** that implements the union of four focused ports:
 *
 * - CommitPort -- commit creation, reading, logging, counting, ping
 * - BlobPort -- blob read/write
 * - TreePort -- tree read/write, emptyTree getter
 * - RefPort -- ref update/read/delete
 *
 * Domain services should document which focused port(s) they actually depend on,
 * even though they accept the full GraphPersistencePort at runtime.
 * This enables future narrowing without breaking backward compatibility.
 */

/** Composite port for graph persistence operations. */
export default abstract class GraphPersistencePort {
  // -- CommitPort surface --

  /** Creates a commit pointing to the empty tree. */
  abstract commitNode(_options: CommitNodeOptions): Promise<string>;

  /** Retrieves the raw commit message for a given SHA. */
  abstract showNode(_sha: string): Promise<string>;

  /** Gets full commit metadata for a node. */
  abstract getNodeInfo(_sha: string): Promise<NodeInfo>;

  /** Returns raw git log output for a ref. */
  abstract logNodes(_options: LogNodesOptions): Promise<string>;

  /** Streams git log output for a ref. */
  abstract logNodesStream(_options: LogNodesOptions): Promise<Readable>;

  /** Counts nodes reachable from a ref without loading them into memory. */
  abstract countNodes(_ref: string): Promise<number>;

  /**
   * Creates a commit pointing to a specified tree (not the empty tree).
   * Used by CheckpointService and PatchBuilder for tree-backed commits.
   */
  abstract commitNodeWithTree(_options: CommitNodeWithTreeOptions): Promise<string>;

  /** Checks whether a commit exists in the repository. */
  abstract nodeExists(_sha: string): Promise<boolean>;

  /** Retrieves the tree OID for a given commit SHA. */
  abstract getCommitTree(_sha: string): Promise<string>;

  /** Pings the repository to verify accessibility. */
  abstract ping(): Promise<PingResult>;

  // -- BlobPort surface --

  /** Writes content as a Git blob and returns its OID. */
  abstract writeBlob(_content: Uint8Array | string): Promise<string>;

  /** Reads the content of a Git blob by OID. */
  abstract readBlob(_oid: string): Promise<Uint8Array>;

  // -- TreePort surface --

  /** Creates a Git tree from mktree-formatted entries. */
  abstract writeTree(_entries: string[]): Promise<string>;

  /** Reads a tree and returns a map of path to content. */
  abstract readTree(_treeOid: string): Promise<Record<string, Uint8Array>>;

  /**
   * Reads a tree and returns a map of path to blob OID.
   * Useful for lazy-loading shards without reading all blob contents.
   */
  abstract readTreeOids(_treeOid: string): Promise<Record<string, string>>;

  /**
   * The well-known SHA for Git's empty tree object.
   * All WARP graph commits point to this tree so that no files appear in the working directory.
   */
  abstract get emptyTree(): string;

  // -- RefPort surface --

  /** Updates a ref to point to an OID. */
  abstract updateRef(_ref: string, _oid: string): Promise<void>;

  /** Reads the OID a ref points to, or null if the ref does not exist. */
  abstract readRef(_ref: string): Promise<string | null>;

  /** Deletes a ref. */
  abstract deleteRef(_ref: string): Promise<void>;

  /**
   * Lists refs matching a prefix.
   * When `limit` is omitted or 0, all matching refs are returned.
   */
  abstract listRefs(_prefix: string, _options?: ListRefsOptions): Promise<string[]>;

  /**
   * Atomically updates a ref using compare-and-swap semantics.
   *
   * The ref is updated to `_newOid` only if it currently points to `_expectedOid`.
   * If `_expectedOid` is `null`, the ref must not exist (genesis CAS).
   */
  abstract compareAndSwapRef(
    _ref: string,
    _newOid: string,
    _expectedOid: string | null,
  ): Promise<void>;
}
