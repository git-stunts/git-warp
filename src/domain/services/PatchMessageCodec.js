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
import {
  requireTrailer,
  parsePositiveIntTrailer,
  validateKindDiscriminator,
} from './TrailerValidation.js';

/**
 * @typedef {{ encode: (msg: {title: string, trailers: Record<string, string>}) => string, decode: (msg: string) => {title: string, trailers: Record<string, string>} }} TrailerCodecLike
 */

/**
 * Returns the trailer codec with a locally-resolved type shape.
 *
 * @returns {TrailerCodecLike}
 */
function resolveCodec() {
  // getCodec() returns a TrailerCodec from @git-stunts/trailer-codec.
  // The type is unresolvable by ESLint, so we narrow via this wrapper.
  /** @type {unknown} */
  const raw = getCodec();
  return /** @type {TrailerCodecLike} */ (raw);
}

// -----------------------------------------------------------------------------
// Encoder
// -----------------------------------------------------------------------------

/**
 * Encodes a patch commit message.
 *
 * @param {{ graph: string, writer: string, lamport: number, patchOid: string, schema?: number, encrypted?: boolean }} options - The patch message options
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
export function encodePatchMessage({ graph, writer, lamport, patchOid, schema = 2, encrypted = false }) {
  // Validate inputs
  validateGraphName(graph);
  validateWriterId(writer);
  validatePositiveInteger(lamport, 'lamport');
  validateOid(patchOid, 'patchOid');
  validateSchema(schema);

  const codec = resolveCodec();
  const kindKey = /** @type {string} */ (TRAILER_KEYS['kind']);
  const graphKey = /** @type {string} */ (TRAILER_KEYS['graph']);
  const writerKey = /** @type {string} */ (TRAILER_KEYS['writer']);
  const lamportKey = /** @type {string} */ (TRAILER_KEYS['lamport']);
  const patchOidKey = /** @type {string} */ (TRAILER_KEYS['patchOid']);
  const schemaKey = /** @type {string} */ (TRAILER_KEYS['schema']);
  /** @type {Record<string, string>} */
  const trailers = {
    [kindKey]: 'patch',
    [graphKey]: graph,
    [writerKey]: writer,
    [lamportKey]: String(lamport),
    [patchOidKey]: patchOid,
    [schemaKey]: String(schema),
  };
  if (encrypted) {
    const encKey = /** @type {string} */ (TRAILER_KEYS['encrypted']);
    trailers[encKey] = 'true';
  }
  return codec.encode({
    title: /** @type {string} */ (MESSAGE_TITLES['patch']),
    trailers,
  });
}

// -----------------------------------------------------------------------------
// Decoder
// -----------------------------------------------------------------------------

/**
 * Decodes a patch commit message.
 *
 * @param {string} message - The raw commit message
 * @returns {{ kind: 'patch', graph: string, writer: string, lamport: number, patchOid: string, schema: number, encrypted: boolean }} The decoded patch message
 * @throws {Error} If the message is not a valid patch message
 *
 * @example
 * const { kind, graph, writer, lamport, patchOid, schema } = decodePatchMessage(message);
 */
export function decodePatchMessage(message) {
  const codec = resolveCodec();
  const decoded = codec.decode(message);
  const { trailers } = decoded;

  validateKindDiscriminator(trailers, 'patch');
  const graph = requireTrailer(trailers, 'graph', 'patch');
  validateGraphName(graph);
  const writer = requireTrailer(trailers, 'writer', 'patch');
  validateWriterId(writer);
  const lamport = parsePositiveIntTrailer(trailers, 'lamport', 'patch');
  const patchOid = requireTrailer(trailers, 'patchOid', 'patch');
  validateOid(patchOid, 'patchOid');
  const schema = parsePositiveIntTrailer(trailers, 'schema', 'patch');

  const encryptedKey = /** @type {string} */ (TRAILER_KEYS['encrypted']);
  const encrypted = trailers[encryptedKey] === 'true';

  return {
    kind: 'patch',
    graph,
    writer,
    lamport,
    patchOid,
    schema,
    encrypted,
  };
}
