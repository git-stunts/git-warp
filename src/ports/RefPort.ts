/**
 * Port for Git ref operations.
 *
 * Defines the contract for creating, reading, and deleting Git refs.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */

export interface ListRefsOptions {
  limit?: number;
}

/** Port for Git ref operations. */
export default abstract class RefPort {
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
