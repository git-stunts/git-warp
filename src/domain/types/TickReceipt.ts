/**
 * TickReceipt — immutable record of per-operation outcomes from a single patch application.
 *
 * A tick receipt captures what happened to each operation in a patch during
 * materialization: whether it was applied, superseded by a concurrent write,
 * or redundant (already present in the state).
 *
 * This is a type definition only — emission logic lives in LH/RECEIPTS/2.
 *
 * @module TickReceipt
 * @see Paper II, Section 5 — Tick receipts: event posets recording accepted/rejected matches
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid operation types that can appear in a tick receipt.
 */
export const OP_TYPES: readonly string[] = Object.freeze([
  'NodeAdd',
  'NodeTombstone',
  'EdgeAdd',
  'EdgeTombstone',
  'PropSet',
  'NodePropSet',
  'EdgePropSet',
  'BlobValue',
]);

/**
 * Valid result values for an operation outcome.
 */
export const RESULT_TYPES: readonly string[] = Object.freeze([
  'applied',
  'superseded',
  'redundant',
]);

// ============================================================================
// Validation Helpers
// ============================================================================

const opTypeSet = new Set(OP_TYPES);
const resultTypeSet = new Set(RESULT_TYPES);

/**
 * Asserts that a value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Validates a single operation outcome entry.
 *
 * @throws If validation fails
 */
function validateOp(op: unknown, index: number): void {
  if (!isObject(op)) {
    throw new Error(`ops[${index}] must be an object`);
  }

  const entry = op;
  validateOpType(entry['op'], index);
  validateOpTarget(entry['target'], index);
  validateOpResult(entry['result'], index);

  if (entry['reason'] !== undefined && typeof entry['reason'] !== 'string') {
    throw new Error(`ops[${index}].reason must be a string or undefined`);
  }
}

/**
 * Validates that an operation type is one of the allowed OP_TYPES.
 *
 * Valid operation types correspond to the eight receipt operation types:
 * NodeAdd, NodeTombstone, EdgeAdd, EdgeTombstone, PropSet, NodePropSet,
 * EdgePropSet, and BlobValue.
 *
 * @example
 * validateOpType('NodeAdd', 0); // OK
 * validateOpType('InvalidOp', 0); // throws Error
 * validateOpType(123, 0); // throws Error
 */
function validateOpType(value: unknown, i: number): void {
  if (typeof value !== 'string' || !opTypeSet.has(value)) {
    throw new Error(`ops[${i}].op must be one of: ${OP_TYPES.join(', ')}`);
  }
}

/**
 * Validates that an operation target is a non-empty string.
 *
 * The target identifies what entity was affected by the operation:
 * - For node operations: the node ID (e.g., "user:alice")
 * - For edge operations: the edge key (e.g., "user:alice\0user:bob\0follows")
 * - For property operations: the property key (e.g., "user:alice\0name")
 *
 * @example
 * validateOpTarget('user:alice', 0); // OK
 * validateOpTarget('', 0); // throws Error
 * validateOpTarget(null, 0); // throws Error
 */
function validateOpTarget(value: unknown, i: number): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`ops[${i}].target must be a non-empty string`);
  }
}

/**
 * Validates that an operation result is one of the allowed RESULT_TYPES.
 *
 * Valid results describe the outcome of applying the operation:
 * - `'applied'`: The operation was successfully applied to the state
 * - `'superseded'`: The operation was overridden by a concurrent write
 *   (e.g., LWW register where another writer had a higher timestamp)
 * - `'redundant'`: The operation had no effect because the state already
 *   reflected it (e.g., adding a node that was already present)
 *
 * @example
 * validateOpResult('applied', 0); // OK
 * validateOpResult('superseded', 1); // OK
 * validateOpResult('failed', 0); // throws Error
 */
function validateOpResult(value: unknown, i: number): void {
  if (typeof value !== 'string' || !resultTypeSet.has(value)) {
    throw new Error(`ops[${i}].result must be one of: ${RESULT_TYPES.join(', ')}`);
  }
}

// ============================================================================
// Factory
// ============================================================================

