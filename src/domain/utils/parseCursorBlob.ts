/**
 * Utilities for parsing seek-cursor blobs stored as Git refs.
 *
 * @module parseCursorBlob
 */

import PersistenceError from '../errors/PersistenceError.ts';

interface CursorBlob {
  readonly tick: number;
  readonly mode?: string;
  readonly [key: string]: unknown;
}

/**
 * Parses and validates a cursor blob (Uint8Array) into a cursor object.
 *
 * The blob must contain UTF-8-encoded JSON representing a plain object with at
 * minimum a finite numeric `tick` field.  Any additional fields (e.g. `mode`,
 * `name`) are preserved in the returned object.
 *
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
export function parseCursorBlob(buf: Uint8Array, label: string): CursorBlob {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new PersistenceError(`Corrupted ${label}: blob is not valid JSON`, 'E_MISSING_OBJECT');
  }

  assertPlainObject(raw, label);
  assertFiniteTick(raw, label);

  return raw as CursorBlob;
}

/**
 * Asserts that the parsed value is a non-null, non-array object.
 */
function assertPlainObject(val: unknown, label: string): asserts val is Record<string, unknown> {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) {
    throw new PersistenceError(`Corrupted ${label}: expected a JSON object`, 'E_MISSING_OBJECT');
  }
}

/**
 * Asserts that the object has a finite numeric `tick` field.
 */
function assertFiniteTick(obj: Record<string, unknown>, label: string): asserts obj is { tick: number; [key: string]: unknown } {
  const { tick } = obj;
  if (typeof tick !== 'number' || !Number.isFinite(tick)) {
    throw new PersistenceError(`Corrupted ${label}: missing or invalid numeric tick`, 'E_MISSING_OBJECT');
  }
}
