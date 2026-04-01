/**
 * Utilities for parsing seek-cursor blobs stored as Git refs.
 *
 * @module parseCursorBlob
 */

/**
 * Parses and validates a cursor blob (Uint8Array) into a cursor object.
 *
 * The blob must contain UTF-8-encoded JSON representing a plain object with at
 * minimum a finite numeric `tick` field.  Any additional fields (e.g. `mode`,
 * `name`) are preserved in the returned object.
 *
 * @param {Uint8Array} buf - Raw blob contents (UTF-8 encoded JSON)
 * @param {string} label - Human-readable label used in error messages
 *   (e.g. `"active cursor"`, `"saved cursor 'foo'"`)
 * @returns {{ tick: number, mode?: string, [key: string]: unknown }}
 *   The validated cursor object.  `tick` is guaranteed to be a finite number.
 * @throws {Error} If `buf` is not valid JSON
 * @throws {Error} If the parsed value is not a plain JSON object (e.g. array,
 *   null, or primitive)
 * @throws {Error} If the `tick` field is missing, non-numeric, NaN, or
 *   Infinity
 *
 * @example
 * const buf = new TextEncoder().encode('{"tick":5,"mode":"lamport"}');
 * const cursor = parseCursorBlob(buf, 'active cursor');
 * // => { tick: 5, mode: 'lamport' }
 *
 * @example
 * // Throws: "Corrupted active cursor: blob is not valid JSON"
 * parseCursorBlob(new TextEncoder().encode('not json'), 'active cursor');
 */
export function parseCursorBlob(buf, label) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new Error(`Corrupted ${label}: blob is not valid JSON`);
  }

  assertPlainObject(raw, label);
  assertFiniteTick(raw, label);

  return raw;
}

/**
 * Asserts that the parsed value is a non-null, non-array object.
 *
 * @param {unknown} val - Parsed JSON value
 * @param {string} label - Label for error messages
 * @returns {asserts val is Record<string, unknown>}
 */
function assertPlainObject(val, label) {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) {
    throw new Error(`Corrupted ${label}: expected a JSON object`);
  }
}

/**
 * Asserts that the object has a finite numeric `tick` field.
 *
 * @param {Record<string, unknown>} obj - The cursor object
 * @param {string} label - Label for error messages
 * @returns {asserts obj is { tick: number, [key: string]: unknown }}
 */
function assertFiniteTick(obj, label) {
  const { tick } = obj;
  if (typeof tick !== 'number' || !Number.isFinite(tick)) {
    throw new Error(`Corrupted ${label}: missing or invalid numeric tick`);
  }
}
