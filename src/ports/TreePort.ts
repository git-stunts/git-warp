/**
 * Port for Git tree operations.
 *
 * Defines the contract for writing and reading Git tree objects.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */

/** Port for Git tree operations. */
export default abstract class TreePort {
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
}
