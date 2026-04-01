/**
 * Anchor message encoding and decoding for WARP commit messages.
 *
 * Handles the 'anchor' message type which marks a merge point in the WARP
 * DAG. See {@link module:domain/services/WarpMessageCodec} for the facade
 * that re-exports all codec functions.
 *
 * @module domain/services/AnchorMessageCodec
 */

import { validateGraphName } from '../utils/RefLayout.js';
import {
  getCodec,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  validateSchema,
} from './MessageCodecInternal.js';
import {
  requireTrailer,
  parsePositiveIntTrailer,
  validateKindDiscriminator,
} from './TrailerValidation.js';

// -----------------------------------------------------------------------------
// Encoder
// -----------------------------------------------------------------------------

/**
 * Encodes an anchor commit message.
 *
 * @param {{ graph: string, schema?: number }} options - The anchor message options
 * @returns {string} The encoded commit message
 * @throws {Error} If any validation fails
 *
 * @example
 * const message = encodeAnchorMessage({ graph: 'events' });
 */
export function encodeAnchorMessage({ graph, schema = 2 }) {
  // Validate inputs
  validateGraphName(graph);
  validateSchema(schema);

  const codec = /** @type {{ encode(msg: {title: string, trailers: Record<string, string>}): string }} */ (/** @type {unknown} */ (getCodec()));
  const tk = /** @type {{kind: string, graph: string, schema: string}} */ (TRAILER_KEYS);
  const mt = /** @type {{anchor: string}} */ (MESSAGE_TITLES);
  return codec.encode({
    title: mt.anchor,
    trailers: {
      [tk.kind]: 'anchor',
      [tk.graph]: graph,
      [tk.schema]: String(schema),
    },
  });
}

// -----------------------------------------------------------------------------
// Decoder
// -----------------------------------------------------------------------------

/**
 * Decodes an anchor commit message.
 *
 * @param {string} message - The raw commit message
 * @returns {{ kind: 'anchor', graph: string, schema: number }} The decoded anchor message
 * @throws {Error} If the message is not a valid anchor message
 *
 * @example
 * const { kind, graph, schema } = decodeAnchorMessage(message);
 */
export function decodeAnchorMessage(message) {
  const codec = /** @type {{ decode(msg: string): { trailers: Record<string, string> } }} */ (/** @type {unknown} */ (getCodec()));
  const decoded = codec.decode(message);
  const { trailers } = decoded;

  validateKindDiscriminator(trailers, 'anchor');
  const graph = requireTrailer(trailers, 'graph', 'anchor');
  const schema = parsePositiveIntTrailer(trailers, 'schema', 'anchor');

  return {
    kind: 'anchor',
    graph,
    schema,
  };
}
