/**
 * ConflictAnchor — runtime-backed identity coordinate for an operation in a patch.
 *
 * Identifies a specific operation within the conflict analysis pipeline by its
 * patch SHA, writer ID, lamport clock, and operation index. Optional receipt
 * fields track the receipt-time coordinates when the operation was applied.
 *
 * @module domain/types/conflict/ConflictAnchor
 */

import WarpError from '../../errors/WarpError.ts';

const VALID_SHA_RE = /^[0-9a-f]{4,64}$/;

/**
 * Validates that a value is a non-empty string.
 */
function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`ConflictAnchor: ${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/**
 * Validates that a value is a non-negative integer.
 */
function requireNonNegativeInt(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new WarpError(`ConflictAnchor: ${name} must be a non-negative integer`, 'E_VALIDATION');
  }
  return value as number;
}

/**
 * Validates an optional hex SHA string.
 */
function optionalSha(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || !VALID_SHA_RE.test(value)) {
    throw new WarpError(`ConflictAnchor: ${name} must be a hex SHA string (4-64 chars) when provided`, 'E_VALIDATION');
  }
  return value;
}

/**
 * Validates an optional non-negative integer.
 */
function optionalNonNegativeInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireNonNegativeInt(value, name);
}

/**
 * Compares two strings lexicographically.
 */
function compareStrings(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * A runtime-backed identity coordinate for a single operation within a patch.
 *
 * Instances are frozen on construction. All invariants are validated eagerly.
 */
export default class ConflictAnchor {
  readonly patchSha: string;
  readonly writerId: string;
  readonly lamport: number;
  readonly opIndex: number;
  readonly receiptPatchSha: string | undefined;
  readonly receiptLamport: number | undefined;
  readonly receiptOpIndex: number | undefined;

  /**
   * Creates a new ConflictAnchor with validated fields.
   */
  constructor({ patchSha, writerId, lamport, opIndex, receiptPatchSha, receiptLamport, receiptOpIndex }: {
    patchSha: string;
    writerId: string;
    lamport: number;
    opIndex: number;
    receiptPatchSha?: string;
    receiptLamport?: number;
    receiptOpIndex?: number;
  }) {
    this.patchSha = requireNonEmptyString(patchSha, 'patchSha');
    this.writerId = requireNonEmptyString(writerId, 'writerId');
    this.lamport = requireNonNegativeInt(lamport, 'lamport');
    this.opIndex = requireNonNegativeInt(opIndex, 'opIndex');
    this.receiptPatchSha = optionalSha(receiptPatchSha, 'receiptPatchSha');
    this.receiptLamport = optionalNonNegativeInt(receiptLamport, 'receiptLamport');
    this.receiptOpIndex = optionalNonNegativeInt(receiptOpIndex, 'receiptOpIndex');

    Object.freeze(this);
  }

  /**
   * Serializes this anchor into a deterministic padded string for sorting and hashing.
   *
   * Format: `writerId:lamport(16-padded):patchSha:opIndex(8-padded)`
   */
  toString(): string {
    return `${this.writerId}:${String(this.lamport).padStart(16, '0')}:${this.patchSha}:${String(this.opIndex).padStart(8, '0')}`;
  }

  /**
   * Compares two ConflictAnchors using their deterministic string representations.
   */
  static compare(a: ConflictAnchor, b: ConflictAnchor): number {
    return compareStrings(a.toString(), b.toString());
  }

  /**
   * Creates a ConflictAnchor from an OpRecord, using the record's patch coordinates
   * and mapping receiptPatchSha/receiptLamport from the same patch.
   */
  static fromRecord(record: {
    patchSha: string;
    writerId: string;
    lamport: number;
    opIndex: number;
    receiptOpIndex: number;
  }): ConflictAnchor {
    return new ConflictAnchor({
      patchSha: record.patchSha,
      writerId: record.writerId,
      lamport: record.lamport,
      opIndex: record.opIndex,
      receiptPatchSha: record.patchSha,
      receiptLamport: record.lamport,
      receiptOpIndex: record.receiptOpIndex,
    });
  }

  /**
   * Creates a ConflictAnchor from a PatchFrame for diagnostic/traversal output.
   */
  static fromFrame(frame: {
    sha: string;
    patch: { writer: string; lamport: number };
  }): ConflictAnchor {
    return new ConflictAnchor({
      patchSha: frame.sha,
      writerId: frame.patch.writer,
      lamport: frame.patch.lamport,
      opIndex: 0,
    });
  }
}
