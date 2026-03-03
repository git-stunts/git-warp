/**
 * Shared trailer validation helpers for WARP message codecs.
 *
 * Extracted from AnchorMessageCodec, AuditMessageCodec,
 * CheckpointMessageCodec, and PatchMessageCodec to eliminate
 * duplicate validation patterns (B134, B138).
 *
 * @module domain/services/TrailerValidation
 * @private
 */

import { TRAILER_KEYS } from './MessageCodecInternal.js';

/**
 * Asserts that a required trailer field is present in the trailers object.
 *
 * @param {Record<string, string>} trailers - Decoded trailers
 * @param {string} key - TRAILER_KEYS member (e.g. 'graph')
 * @param {string} kind - Message kind for error messages (e.g. 'anchor')
 * @returns {string} The trailer value
 * @throws {Error} If the trailer is missing
 */
export function requireTrailer(trailers, key, kind) {
  const value = trailers[TRAILER_KEYS[key]];
  if (!value) {
    throw new Error(`Invalid ${kind} message: missing required trailer ${TRAILER_KEYS[key]}`);
  }
  return value;
}

/**
 * Parses a trailer value as a positive integer.
 *
 * @param {Record<string, string>} trailers - Decoded trailers
 * @param {string} key - TRAILER_KEYS member (e.g. 'schema')
 * @param {string} kind - Message kind for error messages (e.g. 'anchor')
 * @returns {number} The parsed positive integer
 * @throws {Error} If the trailer is missing or not a positive integer
 */
export function parsePositiveIntTrailer(trailers, key, kind) {
  const str = requireTrailer(trailers, key, kind);
  if (!/^\d+$/.test(str)) {
    throw new Error(`Invalid ${kind} message: ${TRAILER_KEYS[key]} must be a positive integer, got '${str}'`);
  }
  const num = Number(str);
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`Invalid ${kind} message: ${TRAILER_KEYS[key]} must be a positive integer, got '${str}'`);
  }
  return num;
}

/**
 * Validates the eg-kind discriminator trailer matches the expected kind.
 *
 * @param {Record<string, string>} trailers - Decoded trailers
 * @param {string} expected - Expected kind value (e.g. 'anchor')
 * @throws {Error} If the kind does not match
 */
export function validateKindDiscriminator(trailers, expected) {
  const kind = trailers[TRAILER_KEYS.kind];
  if (kind !== expected) {
    throw new Error(`Invalid ${expected} message: eg-kind must be '${expected}', got '${kind}'`);
  }
}
