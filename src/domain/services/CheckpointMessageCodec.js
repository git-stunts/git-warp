/**
 * Checkpoint message encoding and decoding for WARP commit messages.
 *
 * Handles the 'checkpoint' message type which contains a snapshot of
 * materialized graph state. See {@link module:domain/services/WarpMessageCodec}
 * for the facade that re-exports all codec functions.
 *
 * **Schema namespace note:** Checkpoint schema versions (2, 3, 4) are
 * distinct from patch schema versions (PATCH_SCHEMA_V2, PATCH_SCHEMA_V3).
 * See {@link module:domain/services/CheckpointService} for named constants
 * `CHECKPOINT_SCHEMA_STANDARD` and `CHECKPOINT_SCHEMA_INDEX_TREE`.
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
import {
  requireTrailer,
  parsePositiveIntTrailer,
  validateKindDiscriminator,
} from './TrailerValidation.js';

// -----------------------------------------------------------------------------
// Encoder
// -----------------------------------------------------------------------------

/**
 * Encodes a checkpoint commit message.
 *
 * @param {{ graph: string, stateHash: string, frontierOid: string, indexOid: string, schema?: number }} options - The checkpoint message options
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

  /** @type {{ encode(msg: {title: string, trailers: Record<string, string>}): string }} */
  const codec = /** @type {*} */ (getCodec());
  const tk = /** @type {{kind: string, graph: string, stateHash: string, frontierOid: string, indexOid: string, schema: string, checkpointVersion: string}} */ (TRAILER_KEYS);
  const mt = /** @type {{checkpoint: string}} */ (MESSAGE_TITLES);
  /** @type {Record<string, string>} */
  const trailers = {
    [tk.kind]: 'checkpoint',
    [tk.graph]: graph,
    [tk.stateHash]: stateHash,
    [tk.frontierOid]: frontierOid,
    [tk.indexOid]: indexOid,
    [tk.schema]: String(schema),
  };

  // Add checkpoint version marker for V5 format (schema:2, schema:3, schema:4)
  if (schema === 2 || schema === 3 || schema === 4) {
    trailers[tk.checkpointVersion] = 'v5';
  }

  return codec.encode({
    title: mt.checkpoint,
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
 * @returns {{ kind: 'checkpoint', graph: string, stateHash: string, frontierOid: string, indexOid: string, schema: number, checkpointVersion: string|null }} The decoded checkpoint message
 * @throws {Error} If the message is not a valid checkpoint message
 *
 * @example
 * const { kind, graph, stateHash, frontierOid, indexOid, schema } = decodeCheckpointMessage(message);
 */
export function decodeCheckpointMessage(message) {
  /** @type {{ decode(msg: string): { trailers: Record<string, string> } }} */
  const codec = /** @type {*} */ (getCodec());
  const decoded = codec.decode(message);
  const { trailers } = decoded;

  validateKindDiscriminator(trailers, 'checkpoint');
  const graph = requireTrailer(trailers, 'graph', 'checkpoint');
  validateGraphName(graph);
  const stateHash = requireTrailer(trailers, 'stateHash', 'checkpoint');
  validateSha256(stateHash, 'stateHash');
  const frontierOid = requireTrailer(trailers, 'frontierOid', 'checkpoint');
  validateOid(frontierOid, 'frontierOid');
  const indexOid = requireTrailer(trailers, 'indexOid', 'checkpoint');
  validateOid(indexOid, 'indexOid');
  const schema = parsePositiveIntTrailer(trailers, 'schema', 'checkpoint');

  // Extract optional checkpoint version (v5 for schema:2/3/4)
  const cpvKey = /** @type {{checkpointVersion: string}} */ (TRAILER_KEYS).checkpointVersion;
  const checkpointVersion = trailers[cpvKey] || null;

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
