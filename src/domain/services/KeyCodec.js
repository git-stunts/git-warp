/**
 * Key encoding/decoding for WARP graph CRDT state maps.
 *
 * Single source of truth for encoding composite keys (edges, properties,
 * edge properties) used as Map keys in WarpStateV5. Uses null character
 * (\0) as field separator and \x01 prefix for edge property keys.
 *
 * @module domain/services/KeyCodec
 */

/** Field separator used in all encoded keys. */
export const FIELD_SEPARATOR = '\0';

/**
 * Prefix byte for edge property keys. Guarantees no collision with node
 * property keys (which start with a node-ID character, never \x01).
 * @const {string}
 */
export const EDGE_PROP_PREFIX = '\x01';

/**
 * Well-known property key for content attachment.
 * Stores a content-addressed blob OID as the property value.
 * @const {string}
 */
export const CONTENT_PROPERTY_KEY = '_content';

/**
 * Encodes an edge key to a string for Map storage.
 *
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label/type
 * @returns {string} Encoded edge key in format "from\0to\0label"
 * @see decodeEdgeKey - The inverse operation
 */
export function encodeEdgeKey(from, to, label) {
  return `${from}\0${to}\0${label}`;
}

/**
 * Decodes an edge key string back to its component parts.
 *
 * @param {string} key - Encoded edge key in format "from\0to\0label"
 * @returns {{from: string, to: string, label: string}}
 * @see encodeEdgeKey - The inverse operation
 */
export function decodeEdgeKey(key) {
  const [from, to, label] = key.split('\0');
  return { from, to, label };
}

/**
 * Encodes a node property key for Map storage.
 *
 * @param {string} nodeId - The ID of the node owning the property
 * @param {string} propKey - The property name/key
 * @returns {string} Encoded property key in format "nodeId\0propKey"
 * @see decodePropKey - The inverse operation
 */
export function encodePropKey(nodeId, propKey) {
  return `${nodeId}\0${propKey}`;
}

/**
 * Decodes a node property key string back to its component parts.
 *
 * @param {string} key - Encoded property key in format "nodeId\0propKey"
 * @returns {{nodeId: string, propKey: string}}
 * @see encodePropKey - The inverse operation
 */
export function decodePropKey(key) {
  const [nodeId, propKey] = key.split('\0');
  return { nodeId, propKey };
}

/**
 * Encodes an edge property key for Map storage.
 *
 * Format: `\x01from\0to\0label\0propKey`
 *
 * The \x01 prefix guarantees collision-freedom with node property keys.
 *
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {string} label - Edge label
 * @param {string} propKey - Property name
 * @returns {string}
 */
export function encodeEdgePropKey(from, to, label, propKey) {
  return `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}\0${propKey}`;
}

/**
 * Returns true if the encoded key is an edge property key.
 * @param {string} key - Encoded property key
 * @returns {boolean}
 */
export function isEdgePropKey(key) {
  return key[0] === EDGE_PROP_PREFIX;
}

/**
 * Decodes an edge property key string.
 * @param {string} encoded - Encoded edge property key (must start with \x01)
 * @returns {{from: string, to: string, label: string, propKey: string}}
 * @throws {Error} If the encoded key is missing the edge property prefix
 * @throws {Error} If the encoded key does not contain exactly 4 segments
 */
export function decodeEdgePropKey(encoded) {
  if (!isEdgePropKey(encoded)) {
    throw new Error('Invalid edge property key: missing prefix');
  }
  const parts = encoded.slice(1).split('\0');
  if (parts.length !== 4) {
    throw new Error('Invalid edge property key: expected 4 segments');
  }
  const [from, to, label, propKey] = parts;
  return { from, to, label, propKey };
}
