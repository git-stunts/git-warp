/**
 * Key encoding/decoding for WARP graph CRDT state maps.
 *
 * Single source of truth for encoding composite keys (edges, properties,
 * edge properties) used as Map keys in WarpState. Uses null character
 * (\0) as field separator and \x01 prefix for edge property keys.
 *
 * @module domain/services/KeyCodec
 */

import WarpError from '../errors/WarpError.ts';

export {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from '../graph/LegacyContentPropertyKeys.ts';

/** Field separator used in all encoded keys. */
export const FIELD_SEPARATOR = '\0';

/**
 * Prefix byte for edge property keys. Guarantees no collision with node
 * property keys (which start with a node-ID character, never \x01).
 */
export const EDGE_PROP_PREFIX = '\x01';

/**
 * Reserved node ID prefix for substrate-internal effect entities.
 * Observers match this prefix to discover effect nodes.
 */
export const EFFECT_NODE_PREFIX = '@warp/effect:';

/**
 * Encodes an edge key to a string for Map storage.
 *
 * @param from - Source node ID
 * @param to - Target node ID
 * @param label - Edge label/type
 * @returns Encoded edge key in format "from\0to\0label"
 * @see decodeEdgeKey - The inverse operation
 */
export function encodeEdgeKey(from: string, to: string, label: string): string {
  return `${from}\0${to}\0${label}`;
}

/**
 * Decodes an edge key string back to its component parts.
 *
 * @param key - Encoded edge key in format "from\0to\0label"
 * @returns Decoded edge components
 * @see encodeEdgeKey - The inverse operation
 */
export function decodeEdgeKey(key: string): { from: string; to: string; label: string } {
  const parts = key.split('\0');
  return { from: parts[0] ?? '', to: parts[1] ?? '', label: parts[2] ?? '' };
}

/**
 * Encodes a node property key for Map storage.
 *
 * @param nodeId - The ID of the node owning the property
 * @param propKey - The property name/key
 * @returns Encoded property key in format "nodeId\0propKey"
 * @see decodePropKey - The inverse operation
 */
export function encodePropKey(nodeId: string, propKey: string): string {
  return `${nodeId}\0${propKey}`;
}

/**
 * Decodes a node property key string back to its component parts.
 *
 * @param key - Encoded property key in format "nodeId\0propKey"
 * @returns Decoded property components
 * @see encodePropKey - The inverse operation
 */
export function decodePropKey(key: string): { nodeId: string; propKey: string } {
  const parts = key.split('\0');
  return { nodeId: parts[0] ?? '', propKey: parts[1] ?? '' };
}

/**
 * Encodes an edge property key for Map storage.
 *
 * Format: `\x01from\0to\0label\0propKey`
 *
 * The \x01 prefix guarantees collision-freedom with node property keys.
 *
 * @param from - Source node ID
 * @param to - Target node ID
 * @param label - Edge label
 * @param propKey - Property name
 * @returns Encoded edge property key
 */
export function encodeEdgePropKey(from: string, to: string, label: string, propKey: string): string {
  return `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}\0${propKey}`;
}

// -------------------------------------------------------------------------
// Legacy edge-property node encoding (raw PropSet ↔ canonical EdgePropSet)
// -------------------------------------------------------------------------

/**
 * Encodes edge identity as the legacy `node` field value for raw PropSet ops.
 *
 * Format: `\x01from\0to\0label`
 *
 * @param from - Source node ID
 * @param to - Target node ID
 * @param label - Edge label
 * @returns Encoded legacy edge property node
 */
export function encodeLegacyEdgePropNode(from: string, to: string, label: string): string {
  return `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}`;
}

/**
 * Returns true if a raw PropSet `node` field encodes an edge identity.
 * @param node - The `node` field from a raw PropSet op
 * @returns True if this is a legacy edge property node encoding
 */
export function isLegacyEdgePropNode(node: string): boolean {
  return typeof node === 'string' && node.length > 0 && node[0] === EDGE_PROP_PREFIX;
}

/**
 * Decodes a legacy edge-property `node` field back to its components.
 * @param node - The `node` field (must start with \x01)
 * @returns Decoded edge components
 * @throws {WarpError} If the node field is not a valid legacy edge-property encoding
 */
export function decodeLegacyEdgePropNode(node: string): { from: string; to: string; label: string } {
  if (!isLegacyEdgePropNode(node)) {
    throw new WarpError(
      'Invalid legacy edge-property node: missing \\x01 prefix',
      'E_KEYCODEC_LEGACY_NO_PREFIX',
    );
  }
  const parts = node.slice(1).split('\0');
  if (parts.length !== 3) {
    throw new WarpError(
      `Invalid legacy edge-property node: expected 3 segments, got ${parts.length}`,
      'E_KEYCODEC_LEGACY_BAD_SEGMENTS',
      { context: { got: parts.length } },
    );
  }
  const [from, to, label] = parts;
  if (from === undefined || from.length === 0 || to === undefined || to.length === 0 || label === undefined || label.length === 0) {
    throw new WarpError(
      'Invalid legacy edge-property node: empty segment in decoded parts',
      'E_KEYCODEC_LEGACY_EMPTY_SEGMENT',
    );
  }
  return { from, to, label };
}

/**
 * Returns true if the encoded key is an edge property key.
 * @param key - Encoded property key
 * @returns True if this is an edge property key
 */
export function isEdgePropKey(key: string): boolean {
  return key[0] === EDGE_PROP_PREFIX;
}

/**
 * Decodes an edge property key string.
 * @param encoded - Encoded edge property key (must start with \x01)
 * @returns Decoded edge property components
 * @throws {WarpError} If the encoded key is missing the edge property prefix
 * @throws {WarpError} If the encoded key does not contain exactly 4 segments
 */
export function decodeEdgePropKey(encoded: string): { from: string; to: string; label: string; propKey: string } {
  if (!isEdgePropKey(encoded)) {
    throw new WarpError(
      'Invalid edge property key: missing prefix',
      'E_KEYCODEC_EDGE_PROP_NO_PREFIX',
    );
  }
  const parts = encoded.slice(1).split('\0');
  if (parts.length !== 4) {
    throw new WarpError(
      'Invalid edge property key: expected 4 segments',
      'E_KEYCODEC_EDGE_PROP_BAD_SEGMENTS',
      { context: { got: parts.length } },
    );
  }
  return { from: parts[0] ?? '', to: parts[1] ?? '', label: parts[2] ?? '', propKey: parts[3] ?? '' };
}
