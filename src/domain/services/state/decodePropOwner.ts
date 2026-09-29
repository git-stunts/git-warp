/**
 * Reads the owning element out of an encoded property key.
 *
 * @module domain/services/state/decodePropOwner
 */

import EdgePropertyOwner from './EdgePropertyOwner.ts';
import NodePropertyOwner from './NodePropertyOwner.ts';
import { tryDecodeEdgePropKey, decodePropKey, encodeEdgeKey, encodeEdgePropKey, encodePropKey, isEdgePropKey } from '../KeyCodec.ts';

/**
 * Decodes an encoded prop key to the element whose liveness governs it, or
 * null when the key cannot be read.
 *
 * Two ways a key resists decoding, both of which yield null and so retain it.
 *
 * `\0` separates fields, so a key whose element id itself contains `\0`
 * decodes to a shorter, different id. Read paths already resolve such a key
 * to no owner and hide it; a sweep that trusted the same decode would instead
 * delete a live element's registers, so the decode must round-trip.
 *
 * A key with the wrong field count makes `tryDecodeEdgePropKey` return null.
 * Full-state deserialization accepts prop-map keys without validating their
 * shape, so one malformed key would otherwise abort the whole sweep and,
 * through it, GC. Sweeping is an optimization; a key it cannot read is one it
 * leaves alone.
 */
export default function decodePropOwner(encodedKey: string): NodePropertyOwner | EdgePropertyOwner | null {
  if (isEdgePropKey(encodedKey)) {
    const edge = tryDecodeEdgePropKey(encodedKey);
    if (edge === null || encodeEdgePropKey(edge.from, edge.to, edge.label, edge.propKey) !== encodedKey) {
      return null;
    }
    return new EdgePropertyOwner(encodeEdgeKey(edge.from, edge.to, edge.label));
  }
  const node = decodePropKey(encodedKey);
  if (encodePropKey(node.nodeId, node.propKey) !== encodedKey) {
    return null;
  }
  return new NodePropertyOwner(node.nodeId);
}
