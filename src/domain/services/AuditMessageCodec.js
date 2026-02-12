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

// -----------------------------------------------------------------------------
// Encoder
// -----------------------------------------------------------------------------

/**
 * Encodes an audit commit message with trailers.
 *
 * @param {Object} options
 * @param {string} options.graph - The graph name
 * @param {string} options.writer - The writer ID
 * @param {string} options.dataCommit - The OID of the data commit being audited
 * @param {string} options.opsDigest - SHA-256 hex digest of the canonical ops JSON
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

  // Validate kind discriminator
  const kind = trailers[TRAILER_KEYS.kind];
  if (kind !== 'audit') {
    throw new Error(`Invalid audit message: eg-kind must be 'audit', got '${kind}'`);
  }

  // Extract and validate required fields
  const graph = trailers[TRAILER_KEYS.graph];
  if (!graph) {
    throw new Error('Invalid audit message: missing required trailer eg-graph');
  }
  validateGraphName(graph);

  const writer = trailers[TRAILER_KEYS.writer];
  if (!writer) {
    throw new Error('Invalid audit message: missing required trailer eg-writer');
  }
  validateWriterId(writer);

  const dataCommit = trailers[TRAILER_KEYS.dataCommit];
  if (!dataCommit) {
    throw new Error('Invalid audit message: missing required trailer eg-data-commit');
  }
  validateOid(dataCommit, 'dataCommit');

  const opsDigest = trailers[TRAILER_KEYS.opsDigest];
  if (!opsDigest) {
    throw new Error('Invalid audit message: missing required trailer eg-ops-digest');
  }
  validateSha256(opsDigest, 'opsDigest');

  const schemaStr = trailers[TRAILER_KEYS.schema];
  if (!schemaStr) {
    throw new Error('Invalid audit message: missing required trailer eg-schema');
  }
  if (!/^\d+$/.test(schemaStr)) {
    throw new Error(
      `Invalid audit message: eg-schema must be a positive integer, got '${schemaStr}'`,
    );
  }
  const schema = Number(schemaStr);
  if (!Number.isInteger(schema) || schema < 1) {
    throw new Error(`Invalid audit message: eg-schema must be a positive integer, got '${schemaStr}'`);
  }
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
