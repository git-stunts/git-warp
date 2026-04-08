import PatchError from '../../errors/PatchError.ts';
/**
 * Shared validation helpers for Op constructors.
 *
 * Mirrors PatchBuilderV2._assertNoReservedBytes for consistency —
 * ops constructed outside PatchBuilderV2 (CBOR decode, tests, direct
 * construction) get the same validation.
 *
 * @module domain/types/ops/validate
 */

/** NUL byte — edge key field separator */
const FIELD_SEPARATOR = '\x00';

/** Edge property prefix — reserved for wire encoding */
const EDGE_PROP_PREFIX = '\x01';

/**
 * Asserts that a value is a non-empty string.
 */
export function assertNonEmptyString(value: unknown, opName: string, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PatchError(`${opName} requires '${field}' to be a non-empty string`);
  }
}

/**
 * Asserts that a string identifier contains no reserved bytes.
 *
 * Rejects:
 * - NUL (\x00) — edge key field separator
 * - \x01 prefix — reserved for edge property encoding on the wire
 *
 * Matches PatchBuilderV2._assertNoReservedBytes.
 */
export function assertNoReservedBytes(value: string, opName: string, field: string): void {
  if (value.includes(FIELD_SEPARATOR)) {
    throw new PatchError(`${opName} '${field}' must not contain NUL (\\x00) bytes`);
  }
  if (value.length > 0 && value[0] === EDGE_PROP_PREFIX) {
    throw new PatchError(`${opName} '${field}' must not start with reserved prefix \\x01`);
  }
}

/**
 * Asserts that a value is an Array.
 */
export function assertArray(value: unknown, opName: string, field: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new PatchError(`${opName} requires '${field}' to be an array`);
  }
}
