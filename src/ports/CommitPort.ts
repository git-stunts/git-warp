import type WarpStream from '../domain/stream/WarpStream.ts';

/**
 * Port for Git commit operations.
 *
 * Defines the contract for creating, reading, and querying Git commits.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * The log-stream surface speaks the repo's portable
 * `WarpStream<Uint8Array | string>` abstraction — NOT `node:stream`.
 * Adapters bridge their native stream (Node `Readable`, in-memory
 * arrays, etc.) into a `WarpStream` at the boundary. See cycle
 * `docs/design/0025D-import-law/import-law.md`.
 *
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */

/** Chunk type yielded by `logNodesStream`. Byte chunks for native git
 *  subprocess output; string chunks for in-memory formatted records.
 *  `GitLogParser` accepts either. */
export type CommitLogChunk = Uint8Array | string;

export interface CommitNodeOptions {
  message: string;
  parents?: string[];
  sign?: boolean;
}

export interface CommitNodeWithTreeOptions {
  treeOid: string;
  parents?: string[];
  message: string;
  sign?: boolean;
}

export interface LogNodesOptions {
  ref: string;
  limit?: number;
  format?: string;
}

export interface NodeInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
}

export interface PingResult {
  ok: boolean;
  latencyMs: number;
}

/** Port for Git commit operations. */
export default abstract class CommitPort {
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
}
