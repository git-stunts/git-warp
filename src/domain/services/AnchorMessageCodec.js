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

// -----------------------------------------------------------------------------
// Encoder
// -----------------------------------------------------------------------------

/**
 * Encodes an anchor commit message.
 *
 * @param {Object} options - The anchor message options
 * @param {string} options.graph - The graph name
 * @param {number} [options.schema=2] - The schema version (defaults to 2 for new messages)
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

  const codec = getCodec();
  return codec.encode({
    title: MESSAGE_TITLES.anchor,
    trailers: {
      [TRAILER_KEYS.kind]: 'anchor',
      [TRAILER_KEYS.graph]: graph,
      [TRAILER_KEYS.schema]: String(schema),
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
 * @returns {Object} The decoded anchor message
 * @returns {string} return.kind - Always 'anchor'
 * @returns {string} return.graph - The graph name
 * @returns {number} return.schema - The schema version
 * @throws {Error} If the message is not a valid anchor message
 *
 * @example
 * const { kind, graph, schema } = decodeAnchorMessage(message);
 */
export function decodeAnchorMessage(message) {
  const codec = getCodec();
  const decoded = codec.decode(message);
  const { trailers } = decoded;

  // Validate kind discriminator
  const kind = trailers[TRAILER_KEYS.kind];
  if (kind !== 'anchor') {
    throw new Error(`Invalid anchor message: eg-kind must be 'anchor', got '${kind}'`);
  }

  // Extract and validate required fields
  const graph = trailers[TRAILER_KEYS.graph];
  if (!graph) {
    throw new Error('Invalid anchor message: missing required trailer eg-graph');
  }

  const schemaStr = trailers[TRAILER_KEYS.schema];
  if (!schemaStr) {
    throw new Error('Invalid anchor message: missing required trailer eg-schema');
  }
  const schema = parseInt(schemaStr, 10);
  if (!Number.isInteger(schema) || schema < 1) {
    throw new Error(`Invalid anchor message: eg-schema must be a positive integer, got '${schemaStr}'`);
  }

  return {
    kind: 'anchor',
    graph,
    schema,
  };
}
