/**
 * Patch message encoding and decoding for WARP commit messages.
 *
 * Handles the 'patch' message type which contains graph mutations from a
 * single writer. See {@link module:domain/services/WarpMessageCodec} for the
 * facade that re-exports all codec functions.
 *
 * @module domain/services/PatchMessageCodec
 */

import { validateGraphName, validateWriterId } from '../utils/RefLayout.js';
import {
  getCodec,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  validateOid,
  validatePositiveInteger,
  validateSchema,
} from './MessageCodecInternal.js';

// -----------------------------------------------------------------------------
// Encoder
// -----------------------------------------------------------------------------

/**
 * Encodes a patch commit message.
 *
 * @param {Object} options - The patch message options
 * @param {string} options.graph - The graph name
 * @param {string} options.writer - The writer ID
 * @param {number} options.lamport - The Lamport timestamp (must be a positive integer)
 * @param {string} options.patchOid - The OID of the patch blob
 * @param {number} [options.schema=2] - The schema version (defaults to 2 for new messages)
 * @returns {string} The encoded commit message
 * @throws {Error} If any validation fails
 *
 * @example
 * const message = encodePatchMessage({
 *   graph: 'events',
 *   writer: 'node-1',
 *   lamport: 42,
 *   patchOid: 'abc123...' // 40-char hex
 * });
 */
export function encodePatchMessage({ graph, writer, lamport, patchOid, schema = 2 }) {
  // Validate inputs
  validateGraphName(graph);
  validateWriterId(writer);
  validatePositiveInteger(lamport, 'lamport');
  validateOid(patchOid, 'patchOid');
  validateSchema(schema);

  const codec = getCodec();
  return codec.encode({
    title: MESSAGE_TITLES.patch,
    trailers: {
      [TRAILER_KEYS.kind]: 'patch',
      [TRAILER_KEYS.graph]: graph,
      [TRAILER_KEYS.writer]: writer,
      [TRAILER_KEYS.lamport]: String(lamport),
      [TRAILER_KEYS.patchOid]: patchOid,
      [TRAILER_KEYS.schema]: String(schema),
    },
  });
}

// -----------------------------------------------------------------------------
// Decoder
// -----------------------------------------------------------------------------

/**
 * Decodes a patch commit message.
 *
 * @param {string} message - The raw commit message
 * @returns {Object} The decoded patch message
 * @returns {string} return.kind - Always 'patch'
 * @returns {string} return.graph - The graph name
 * @returns {string} return.writer - The writer ID
 * @returns {number} return.lamport - The Lamport timestamp
 * @returns {string} return.patchOid - The patch blob OID
 * @returns {number} return.schema - The schema version
 * @throws {Error} If the message is not a valid patch message
 *
 * @example
 * const { kind, graph, writer, lamport, patchOid, schema } = decodePatchMessage(message);
 */
export function decodePatchMessage(message) {
  const codec = getCodec();
  const decoded = codec.decode(message);
  const { trailers } = decoded;

  // Validate kind discriminator
  const kind = trailers[TRAILER_KEYS.kind];
  if (kind !== 'patch') {
    throw new Error(`Invalid patch message: eg-kind must be 'patch', got '${kind}'`);
  }

  // Extract and validate required fields
  const graph = trailers[TRAILER_KEYS.graph];
  if (!graph) {
    throw new Error('Invalid patch message: missing required trailer eg-graph');
  }

  const writer = trailers[TRAILER_KEYS.writer];
  if (!writer) {
    throw new Error('Invalid patch message: missing required trailer eg-writer');
  }

  const lamportStr = trailers[TRAILER_KEYS.lamport];
  if (!lamportStr) {
    throw new Error('Invalid patch message: missing required trailer eg-lamport');
  }
  const lamport = parseInt(lamportStr, 10);
  if (!Number.isInteger(lamport) || lamport < 1) {
    throw new Error(`Invalid patch message: eg-lamport must be a positive integer, got '${lamportStr}'`);
  }

  const patchOid = trailers[TRAILER_KEYS.patchOid];
  if (!patchOid) {
    throw new Error('Invalid patch message: missing required trailer eg-patch-oid');
  }

  const schemaStr = trailers[TRAILER_KEYS.schema];
  if (!schemaStr) {
    throw new Error('Invalid patch message: missing required trailer eg-schema');
  }
  const schema = parseInt(schemaStr, 10);
  if (!Number.isInteger(schema) || schema < 1) {
    throw new Error(`Invalid patch message: eg-schema must be a positive integer, got '${schemaStr}'`);
  }

  return {
    kind: 'patch',
    graph,
    writer,
    lamport,
    patchOid,
    schema,
  };
}
