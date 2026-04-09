/**
 * Audit message encoding and decoding for WARP audit commit messages.
 *
 * Handles the 'audit' message type which records the outcome of materializing
 * a data commit. See {@link module:domain/services/WarpMessageCodec} for the
 * facade that re-exports all codec functions.
 *
 * @module domain/services/codec/AuditMessageCodec
 */

import { validateGraphName, validateWriterId } from '../../utils/RefLayout.ts';
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
import MessageCodecError from '../../errors/MessageCodecError.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';

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

  const codec = /** @type {{ encode(msg: {title: string, trailers: Record<string, string>}): string }} */ (/** @type {unknown} */ (getCodec()));
  const tk = /** @type {{dataCommit: string, graph: string, kind: string, opsDigest: string, schema: string, writer: string}} */ (TRAILER_KEYS);
  const mt = /** @type {{audit: string}} */ (MESSAGE_TITLES);
  return codec.encode({
    title: mt.audit,
    trailers: {
      [tk.dataCommit]: dataCommit,
      [tk.graph]: graph,
      [tk.kind]: 'audit',
      [tk.opsDigest]: opsDigest,
      [tk.schema]: '1',
      [tk.writer]: writer,
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
  const codec = /** @type {{ decode(msg: string): { trailers: Record<string, string> } }} */ (/** @type {unknown} */ (getCodec()));
  const decoded = codec.decode(message);
  const { trailers } = decoded;

  // Check for duplicate trailers (strict decode)
  const keys = Object.keys(trailers);
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new MessageCodecError(
        `Duplicate trailer rejected: ${key}`,
        { code: 'E_AUDIT_DUPLICATE_TRAILER', context: { key } },
      );
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
    throw new SchemaUnsupportedError(
      `Unsupported audit schema version: ${schema}`,
      { context: { schema } },
    );
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