type OpResult = 'applied' | 'superseded' | 'redundant';

export type OpOutcome = {
  op: string;
  target: string;
  result: OpResult;
  reason?: string;
};

/**
 * TickReceipt — immutable record of per-operation outcomes from a single patch.
 */
export class TickReceipt {
  /** Lamport timestamp of the patch */
  readonly lamport: number;

  /** Per-operation outcomes (frozen) */
  readonly ops: ReadonlyArray<Readonly<OpOutcome>>;

  /** SHA of the patch commit */
  readonly patchSha: string;

  /** Writer ID that produced the patch */
  readonly writer: string;

  /**
   * Creates an immutable TickReceipt.
   *
   * @throws If any field is invalid
   */
  constructor({ patchSha, writer, lamport, ops }: { patchSha: string; writer: string; lamport: number; ops: OpOutcome[] }) {
    assertNonEmptyString(patchSha, 'patchSha');
    assertNonEmptyString(writer, 'writer');
    assertNonNegativeInt(lamport);
    assertOpsArray(ops);

    this.lamport = lamport;
    this.ops = freezeOps(ops);
    this.patchSha = patchSha;
    this.writer = writer;
    Object.freeze(this);
  }
}

/**
 * Creates an immutable TickReceipt.
 */
export function createTickReceipt({ patchSha, writer, lamport, ops }: { patchSha: string; writer: string; lamport: number; ops: OpOutcome[] }): TickReceipt {
  return new TickReceipt({ patchSha, writer, lamport, ops });
}

/**
 * Asserts that a value is a non-empty string.
 */
function assertNonEmptyString(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

/**
 * Asserts that lamport is a non-negative integer.
 */
function assertNonNegativeInt(value: unknown): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error('lamport must be a non-negative integer');
  }
}

/**
 * Asserts that ops is a valid array and validates each entry.
 */
function assertOpsArray(ops: unknown): void {
  if (!Array.isArray(ops)) {
    throw new Error('ops must be an array');
  }
  for (let i = 0; i < ops.length; i++) {
    validateOp(ops[i], i);
  }
}

/**
 * Builds a frozen, defensively-copied array of operation outcomes.
 */
function freezeOps(ops: OpOutcome[]): ReadonlyArray<Readonly<OpOutcome>> {
  return Object.freeze(
    ops.map((o) => {
      const entry: { op: string; target: string; result: OpResult; reason?: string } = { op: o.op, target: o.target, result: o.result };
      if (o.reason !== undefined) {
        entry.reason = o.reason;
      }
      return Object.freeze(entry);
    }),
  );
}

// ============================================================================
// Canonical JSON Serialization
// ============================================================================

/**
 * Produces a deterministic JSON string for a TickReceipt.
 *
 * Keys are sorted alphabetically at every nesting level, ensuring
 * identical receipts always produce identical byte strings regardless
 * of property insertion order.
 */
export function canonicalJson(receipt: TickReceipt): string {
  return JSON.stringify(receipt, sortedReplacer);
}

/**
 * JSON.stringify replacer callback that sorts object keys alphabetically.
 *
 * This function is passed as the second argument to `JSON.stringify()` and
 * is called recursively for every key-value pair in the object being serialized.
 * For plain objects, it returns a new object with keys in sorted order, ensuring
 * deterministic JSON output regardless of property insertion order.
 *
 * Arrays are passed through unchanged since their order is semantically significant.
 * Primitive values (strings, numbers, booleans, null) are also passed through unchanged.
 *
 * This is essential for producing canonical JSON representations that can be
 * compared byte-for-byte or hashed consistently.
 *
 * @example
 * // Used internally by canonicalJson
 * JSON.stringify({ b: 1, a: 2 }, sortedReplacer);
 * // Returns: '{"a":2,"b":1}'
 *
 * @example
 * // Nested objects are also sorted
 * JSON.stringify({ z: { b: 1, a: 2 }, y: 3 }, sortedReplacer);
 * // Returns: '{"y":3,"z":{"a":2,"b":1}}'
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: { [x: string]: unknown } = {};
    const obj = value as { [x: string]: unknown };
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}
