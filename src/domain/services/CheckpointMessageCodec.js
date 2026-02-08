/**
 * Checkpoint message encoding and decoding for WARP commit messages.
 *
 * Handles the 'checkpoint' message type which contains a snapshot of
 * materialized graph state. See {@link module:domain/services/WarpMessageCodec}
 * for the facade that re-exports all codec functions.
 *
 * @module domain/services/CheckpointMessageCodec
 */

import { validateGraphName } from '../utils/RefLayout.js';
import {
  getCodec,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  validateOid,
  validateSha256,
  validateSchema,
} from './MessageCodecInternal.js';

// -----------------------------------------------------------------------------
// Encoder
// -----------------------------------------------------------------------------

/**
 * Encodes a checkpoint commit message.
 *
 * @param {Object} options - The checkpoint message options
 * @param {string} options.graph - The graph name
 * @param {string} options.stateHash - The SHA-256 hash of the materialized state
 * @param {string} options.frontierOid - The OID of the frontier blob
 * @param {string} options.indexOid - The OID of the index tree
 * @param {number} [options.schema=2] - The schema version (defaults to 2 for new messages)
 * @returns {string} The encoded commit message
 * @throws {Error} If any validation fails
 *
 * @example
 * const message = encodeCheckpointMessage({
 *   graph: 'events',
 *   stateHash: 'abc123...' // 64-char hex
 *   frontierOid: 'def456...' // 40-char hex
 *   indexOid: 'ghi789...' // 40-char hex
 * });
 */
export function encodeCheckpointMessage({ graph, stateHash, frontierOid, indexOid, schema = 2 }) {
  // Validate inputs
  validateGraphName(graph);
  validateSha256(stateHash, 'stateHash');
  validateOid(frontierOid, 'frontierOid');
  validateOid(indexOid, 'indexOid');
  validateSchema(schema);

  const codec = getCodec();
  const trailers = {
    [TRAILER_KEYS.kind]: 'checkpoint',
    [TRAILER_KEYS.graph]: graph,
    [TRAILER_KEYS.stateHash]: stateHash,
    [TRAILER_KEYS.frontierOid]: frontierOid,
    [TRAILER_KEYS.indexOid]: indexOid,
    [TRAILER_KEYS.schema]: String(schema),
  };

  // Add checkpoint version marker for V5 format (schema:2 and schema:3)
  if (schema === 2 || schema === 3) {
    trailers[TRAILER_KEYS.checkpointVersion] = 'v5';
  }

  return codec.encode({
    title: MESSAGE_TITLES.checkpoint,
    trailers,
  });
}

// -----------------------------------------------------------------------------
// Decoder
// -----------------------------------------------------------------------------

/**
 * Decodes a checkpoint commit message.
 *
 * @param {string} message - The raw commit message
 * @returns {Object} The decoded checkpoint message
 * @returns {string} return.kind - Always 'checkpoint'
 * @returns {string} return.graph - The graph name
 * @returns {string} return.stateHash - The SHA-256 state hash
 * @returns {string} return.frontierOid - The frontier blob OID
 * @returns {string} return.indexOid - The index tree OID
 * @returns {number} return.schema - The schema version
 * @throws {Error} If the message is not a valid checkpoint message
 *
 * @example
 * const { kind, graph, stateHash, frontierOid, indexOid, schema } = decodeCheckpointMessage(message);
 */
export function decodeCheckpointMessage(message) {
  const codec = getCodec();
  const decoded = codec.decode(message);
  const { trailers } = decoded;

  // Validate kind discriminator
  const kind = trailers[TRAILER_KEYS.kind];
  if (kind !== 'checkpoint') {
    throw new Error(`Invalid checkpoint message: eg-kind must be 'checkpoint', got '${kind}'`);
  }

  // Extract and validate required fields
  const graph = trailers[TRAILER_KEYS.graph];
  if (!graph) {
    throw new Error('Invalid checkpoint message: missing required trailer eg-graph');
  }

  const stateHash = trailers[TRAILER_KEYS.stateHash];
  if (!stateHash) {
    throw new Error('Invalid checkpoint message: missing required trailer eg-state-hash');
  }

  const frontierOid = trailers[TRAILER_KEYS.frontierOid];
  if (!frontierOid) {
    throw new Error('Invalid checkpoint message: missing required trailer eg-frontier-oid');
  }

  const indexOid = trailers[TRAILER_KEYS.indexOid];
  if (!indexOid) {
    throw new Error('Invalid checkpoint message: missing required trailer eg-index-oid');
  }

  const schemaStr = trailers[TRAILER_KEYS.schema];
  if (!schemaStr) {
    throw new Error('Invalid checkpoint message: missing required trailer eg-schema');
  }
  const schema = parseInt(schemaStr, 10);
  if (!Number.isInteger(schema) || schema < 1) {
    throw new Error(`Invalid checkpoint message: eg-schema must be a positive integer, got '${schemaStr}'`);
  }

  // Extract optional checkpoint version (v5 for schema:2)
  const checkpointVersion = trailers[TRAILER_KEYS.checkpointVersion] || null;

  return {
    kind: 'checkpoint',
    graph,
    stateHash,
    frontierOid,
    indexOid,
    schema,
    checkpointVersion,
  };
}
