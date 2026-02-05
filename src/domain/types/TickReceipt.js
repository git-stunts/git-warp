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
 * @type {ReadonlyArray<string>}
 */
export const OP_TYPES = Object.freeze([
  'NodeAdd',
  'NodeTombstone',
  'EdgeAdd',
  'EdgeTombstone',
  'PropSet',
  'BlobValue',
]);

/**
 * Valid result values for an operation outcome.
 * @type {ReadonlyArray<string>}
 */
export const RESULT_TYPES = Object.freeze([
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
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isObject(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Validates a single operation outcome entry.
 *
 * @param {unknown} op - The operation outcome to validate
 * @param {number} index - Index within the ops array (for error messages)
 * @throws {Error} If validation fails
 */
function validateOp(op, index) {
  if (!isObject(op)) {
    throw new Error(`ops[${index}] must be an object`);
  }

  validateOpType(op.op, index);
  validateOpTarget(op.target, index);
  validateOpResult(op.result, index);

  if (op.reason !== undefined && typeof op.reason !== 'string') {
    throw new Error(`ops[${index}].reason must be a string or undefined`);
  }
}

/**
 * Validates that an operation type is one of the allowed OP_TYPES.
 *
 * Valid operation types correspond to the six patch operations defined
 * in PatchBuilderV2: NodeAdd, NodeTombstone, EdgeAdd, EdgeTombstone,
 * PropSet, and BlobValue.
 *
 * @param {unknown} value - The operation type to validate
 * @param {number} i - Index of the operation in the ops array (for error messages)
 * @returns {void}
 * @throws {Error} If value is not a string or not one of the valid OP_TYPES
 *
 * @example
 * validateOpType('NodeAdd', 0); // OK
 * validateOpType('InvalidOp', 0); // throws Error
 * validateOpType(123, 0); // throws Error
 */
function validateOpType(value, i) {
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
 * @param {unknown} value - The target to validate
 * @param {number} i - Index of the operation in the ops array (for error messages)
 * @returns {void}
 * @throws {Error} If value is not a non-empty string
 *
 * @example
 * validateOpTarget('user:alice', 0); // OK
 * validateOpTarget('', 0); // throws Error
 * validateOpTarget(null, 0); // throws Error
 */
function validateOpTarget(value, i) {
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
 * @param {unknown} value - The result to validate
 * @param {number} i - Index of the operation in the ops array (for error messages)
 * @returns {void}
 * @throws {Error} If value is not a string or not one of the valid RESULT_TYPES
 *
 * @example
 * validateOpResult('applied', 0); // OK
 * validateOpResult('superseded', 1); // OK
 * validateOpResult('failed', 0); // throws Error
 */
function validateOpResult(value, i) {
  if (typeof value !== 'string' || !resultTypeSet.has(value)) {
    throw new Error(`ops[${i}].result must be one of: ${RESULT_TYPES.join(', ')}`);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * @typedef {Object} OpOutcome
 * @property {string} op - Operation type ('NodeAdd' | 'NodeTombstone' | 'EdgeAdd' | 'EdgeTombstone' | 'PropSet' | 'BlobValue')
 * @property {string} target - Node ID or edge key
 * @property {'applied' | 'superseded' | 'redundant'} result - Outcome of the operation
 * @property {string} [reason] - Human-readable explanation (e.g., "LWW: writer bob at lamport 43 wins")
 */

/**
 * @typedef {Object} TickReceipt
 * @property {string} patchSha - SHA of the patch commit
 * @property {string} writer - Writer ID that produced the patch
 * @property {number} lamport - Lamport timestamp of the patch
 * @property {ReadonlyArray<Readonly<OpOutcome>>} ops - Per-operation outcomes (frozen)
 */

/**
 * Creates an immutable TickReceipt.
 *
 * @param {Object} params
 * @param {string} params.patchSha - SHA of the patch commit
 * @param {string} params.writer - Writer ID
 * @param {number} params.lamport - Lamport timestamp (non-negative integer)
 * @param {OpOutcome[]} params.ops - Per-operation outcome records
 * @returns {Readonly<TickReceipt>} Frozen tick receipt
 * @throws {Error} If any parameter is invalid
 */
export function createTickReceipt({ patchSha, writer, lamport, ops }) {
  // --- patchSha ---
  if (typeof patchSha !== 'string' || patchSha.length === 0) {
    throw new Error('patchSha must be a non-empty string');
  }

  // --- writer ---
  if (typeof writer !== 'string' || writer.length === 0) {
    throw new Error('writer must be a non-empty string');
  }

  // --- lamport ---
  if (!Number.isInteger(lamport) || lamport < 0) {
    throw new Error('lamport must be a non-negative integer');
  }

  // --- ops ---
  if (!Array.isArray(ops)) {
    throw new Error('ops must be an array');
  }

  for (let i = 0; i < ops.length; i++) {
    validateOp(ops[i], i);
  }

  // Build frozen op copies (defensive: don't alias caller's objects)
  const frozenOps = Object.freeze(
    ops.map((o) => {
      const entry = { op: o.op, target: o.target, result: o.result };
      if (o.reason !== undefined) {
        entry.reason = o.reason;
      }
      return Object.freeze(entry);
    }),
  );

  return Object.freeze({
    patchSha,
    writer,
    lamport,
    ops: frozenOps,
  });
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
 *
 * @param {TickReceipt} receipt - A TickReceipt (as returned by createTickReceipt)
 * @returns {string} Deterministic JSON string
 */
export function canonicalJson(receipt) {
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
 * @param {string} _key - The current property key being processed (unused)
 * @param {unknown} value - The current value being processed
 * @returns {unknown} For objects: a new object with alphabetically sorted keys.
 *   For arrays and primitives: the value unchanged.
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
 *
 * @private
 */
function sortedReplacer(_key, value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted = {};
    for (const k of Object.keys(value).sort()) {
      sorted[k] = value[k];
    }
    return sorted;
  }
  return value;
}
