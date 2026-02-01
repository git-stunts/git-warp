/**
 * WARP Message Codec for encoding and decoding WARP commit messages.
 *
 * This module provides functions to encode and decode the three types of
 * WARP (Write-Ahead Reference Protocol) commit messages:
 * - Patch: Contains graph mutations from a single writer
 * - Checkpoint: Contains a snapshot of materialized graph state
 * - Anchor: Marks a merge point in the WARP DAG
 *
 * All messages use Git trailers for structured metadata storage.
 *
 * @module domain/services/WarpMessageCodec
 */

import { TrailerCodec, TrailerCodecService } from '@git-stunts/trailer-codec';
import { validateGraphName, validateWriterId } from '../utils/RefLayout.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Message title prefixes for each WARP commit type.
 * @type {Object<string, string>}
 */
const MESSAGE_TITLES = {
  patch: 'empty-graph:patch',
  checkpoint: 'empty-graph:checkpoint',
  anchor: 'empty-graph:anchor',
};

/**
 * Trailer key prefix for empty-graph trailers.
 * @type {string}
 */
const TRAILER_PREFIX = 'eg-';

/**
 * Standard trailer keys used across WARP messages.
 * @type {Object<string, string>}
 */
const TRAILER_KEYS = {
  kind: 'eg-kind',
  graph: 'eg-graph',
  writer: 'eg-writer',
  lamport: 'eg-lamport',
  patchOid: 'eg-patch-oid',
  stateHash: 'eg-state-hash',
  frontierOid: 'eg-frontier-oid',
  indexOid: 'eg-index-oid',
  schema: 'eg-schema',
  checkpointVersion: 'eg-checkpoint',
};

/**
 * Pattern for valid Git OIDs (40-character hex for SHA-1 or 64-character for SHA-256).
 * @type {RegExp}
 */
const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/**
 * Pattern for valid SHA-256 state hashes (64-character hex).
 * @type {RegExp}
 */
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// -----------------------------------------------------------------------------
// Codec Instance
// -----------------------------------------------------------------------------

// Lazy singleton codec instance
let _codec = null;
function getCodec() {
  if (!_codec) {
    const service = new TrailerCodecService();
    _codec = new TrailerCodec({ service });
  }
  return _codec;
}

// -----------------------------------------------------------------------------
// Validation Helpers
// -----------------------------------------------------------------------------

/**
 * Validates that a value is a valid Git OID.
 * @param {string} oid - The OID to validate
 * @param {string} fieldName - Name of the field for error messages
 * @throws {Error} If the OID is invalid
 */
function validateOid(oid, fieldName) {
  if (typeof oid !== 'string') {
    throw new Error(`Invalid ${fieldName}: expected string, got ${typeof oid}`);
  }
  if (!OID_PATTERN.test(oid)) {
    throw new Error(`Invalid ${fieldName}: must be a 40 or 64 character hex string, got '${oid}'`);
  }
}

/**
 * Validates that a value is a valid SHA-256 hash.
 * @param {string} hash - The hash to validate
 * @param {string} fieldName - Name of the field for error messages
 * @throws {Error} If the hash is invalid
 */
function validateSha256(hash, fieldName) {
  if (typeof hash !== 'string') {
    throw new Error(`Invalid ${fieldName}: expected string, got ${typeof hash}`);
  }
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error(`Invalid ${fieldName}: must be a 64 character hex string, got '${hash}'`);
  }
}

/**
 * Validates that a value is a positive integer.
 * @param {number} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @throws {Error} If the value is not a positive integer
 */
function validatePositiveInteger(value, fieldName) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer, got ${value}`);
  }
}

/**
 * Validates that a schema version is valid.
 * @param {number} schema - The schema version to validate
 * @throws {Error} If the schema version is invalid
 */
function validateSchema(schema) {
  validatePositiveInteger(schema, 'schema');
}

// -----------------------------------------------------------------------------
// Encoders
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

  // Add checkpoint version marker for V5 (schema:2)
  if (schema === 2) {
    trailers[TRAILER_KEYS.checkpointVersion] = 'v5';
  }

  return codec.encode({
    title: MESSAGE_TITLES.checkpoint,
    trailers,
  });
}

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
// Decoders
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

// -----------------------------------------------------------------------------
// Detection Helper
// -----------------------------------------------------------------------------

/**
 * Detects the WARP message kind from a raw commit message.
 *
 * @param {string} message - The raw commit message
 * @returns {'patch'|'checkpoint'|'anchor'|null} The message kind, or null if not a WARP message
 *
 * @example
 * const kind = detectMessageKind(message);
 * if (kind === 'patch') {
 *   const data = decodePatchMessage(message);
 * }
 */
export function detectMessageKind(message) {
  if (typeof message !== 'string') {
    return null;
  }

  try {
    const codec = getCodec();
    const decoded = codec.decode(message);
    const kind = decoded.trailers[TRAILER_KEYS.kind];

    if (kind === 'patch' || kind === 'checkpoint' || kind === 'anchor') {
      return kind;
    }
    return null;
  } catch {
    // Not a valid message format
    return null;
  }
}
