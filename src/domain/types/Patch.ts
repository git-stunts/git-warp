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

import VersionVector from '../crdt/VersionVector.ts';
import PatchError from '../errors/PatchError.ts';
import type EntityAdmissionBoundary from './EntityAdmissionBoundary.ts';
import { freezeEntityAdmissionBoundaries } from './EntityAdmissionBoundaryRuntime.ts';
import type { PatchOp } from './ops/unions.ts';

function assertMetadataEntry(value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PatchError('Patch reads/writes entries must be non-empty strings', {
      code: 'E_PATCH_METADATA_ENTRY',
    });
  }
}

function assertStringArray(arr: readonly string[] | undefined): void {
  if (arr === undefined) {
    return;
  }
  if (!Array.isArray(arr)) {
    throw new PatchError('Patch reads/writes must be string arrays when provided', {
      code: 'E_PATCH_METADATA_TYPE',
    });
  }
  for (const value of arr) {
    assertMetadataEntry(value);
  }
}

/**
 * Returns the array if non-empty, otherwise undefined.
 */
function _nonEmpty(arr: readonly string[] | undefined): readonly string[] | undefined {
  assertStringArray(arr);
  return (arr && arr.length > 0) ? Object.freeze([...arr]) : undefined;
}

function validateSchema(schema: number): asserts schema is 2 | 3 {
  if (schema !== 2 && schema !== 3) {
    throw new PatchError(`Unsupported patch schema: ${schema}`, {
      code: 'E_PATCH_SCHEMA',
      context: { schema },
    });
  }
}

function validateWriter(writer: string): void {
  if (typeof writer !== 'string' || writer.length === 0) {
    throw new PatchError('Patch writer must be a non-empty string', {
      code: 'E_PATCH_WRITER',
      context: { writer },
    });
  }
}

function validateLamport(lamport: number): void {
  if (!Number.isInteger(lamport) || lamport < 0) {
    throw new PatchError('Patch lamport must be a non-negative integer', {
      code: 'E_PATCH_LAMPORT',
      context: { lamport },
    });
  }
}

function validateOps(ops: readonly PatchOp[]): void {
  if (!Array.isArray(ops)) {
    throw new PatchError('Patch ops must be an array', {
      code: 'E_PATCH_OPS',
      context: { actual: typeof ops },
    });
  }
}

function normalizeContext(
  context: VersionVector | Map<string, number> | Record<string, number>,
): VersionVector | Record<string, number> {
  if (context instanceof VersionVector) {
    const snapshot = context.clone();
    Object.freeze(snapshot);
    return snapshot;
  }
  if (context instanceof Map) {
    const snapshot = VersionVector.from(context);
    Object.freeze(snapshot);
    return snapshot;
  }
  VersionVector.from(context);
  return Object.freeze({ ...context });
}

/**
 * A batch of ordered operations from a single writer.
 */
export default class Patch {
  /**
   * Schema version (2 for node-only, 3 for edge properties).
   */
  readonly schema: 2 | 3;

  /**
   * Writer ID — identifies the source of the patch.
   */
  readonly writer: string;

  /**
   * Lamport timestamp for ordering.
   */
  readonly lamport: number;

  /**
   * Writer's observed frontier (NOT global stability).
   * May be a VersionVector instance or a plain object from CBOR
   * deserialization — callers at boundary sites normalize via
   * VersionVector.from().
   */
  readonly context: VersionVector | Record<string, number>;

  /**
   * Ordered array of operations.
   */
  readonly ops: readonly PatchOp[];

  /**
   * Node/edge IDs read by this patch (provenance tracking).
   * Omitted when empty for backward compatibility.
   */
  readonly reads: readonly string[] | undefined;

  /**
   * Node/edge IDs written by this patch (provenance tracking).
   * Omitted when empty for backward compatibility.
   */
  readonly writes: readonly string[] | undefined;

  /** Exact retained spans for entity admissions lowered into this patch. */
  entityAdmissions?: readonly EntityAdmissionBoundary[];

  /**
   * Creates a Patch.
   */
  constructor({ schema = 2, writer, lamport, context, ops, reads, writes, entityAdmissions }: {
    schema?: 2 | 3;
    writer: string;
    lamport: number;
    context: VersionVector | Map<string, number> | Record<string, number>;
    ops: readonly PatchOp[];
    reads?: readonly string[] | undefined;
    writes?: readonly string[] | undefined;
    entityAdmissions?: readonly EntityAdmissionBoundary[] | undefined;
  }) {
    validateSchema(schema);
    validateWriter(writer);
    validateLamport(lamport);
    validateOps(ops);

    this.schema = schema;
    this.writer = writer;
    this.lamport = lamport;
    this.context = normalizeContext(context);
    this.ops = Object.freeze([...ops]);
    this.reads = _nonEmpty(reads);
    this.writes = _nonEmpty(writes);
    const boundaries = freezeEntityAdmissionBoundaries(entityAdmissions, this.ops);
    if (boundaries !== undefined) {
      this.entityAdmissions = boundaries;
    }
    Object.freeze(this);
  }
}
