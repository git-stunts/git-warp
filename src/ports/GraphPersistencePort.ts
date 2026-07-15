import type WarpStream from '../domain/stream/WarpStream.ts';
import type {
  CommitLogChunk,
  CommitNodeOptions,
  LogNodesOptions,
  NodeInfo,
  PingResult,
} from './CommitPort.ts';
import type { ListRefsOptions } from './RefPort.ts';

/**
 * Abstract port for graph persistence operations.
 *
 * Defines the contract for reading and writing graph data to a Git-backed
 * storage layer. Concrete adapters (e.g., GitTimelineHistoryAdapter) implement this
 * interface to provide actual Git operations.
 *
 * This is the causal timeline history boundary:
 *
 * - CommitPort -- commit creation, reading, logging, counting, ping
 * - RefPort -- ref update/read/delete
 *
 * Immutable assets and materialized indexes use their dedicated semantic
 * storage ports. Raw object plumbing is infrastructure-only.
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
  abstract logNodesStream(_options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>>;

  /** Counts nodes reachable from a ref without loading them into memory. */
  abstract countNodes(_ref: string): Promise<number>;

  /** Checks whether a commit exists in the repository. */
  abstract nodeExists(_sha: string): Promise<boolean>;

  /** Pings the repository to verify accessibility. */
  abstract ping(): Promise<PingResult>;

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
