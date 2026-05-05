/**
 * Port interface for bitmap index storage operations.
 *
 * This port defines the contract for persisting and retrieving
 * the sharded bitmap index data. Adapters implement this interface
 * to store indexes in different backends (Git, filesystem, etc.).
 *
 * This port is a subset of the focused ports: it uses methods from
 * BlobPort (writeBlob, readBlob), TreePort (writeTree, readTreeOids),
 * and RefPort (updateRef, readRef).
 */

/** Port for bitmap index storage operations. */
export default abstract class IndexStoragePort {
  // -- BlobPort subset --

  /** Writes content as a Git blob and returns its OID. */
  abstract writeBlob(_content: Uint8Array | string): Promise<string>;

  /** Reads the content of a Git blob by OID. */
  abstract readBlob(_oid: string): Promise<Uint8Array>;

  // -- TreePort subset --

  /** Creates a Git tree from mktree-formatted entries. */
  abstract writeTree(_entries: string[]): Promise<string>;

  /**
   * Reads a tree and returns a map of path to blob OID.
   * Useful for lazy-loading shards without reading all blob contents.
   */
  abstract readTreeOids(_treeOid: string): Promise<Record<string, string>>;

  // -- RefPort subset --

  /** Updates a ref to point to an OID. */
  abstract updateRef(_ref: string, _oid: string): Promise<void>;

  /** Reads the OID a ref points to, or null if the ref does not exist. */
  abstract readRef(_ref: string): Promise<string | null>;
}
