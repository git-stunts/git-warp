/**
 * PatchV2 — the atomic unit of the WARP protocol.
 *
 * A batch of ordered operations from a single writer, carrying causal
 * context (version vector) and a Lamport timestamp for ordering.
 *
 * Fields are public because JoinReducer, PatchBuilderV2, and codec
 * boundaries access them structurally.
 *
 * @module domain/types/PatchV2
 */

/**
 * Returns the array if non-empty, otherwise undefined.
 * @param {string[] | undefined} arr
 * @returns {string[] | undefined}
 */
function _nonEmpty(arr) {
  return (arr && arr.length > 0) ? arr : undefined;
}

/**
 * A batch of ordered operations from a single writer.
 */
export default class PatchV2 {
  /**
   * Schema version (2 for node-only, 3 for edge properties).
   * @type {2 | 3}
   */
  schema;

  /**
   * Writer ID — identifies the source of the patch.
   * @type {string}
   */
  writer;

  /**
   * Lamport timestamp for ordering.
   * @type {number}
   */
  lamport;

  /**
   * Writer's observed frontier (NOT global stability).
   * May be a VersionVector instance or a plain object from CBOR
   * deserialization — callers at boundary sites normalize via
   * VersionVector.from().
   * @type {import('../crdt/VersionVector.js').default | Record<string, number>}
   */
  context;

  /**
   * Ordered array of operations.
   * @type {import('./WarpTypesV2.js').OpV2[]}
   */
  ops;

  /**
   * Node/edge IDs read by this patch (provenance tracking).
   * Omitted when empty for backward compatibility.
   * @type {string[] | undefined}
   */
  reads;

  /**
   * Node/edge IDs written by this patch (provenance tracking).
   * Omitted when empty for backward compatibility.
   * @type {string[] | undefined}
   */
  writes;

  /**
   * Creates a PatchV2.
   *
   * @param {{
   *   schema?: 2 | 3,
   *   writer: string,
   *   lamport: number,
   *   context: import('../crdt/VersionVector.js').default | Record<string, number>,
   *   ops: import('./WarpTypesV2.js').OpV2[],
   *   reads?: string[],
   *   writes?: string[]
   * }} fields
   */
  constructor({ schema = 2, writer, lamport, context, ops, reads, writes }) {
    this.schema = schema;
    this.writer = writer;
    this.lamport = lamport;
    this.context = context;
    this.ops = ops;
    this.reads = _nonEmpty(reads);
    this.writes = _nonEmpty(writes);
  }
}
