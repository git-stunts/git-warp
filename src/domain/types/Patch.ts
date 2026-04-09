/**
 * Patch — the atomic unit of the WARP protocol.
 *
 * A batch of ordered operations from a single writer, carrying causal
 * context (version vector) and a Lamport timestamp for ordering.
 *
 * Fields are public because JoinReducer, PatchBuilder, and codec
 * boundaries access them structurally.
 *
 * @module domain/types/Patch
 */

import type VersionVector from '../crdt/VersionVector.ts';
import type { OpV2 } from './ops/unions.ts';

/**
 * Returns the array if non-empty, otherwise undefined.
 */
function _nonEmpty(arr: string[] | undefined): string[] | undefined {
  return (arr && arr.length > 0) ? arr : undefined;
}

/**
 * A batch of ordered operations from a single writer.
 */
export default class Patch {
  /**
   * Schema version (2 for node-only, 3 for edge properties).
   */
  schema: 2 | 3;

  /**
   * Writer ID — identifies the source of the patch.
   */
  writer: string;

  /**
   * Lamport timestamp for ordering.
   */
  lamport: number;

  /**
   * Writer's observed frontier (NOT global stability).
   * May be a VersionVector instance or a plain object from CBOR
   * deserialization — callers at boundary sites normalize via
   * VersionVector.from().
   */
  context: VersionVector | Record<string, number>;

  /**
   * Ordered array of operations.
   */
  ops: OpV2[];

  /**
   * Node/edge IDs read by this patch (provenance tracking).
   * Omitted when empty for backward compatibility.
   */
  reads: string[] | undefined;

  /**
   * Node/edge IDs written by this patch (provenance tracking).
   * Omitted when empty for backward compatibility.
   */
  writes: string[] | undefined;

  /**
   * Creates a Patch.
   */
  constructor({ schema = 2, writer, lamport, context, ops, reads, writes }: {
    schema?: 2 | 3;
    writer: string;
    lamport: number;
    context: VersionVector | Record<string, number>;
    ops: OpV2[];
    reads?: string[] | undefined;
    writes?: string[] | undefined;
  }) {
    this.schema = schema;
    this.writer = writer;
    this.lamport = lamport;
    this.context = context;
    this.ops = ops;
    this.reads = _nonEmpty(reads);
    this.writes = _nonEmpty(writes);
  }
}
