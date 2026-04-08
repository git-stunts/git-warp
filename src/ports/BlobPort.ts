/**
 * Port for Git blob operations.
 *
 * Defines the contract for writing and reading Git blob objects.
 * This is one of five focused ports extracted from GraphPersistencePort.
 *
 * @see GraphPersistencePort - Composite port implementing all five focused ports
 */

/** Port for Git blob operations. */
export default abstract class BlobPort {
  /** Writes content as a Git blob and returns its OID. */
  abstract writeBlob(_content: Uint8Array | string): Promise<string>;

  /** Reads the content of a Git blob by OID. */
  abstract readBlob(_oid: string): Promise<Uint8Array>;
}
