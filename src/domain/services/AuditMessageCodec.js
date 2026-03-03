/**
 * Audit message encoding and decoding for WARP audit commit messages.
 *
 * Handles the 'audit' message type which records the outcome of materializing
 * a data commit. See {@link module:domain/services/WarpMessageCodec} for the
 * facade that re-exports all codec functions.
 *
 * @module domain/services/AuditMessageCodec
 */

import { validateGraphName, validateWriterId } from '../utils/RefLayout.js';
import {
  getCodec,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  validateOid,
  validateSha256,
} from './MessageCodecInternal.js';
import {
  parsePositiveIntTrailer,
  requireTrailer,
  validateKindDiscriminator,
} from './TrailerValidation.js';

// -----------------------------------------------------------------------------
// Encoder
// -----------------------------------------------------------------------------

/**
 * Encodes an audit commit message with trailers.
 *
 * @param {{ graph: string, writer: string, dataCommit: string, opsDigest: string }} options
 * @returns {string} The encoded commit message
 * @throws {Error} If any validation fails
 */
export function encodeAuditMessage({ graph, writer, dataCommit, opsDigest }) {
  validateGraphName(graph);
  validateWriterId(writer);
  validateOid(dataCommit, 'dataCommit');
  validateSha256(opsDigest, 'opsDigest');

  const codec = getCodec();
  return codec.encode({
    title: MESSAGE_TITLES.audit,
    trailers: {
      [TRAILER_KEYS.dataCommit]: dataCommit,
      [TRAILER_KEYS.graph]: graph,
      [TRAILER_KEYS.kind]: 'audit',
      [TRAILER_KEYS.opsDigest]: opsDigest,
      [TRAILER_KEYS.schema]: '1',
      [TRAILER_KEYS.writer]: writer,
    },
  });
}

// -----------------------------------------------------------------------------
// Decoder
// -----------------------------------------------------------------------------

/**
 * Decodes an audit commit message.
 *
 * @param {string} message - The raw commit message
 * @returns {{ kind: 'audit', graph: string, writer: string, dataCommit: string, opsDigest: string, schema: number }}
 * @throws {Error} If the message is not a valid audit message
 */
export function decodeAuditMessage(message) {
  const codec = getCodec();
  const decoded = codec.decode(message);
  const { trailers } = decoded;

  // Check for duplicate trailers (strict decode)
  const keys = Object.keys(trailers);
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new Error(`Duplicate trailer rejected: ${key}`);
    }
    seen.add(key);
  }

  validateKindDiscriminator(trailers, 'audit');

  // Extract and validate required fields
  const graph = requireTrailer(trailers, 'graph', 'audit');
  validateGraphName(graph);

  const writer = requireTrailer(trailers, 'writer', 'audit');
  validateWriterId(writer);

  const dataCommit = requireTrailer(trailers, 'dataCommit', 'audit');
  validateOid(dataCommit, 'dataCommit');

  const opsDigest = requireTrailer(trailers, 'opsDigest', 'audit');
  validateSha256(opsDigest, 'opsDigest');

  const schema = parsePositiveIntTrailer(trailers, 'schema', 'audit');
  if (schema > 1) {
    throw new Error(`Unsupported audit schema version: ${schema}`);
  }

  return {
    kind: 'audit',
    graph,
    writer,
    dataCommit,
    opsDigest,
    schema,
  };
}
