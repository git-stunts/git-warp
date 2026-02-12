/**
 * Schema version detection and compatibility validation for WARP messages.
 *
 * Provides utilities to detect schema versions from patch operations,
 * detect message kinds from raw commit messages, and validate operation
 * compatibility with a reader's maximum supported schema version.
 *
 * See {@link module:domain/services/WarpMessageCodec} for the facade
 * that re-exports all functions from this module.
 *
 * @module domain/services/MessageSchemaDetector
 */

import { EDGE_PROP_PREFIX } from './KeyCodec.js';
import SchemaUnsupportedError from '../errors/SchemaUnsupportedError.js';
import { getCodec, TRAILER_KEYS } from './MessageCodecInternal.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Schema version for classic node-only patches (V5 format).
 * @type {number}
 */
export const SCHEMA_V2 = 2;

/**
 * Schema version for patches that may contain edge property PropSet ops.
 * @type {number}
 */
export const SCHEMA_V3 = 3;

// -----------------------------------------------------------------------------
// Schema Version Detection
// -----------------------------------------------------------------------------

/**
 * Detects the appropriate schema version for a set of patch operations.
 *
 * Returns schema 3 if ANY PropSet op has a `node` field starting with the
 * edge property prefix (`\x01`), indicating edge property support is required.
 * Otherwise returns schema 2 for backward compatibility.
 *
 * @param {Array<{type: string, node?: string}>} ops - Array of patch operations
 * @returns {number} The schema version (2 or 3)
 */
export function detectSchemaVersion(ops) {
  if (!Array.isArray(ops)) {
    return SCHEMA_V2;
  }
  for (const op of ops) {
    if (op.type === 'PropSet' && typeof op.node === 'string' && op.node.startsWith(EDGE_PROP_PREFIX)) {
      return SCHEMA_V3;
    }
  }
  return SCHEMA_V2;
}

// -----------------------------------------------------------------------------
// Schema Compatibility Validation
// -----------------------------------------------------------------------------

/**
 * Asserts that a set of decoded patch operations is compatible with a given
 * maximum supported schema version. Throws {@link SchemaUnsupportedError} if
 * any operation requires a higher schema version than `maxSchema`.
 *
 * Currently the only schema boundary is v2 -> v3:
 * - Schema v3 introduces edge property PropSet ops (node starts with `\x01`).
 * - A v2-only reader MUST reject patches containing such ops to prevent
 *   silent data loss.
 * - A v3 patch that contains only classic node/edge ops is accepted by v2
 *   readers — the schema number alone is NOT a rejection criterion.
 *
 * @param {Array<{type: string, node?: string}>} ops - Decoded patch operations
 * @param {number} maxSchema - Maximum schema version the reader supports
 * @throws {SchemaUnsupportedError} If ops require a schema version > maxSchema
 *
 * @example
 * import { assertOpsCompatible, SCHEMA_V2 } from './MessageSchemaDetector.js';
 * assertOpsCompatible(patch.ops, SCHEMA_V2); // throws if edge prop ops found
 */
export function assertOpsCompatible(ops, maxSchema) {
  if (maxSchema >= SCHEMA_V3) {
    return; // v3 readers understand everything up to v3
  }
  // For v2 readers: scan for edge property ops (the v3 feature)
  if (!Array.isArray(ops)) {
    return;
  }
  for (const op of ops) {
    if (
      op.type === 'PropSet' &&
      typeof op.node === 'string' &&
      op.node.startsWith(EDGE_PROP_PREFIX)
    ) {
      throw new SchemaUnsupportedError(
        'Upgrade to >=7.3.0 (WEIGHTED) to sync edge properties.',
        {
          context: {
            requiredSchema: SCHEMA_V3,
            maxSupportedSchema: maxSchema,
          },
        }
      );
    }
  }
}

// -----------------------------------------------------------------------------
// Detection Helper
// -----------------------------------------------------------------------------

/**
 * Detects the WARP message kind from a raw commit message.
 *
 * @param {string} message - The raw commit message
 * @returns {'patch'|'checkpoint'|'anchor'|'audit'|null} The message kind, or null if not a WARP message
 *
 * @example
 * const kind = detectMessageKind(message);
 * if (kind === 'patch') {
 *   const data = decodePatchMessage(message);
 * }
 */
export function detectMessageKind(message) {
  if (typeof message !== 'string') {
    return null;
  }

  try {
    const codec = getCodec();
    const decoded = codec.decode(message);
    const kind = decoded.trailers[TRAILER_KEYS.kind];

    if (kind === 'patch' || kind === 'checkpoint' || kind === 'anchor' || kind === 'audit') {
      return kind;
    }
    return null;
  } catch {
    // Not a valid message format
    return null;
  }
}
