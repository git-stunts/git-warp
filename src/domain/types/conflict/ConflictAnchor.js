/**
 * ConflictAnchor — runtime-backed identity coordinate for an operation in a patch.
 *
 * Identifies a specific operation within the conflict analysis pipeline by its
 * patch SHA, writer ID, lamport clock, and operation index. Optional receipt
 * fields track the receipt-time coordinates when the operation was applied.
 *
 * @module domain/types/conflict/ConflictAnchor
 */

const VALID_SHA_RE = /^[0-9a-f]{4,64}$/;

/**
 * Validates that a value is a non-empty string.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @returns {string} The validated string.
 */
function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`ConflictAnchor: ${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Validates that a value is a non-negative integer.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @returns {number} The validated integer.
 */
function requireNonNegativeInt(value, name) {
  if (!Number.isInteger(value) || /** @type {number} */ (value) < 0) {
    throw new TypeError(`ConflictAnchor: ${name} must be a non-negative integer`);
  }
  return /** @type {number} */ (value);
}

/**
 * Validates an optional hex SHA string.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @returns {string|undefined} The validated string or undefined.
 */
function optionalSha(value, name) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || !VALID_SHA_RE.test(value)) {
    throw new TypeError(`ConflictAnchor: ${name} must be a hex SHA string (4-64 chars) when provided`);
  }
  return value;
}

/**
 * Validates an optional non-negative integer.
 *
 * @param {unknown} value - The value to check.
 * @param {string} name - Field name for error messages.
 * @returns {number|undefined} The validated integer or undefined.
 */
function optionalNonNegativeInt(value, name) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireNonNegativeInt(value, name);
}

/**
 * Compares two strings lexicographically.
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function compareStrings(a, b) {
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
  /**
   * Creates a new ConflictAnchor with validated fields.
   *
   * @param {{
   *   patchSha: string,
   *   writerId: string,
   *   lamport: number,
   *   opIndex: number,
   *   receiptPatchSha?: string,
   *   receiptLamport?: number,
   *   receiptOpIndex?: number
   * }} fields - Anchor identity fields.
   */
  constructor({ patchSha, writerId, lamport, opIndex, receiptPatchSha, receiptLamport, receiptOpIndex }) {
    /** @type {string} Hex SHA of the patch containing this operation. */
    this.patchSha = requireNonEmptyString(patchSha, 'patchSha');

    /** @type {string} Writer that authored the patch. */
    this.writerId = requireNonEmptyString(writerId, 'writerId');

    /** @type {number} Lamport clock of the patch. */
    this.lamport = requireNonNegativeInt(lamport, 'lamport');

    /** @type {number} Zero-based index of the operation within the patch. */
    this.opIndex = requireNonNegativeInt(opIndex, 'opIndex');

    /** @type {string|undefined} Receipt-time patch SHA, if available. */
    this.receiptPatchSha = optionalSha(receiptPatchSha, 'receiptPatchSha');

    /** @type {number|undefined} Receipt-time lamport, if available. */
    this.receiptLamport = optionalNonNegativeInt(receiptLamport, 'receiptLamport');

    /** @type {number|undefined} Receipt-time op index, if available. */
    this.receiptOpIndex = optionalNonNegativeInt(receiptOpIndex, 'receiptOpIndex');

    Object.freeze(this);
  }

  /**
   * Serializes this anchor into a deterministic padded string for sorting and hashing.
   *
   * Format: `writerId:lamport(16-padded):patchSha:opIndex(8-padded)`
   *
   * @returns {string} Deterministic string representation.
   */
  toString() {
    return `${this.writerId}:${String(this.lamport).padStart(16, '0')}:${this.patchSha}:${String(this.opIndex).padStart(8, '0')}`;
  }

  /**
   * Compares two ConflictAnchors using their deterministic string representations.
   *
   * @param {ConflictAnchor} a - First anchor.
   * @param {ConflictAnchor} b - Second anchor.
   * @returns {number} Negative, zero, or positive for ordering.
   */
  static compare(a, b) {
    return compareStrings(a.toString(), b.toString());
  }

  /**
   * Creates a ConflictAnchor from an OpRecord, using the record's patch coordinates
   * and mapping receiptPatchSha/receiptLamport from the same patch.
   *
   * @param {{
   *   patchSha: string,
   *   writerId: string,
   *   lamport: number,
   *   opIndex: number,
   *   receiptOpIndex: number
   * }} record - An operation record with anchor-compatible fields.
   * @returns {ConflictAnchor} A new anchor derived from the record.
   */
  static fromRecord(record) {
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
   *
   * @param {{
   *   sha: string,
   *   patch: { writer: string, lamport: number }
   * }} frame - A patch frame with identity fields.
   * @returns {ConflictAnchor} A new anchor at opIndex 0.
   */
  static fromFrame(frame) {
    return new ConflictAnchor({
      patchSha: frame.sha,
      writerId: frame.patch.writer,
      lamport: frame.patch.lamport,
      opIndex: 0,
    });
  }
}
